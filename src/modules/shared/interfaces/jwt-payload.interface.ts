export interface JwtPayload {
  sub: string; // user id
  email: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}
