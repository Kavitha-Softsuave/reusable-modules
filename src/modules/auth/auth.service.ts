import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { User, AuthProvider } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { JwtPayload } from '../shared/interfaces/jwt-payload.interface';
import {
  UserRegisteredPayload,
  UserLoggedInPayload,
  UserPasswordResetRequestedPayload,
} from '../shared/interfaces/auth-event-payloads.interface';
import { hashPassword, comparePassword, hashToken } from '../shared/utils/hash.util';

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(RefreshToken) private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Email is already registered');
    }

    const hashed = await hashPassword(dto.password);
    const user = this.userRepo.create({
      email: dto.email,
      password: hashed,
      firstName: dto.firstName,
      lastName: dto.lastName,
      provider: AuthProvider.LOCAL,
    });
    await this.userRepo.save(user);

    const tokens = await this.createSession(user, ipAddress, userAgent);

    this.events.emit('user.registered', {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      provider: user.provider,
      registeredAt: new Date(),
    } satisfies UserRegisteredPayload);

    return { user: this.sanitize(user), ...tokens };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Explicitly select password (select:false column)
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.provider !== AuthProvider.LOCAL || !user.password) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google.',
      );
    }

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.createSession(user, ipAddress, userAgent);

    this.events.emit('user.logged_in', {
      userId: user.id,
      email: user.email,
      sessionId: tokens.sessionId,
      ipAddress,
      userAgent,
      loggedInAt: new Date(),
    } satisfies UserLoggedInPayload);

    return { user: this.sanitize(user), ...tokens };
  }

  // ─── Google Login ─────────────────────────────────────────────────────────────

  async googleLogin(profile: GoogleProfile, ipAddress?: string, userAgent?: string) {
    let user = await this.userRepo.findOne({ where: { googleId: profile.googleId } });

    if (!user) {
      const existing = await this.userRepo.findOne({ where: { email: profile.email } });

      if (existing) {
        // Link Google to an existing local account
        existing.googleId = profile.googleId;
        existing.provider = AuthProvider.GOOGLE;
        existing.isEmailVerified = true;
        user = await this.userRepo.save(existing);
      } else {
        // Brand-new user via Google
        user = await this.userRepo.save(
          this.userRepo.create({
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            googleId: profile.googleId,
            provider: AuthProvider.GOOGLE,
            isEmailVerified: true,
          }),
        );

        this.events.emit('user.registered', {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          provider: user.provider,
          registeredAt: new Date(),
        } satisfies UserRegisteredPayload);
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.createSession(user, ipAddress, userAgent);

    this.events.emit('user.logged_in', {
      userId: user.id,
      email: user.email,
      sessionId: tokens.sessionId,
      ipAddress,
      userAgent,
      loggedInAt: new Date(),
    } satisfies UserLoggedInPayload);

    return { user: this.sanitize(user), ...tokens };
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string) {
    // 1. Verify JWT signature & expiry
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Find the stored record by its SHA-256 hash
    const tokenHash = hashToken(rawRefreshToken);
    const record = await this.refreshTokenRepo.findOne({
      where: {
        tokenHash,
        sessionId: payload.sessionId,
        userId: payload.sub,
        isRevoked: false,
      },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token not found or expired');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub, isActive: true } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 3. Rotate — revoke old, issue new (token family pattern)
    await this.refreshTokenRepo.update(record.id, { isRevoked: true });

    const accessToken = await this.signAccessToken(user, payload.sessionId);
    const newRefreshToken = await this.signAndStoreRefreshToken(user, payload.sessionId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string, sessionId: string) {
    await this.sessionRepo.update({ id: sessionId, userId }, { isActive: false });
    await this.refreshTokenRepo.update({ sessionId, userId }, { isRevoked: true });
    return { message: 'Logged out successfully' };
  }

  // ─── Forgot Password ──────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    // Always return the same message to prevent email enumeration
    const user = await this.userRepo.findOne({ where: { email } });

    if (user && user.provider === AuthProvider.LOCAL) {
      const rawToken = crypto.randomUUID();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.userRepo
        .createQueryBuilder()
        .update(User)
        .set({ passwordResetToken: tokenHash, passwordResetExpires: expiresAt })
        .where('id = :id', { id: user.id })
        .execute();

      this.events.emit('user.password_reset_requested', {
        userId: user.id,
        email: user.email,
        resetToken: rawToken, // send this raw token via email
        expiresAt,
      } satisfies UserPasswordResetRequestedPayload);
    }

    return { message: 'If that email exists, a password reset link has been sent.' };
  }

  // ─── Reset Password ───────────────────────────────────────────────────────────

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);

    // Look up by hash — passwordResetToken is select:false so use QueryBuilder
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordResetToken')
      .where('user.passwordResetToken = :hash', { hash: tokenHash })
      .andWhere('user.passwordResetExpires > :now', { now: new Date() })
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const hashed = await hashPassword(newPassword);

    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({
        password: hashed,
        passwordResetToken: () => 'NULL',
        passwordResetExpires: () => 'NULL',
      })
      .where('id = :id', { id: user.id })
      .execute();

    // Invalidate all sessions after password change
    await this.sessionRepo.update({ userId: user.id }, { isActive: false });
    await this.refreshTokenRepo.update({ userId: user.id }, { isRevoked: true });

    return { message: 'Password reset successfully. Please log in again.' };
  }

  // ─── Get Me ───────────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /**
   * Creates a DB session row and issues both access + refresh tokens.
   */
  private async createSession(
    user: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenSet> {
    const sessionDays = this.config.get<number>('SESSION_EXPIRES_DAYS', 7);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + sessionDays);

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({ userId: user.id, ipAddress, userAgent, expiresAt }),
    );

    const accessToken = await this.signAccessToken(user, session.id);
    const refreshToken = await this.signAndStoreRefreshToken(user, session.id);

    return { accessToken, refreshToken, sessionId: session.id };
  }

  private async signAccessToken(user: User, sessionId: string): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email, sessionId };
    return this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as never,
    });
  }

  private async signAndStoreRefreshToken(user: User, sessionId: string): Promise<string> {
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const payload: JwtPayload = { sub: user.id, email: user.email, sessionId };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: expiresIn as never,
    });

    // Parse "7d" → days number for the DB expiry column
    const days = parseInt(expiresIn, 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        sessionId,
        tokenHash: hashToken(token),
        expiresAt,
      }),
    );

    return token;
  }

  /** Strip sensitive fields before returning user data to the client. */
  private sanitize(user: User): Omit<User, 'password' | 'passwordResetToken' | 'passwordResetExpires'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, passwordResetToken, passwordResetExpires, ...safe } = user as User & {
      password?: string;
      passwordResetToken?: string;
    };
    return safe as Omit<User, 'password' | 'passwordResetToken' | 'passwordResetExpires'>;
  }
}
