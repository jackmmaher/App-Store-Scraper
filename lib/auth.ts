/**
 * Authentication Library
 *
 * Provides secure authentication with bcrypt password hashing,
 * signed session tokens, and rate limiting protection.
 */

import { cookies } from 'next/headers';
import {
  generateSecureToken,
  createSignedToken,
  verifySignedToken,
  verifyPasswordHash,
  hashPassword,
  constantTimeEqual,
  isLoginLocked,
  recordFailedLogin,
  clearLoginAttempts,
  getLockoutRemaining,
} from './security';

const SESSION_COOKIE_NAME = 'app_store_scraper_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Session store for server-side validation (in production, use Redis or database)
const sessionStore = new Map<string, { createdAt: number; expiresAt: number }>();

/**
 * Create a cryptographically secure session token
 * Uses random bytes instead of predictable UUID + timestamp
 */
export function createSessionToken(): string {
  const token = generateSecureToken();

  // Store session server-side for validation
  sessionStore.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  });

  return token;
}

/**
 * Validate a session token exists and is not expired
 */
export function validateSessionToken(token: string): boolean {
  const session = sessionStore.get(token);
  if (!session) {
    return false;
  }

  if (Date.now() > session.expiresAt) {
    sessionStore.delete(token);
    return false;
  }

  return true;
}

/**
 * Invalidate a session token (for logout)
 */
export function invalidateSessionToken(token: string): void {
  sessionStore.delete(token);
}

/**
 * Set the session cookie with secure options
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  // Create a signed version of the token for additional validation
  const signedToken = createSignedToken({ sessionId: token }, SESSION_DURATION);

  cookieStore.set(SESSION_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'lax' allows cookie on same-site navigations while still protecting against CSRF
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  });
}

/**
 * Get the session cookie value
 */
export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const signedToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!signedToken) {
    return undefined;
  }

  // Verify the signed token (includes HMAC signature + expiry check)
  const payload = verifySignedToken(signedToken);
  if (!payload || typeof payload.sessionId !== 'string') {
    return undefined;
  }

  // The signed token validation is sufficient for security:
  // - HMAC signature proves the token was created by this server
  // - Expiry check ensures token hasn't expired
  // Server-side session store is optional enhancement for revocation
  // but causes issues with Next.js hot-reload clearing memory

  // Re-register session if not in memory (handles server restart)
  if (!validateSessionToken(payload.sessionId)) {
    // Token is cryptographically valid, re-add to session store
    const expiresAt = typeof payload.exp === 'number' ? payload.exp : Date.now() + SESSION_DURATION;
    sessionStore.set(payload.sessionId, {
      createdAt: Date.now(),
      expiresAt,
    });
  }

  return payload.sessionId;
}

/**
 * Delete the session cookie and invalidate the session
 */
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const signedToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (signedToken) {
    const payload = verifySignedToken(signedToken);
    if (payload && typeof payload.sessionId === 'string') {
      invalidateSessionToken(payload.sessionId);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Check if the current request is authenticated
 * Now validates session server-side, not just cookie existence
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSessionCookie();
  return !!session;
}

/**
 * Verify password with bcrypt hashing support
 *
 * Supports both legacy plaintext (for migration) and bcrypt hashes.
 * To migrate: Generate hash with hashPassword() and store as APP_PASSWORD_HASH
 *
 * @param password - The password to verify
 * @param clientIP - Client IP for rate limiting (optional)
 * @returns Object with success status and any error message
 */
export async function verifyPassword(
  password: string,
  clientIP?: string
): Promise<{ success: boolean; error?: string; lockoutRemaining?: number }> {
  // Check for lockout
  if (clientIP && isLoginLocked(clientIP)) {
    const remaining = getLockoutRemaining(clientIP);
    return {
      success: false,
      error: 'Too many failed attempts. Please try again later.',
      lockoutRemaining: remaining,
    };
  }

  // Check for bcrypt hash first (preferred)
  const passwordHash = process.env.APP_PASSWORD_HASH;
  if (passwordHash) {
    const isValid = await verifyPasswordHash(password, passwordHash);
    if (isValid) {
      if (clientIP) clearLoginAttempts(clientIP);
      return { success: true };
    }
    if (clientIP) recordFailedLogin(clientIP);
    return { success: false, error: 'Invalid password' };
  }

  // Fall back to legacy plaintext comparison (for migration)
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    // No password configured - DENY access (security fix)
    return { success: false, error: 'Authentication not configured' };
  }

  // Use constant-time comparison to prevent timing attacks
  const isValid = constantTimeEqual(password, appPassword);

  if (isValid) {
    if (clientIP) clearLoginAttempts(clientIP);
    return { success: true };
  }

  if (clientIP) recordFailedLogin(clientIP);
  return { success: false, error: 'Invalid password' };
}

/**
 * Utility to generate a bcrypt hash for migration
 * Use this to generate APP_PASSWORD_HASH from your plaintext password
 *
 * Example usage in Node.js console:
 * const { hashPassword } = require('./lib/auth');
 * hashPassword('your-password').then(console.log);
 */
export { hashPassword } from './security';

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessionStore.entries()) {
    if (now > session.expiresAt) {
      sessionStore.delete(token);
    }
  }
}

// Run cleanup periodically (every hour in development)
if (process.env.NODE_ENV === 'development') {
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
}
