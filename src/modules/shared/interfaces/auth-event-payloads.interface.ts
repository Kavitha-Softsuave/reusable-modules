export interface UserRegisteredPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  provider: string;
  registeredAt: Date;
}

export interface UserLoggedInPayload {
  userId: string;
  email: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  loggedInAt: Date;
}

export interface UserPasswordResetRequestedPayload {
  userId: string;
  email: string;
  resetToken: string; // raw token — send via email
  expiresAt: Date;
}
