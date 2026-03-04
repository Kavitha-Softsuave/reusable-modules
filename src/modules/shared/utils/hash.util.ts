import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/** Hash a user password with bcrypt (12 rounds). Use for passwords only. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Compare a plain password against a bcrypt hash. */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a high-entropy token (refresh token, reset token) with SHA-256.
 * Fast and safe for random tokens — not suitable for user-chosen passwords.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
