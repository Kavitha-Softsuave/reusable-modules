import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiFoundResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/responses/auth-response.dto';
import { TokensResponseDto } from './dto/responses/tokens-response.dto';
import { UserResponseDto } from './dto/responses/user-response.dto';
import { MessageResponseDto } from './dto/responses/message-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from '../shared/decorators/public.decorator';
import { User } from './entities/user.entity';
import { GoogleProfile } from './strategies/google.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Local Auth ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Register a new account' })
  @ApiCreatedResponse({ type: AuthResponseDto, description: 'Account created. Returns user profile and JWT pair.' })
  @ApiConflictResponse({ description: 'Email is already registered.' })
  @ApiBadRequestResponse({ description: 'Validation failed (invalid email, weak password, missing fields).' })
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ type: AuthResponseDto, description: 'Login successful. Returns user profile and JWT pair.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or account disabled.' })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for a new access + refresh token pair. The old refresh token is immediately revoked (rotation).',
  })
  @ApiOkResponse({ type: TokensResponseDto, description: 'New token pair issued.' })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid, expired, or already revoked.' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Logout — revoke current session' })
  @ApiOkResponse({ type: MessageResponseDto, description: 'Session and refresh token revoked.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@CurrentUser() user: User & { sessionId: string }) {
    return this.authService.logout(user.id, user.sessionId);
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Authenticated user profile.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: User & { sessionId: string }) {
    return this.authService.getMe(user.id);
  }

  // ─── Password Reset ───────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Emits `user.password_reset_requested` event with a one-time token. ' +
      'The Notifications module listens and delivers it via email. ' +
      'Always returns 200 to prevent email enumeration.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed (invalid email format).' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @ApiOperation({
    summary: 'Reset password using the one-time token',
    description: 'Token expires in 1 hour. All existing sessions are invalidated on success.',
  })
  @ApiOkResponse({ type: MessageResponseDto, description: 'Password changed. All sessions revoked.' })
  @ApiBadRequestResponse({ description: 'Token is invalid or expired.' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── Google OAuth2 ────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Initiate Google OAuth2 login',
    description: 'Redirects the browser to Google\'s consent screen. Not callable directly from Swagger — open in a browser tab.',
  })
  @ApiFoundResponse({ description: 'Redirect to Google consent screen.' })
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {
    // Passport handles the redirect automatically
  }

  @ApiOperation({
    summary: 'Google OAuth2 callback',
    description:
      'Google redirects here after consent. Creates or finds the user, then redirects the client to ' +
      '`CLIENT_URL/auth/callback?accessToken=...&refreshToken=...`. ' +
      'In production, prefer httpOnly cookies over query params.',
  })
  @ApiFoundResponse({ description: 'Redirect to CLIENT_URL/auth/callback with JWT tokens as query params.' })
  @ApiUnauthorizedResponse({ description: 'OAuth2 flow failed or was denied.' })
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfile;
    const result = await this.authService.googleLogin(
      profile,
      req.ip,
      req.headers['user-agent'],
    );

    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
    const url = new URL(`${clientUrl}/auth/callback`);
    url.searchParams.set('accessToken', result.accessToken);
    url.searchParams.set('refreshToken', result.refreshToken);

    return res.redirect(url.toString());
  }
}
