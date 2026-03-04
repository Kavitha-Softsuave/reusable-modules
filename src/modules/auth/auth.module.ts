import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { User } from './entities/user.entity';
import { Session } from './entities/session.entity';
import { RefreshToken } from './entities/refresh-token.entity';

/**
 * AuthModule — self-contained auth with JWT + Google OAuth2.
 *
 * Drop this folder into any NestJS project, add the required .env variables,
 * import AuthModule in app.module.ts, and run migrations.
 *
 * Exports:
 *  - AuthService   → other modules can call getUserById(), etc.
 *  - JwtAuthGuard  → use on individual routes in other modules
 *  - TypeOrmModule → exposes User/Session/RefreshToken repositories
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // JwtModule registered without a default secret.
    // Each signAsync() call passes its own secret — supports dual-secret
    // pattern (access vs. refresh) without extra libraries.
    JwtModule.register({}),
    TypeOrmModule.forFeature([User, Session, RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    GoogleAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, TypeOrmModule],
})
export class AuthModule {}
