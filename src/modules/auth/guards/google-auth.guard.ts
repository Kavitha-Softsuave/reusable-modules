import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * GoogleAuthGuard — triggers the Google OAuth2 redirect or handles the callback.
 * Applied explicitly on /auth/google and /auth/google/callback routes.
 * The global JwtAuthGuard is bypassed on these routes via @Public().
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
