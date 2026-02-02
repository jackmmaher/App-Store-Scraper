/**
 * Security Utilities Library
 *
 * Provides secure authentication, rate limiting, and input validation
 * to protect against common web security vulnerabilities.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const BCRYPT_ROUNDS = 12;
const SESSION_TOKEN_BYTES = 32;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockExpiry?: number;
}

// In-memory rate limit store (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();
const loginAttemptStore = new Map<string, { attempts: number; lastAttempt: number; lockoutExpiry?: number }>();

/**
 * Check if a request should be rate limited
 * @param identifier - IP address or user ID
 * @param maxRequests - Maximum requests per window (default: 60)
 * @param windowMs - Time window in milliseconds (default: 60000)
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = MAX_REQUESTS_PER_WINDOW,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
      blocked: false,
    });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.blocked && entry.blockExpiry && now < entry.blockExpiry) {
    return { allowed: false, remaining: 0, resetIn: entry.blockExpiry - now };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    entry.blocked = true;
    entry.blockExpiry = now + windowMs;
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetIn: entry.resetTime - now,
  };
}

function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime && (!entry.blockExpiry || now > entry.blockExpiry)) {
      rateLimitStore.delete(key);
    }
  }
}

// ============================================================================
// Login Attempt Tracking
// ============================================================================

/**
 * Check if an IP is locked out due to too many failed login attempts
 */
export function isLoginLocked(ip: string): boolean {
  const entry = loginAttemptStore.get(ip);
  if (!entry) return false;

  if (entry.lockoutExpiry && Date.now() < entry.lockoutExpiry) {
    return true;
  }

  // Lockout expired, reset
  if (entry.lockoutExpiry && Date.now() >= entry.lockoutExpiry) {
    loginAttemptStore.delete(ip);
  }

  return false;
}

/**
 * Record a failed login attempt
 */
export function recordFailedLogin(ip: string): void {
  const entry = loginAttemptStore.get(ip) || { attempts: 0, lastAttempt: 0 };
  entry.attempts++;
  entry.lastAttempt = Date.now();

  if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
    entry.lockoutExpiry = Date.now() + LOGIN_LOCKOUT_DURATION_MS;
  }

  loginAttemptStore.set(ip, entry);
}

/**
 * Clear login attempts on successful login
 */
export function clearLoginAttempts(ip: string): void {
  loginAttemptStore.delete(ip);
}

/**
 * Get remaining lockout time in seconds
 */
export function getLockoutRemaining(ip: string): number {
  const entry = loginAttemptStore.get(ip);
  if (!entry || !entry.lockoutExpiry) return 0;
  const remaining = entry.lockoutExpiry - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// ============================================================================
// Password Security
// ============================================================================

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash using constant-time comparison
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns True if password matches
 */
export async function verifyPasswordHash(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ============================================================================
// Session Token Generation
// ============================================================================

/**
 * Generate a cryptographically secure session token
 * @returns Secure random token as hex string
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

/**
 * Generate a signed session token with expiry
 * @param payload - Data to include in token
 * @param expiryMs - Token expiry in milliseconds
 * @returns Signed token string
 */
export function createSignedToken(payload: Record<string, unknown>, expiryMs: number): string {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'default-secret';
  const expiry = Date.now() + expiryMs;
  const data = JSON.stringify({ ...payload, exp: expiry });
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + signature;
}

/**
 * Verify and decode a signed token
 * @param token - Signed token string
 * @returns Decoded payload or null if invalid/expired
 */
export function verifySignedToken(token: string): Record<string, unknown> | null {
  try {
    const [dataB64, signature] = token.split('.');
    if (!dataB64 || !signature) return null;

    const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'default-secret';
    const data = Buffer.from(dataB64, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');

    if (!constantTimeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Token expired
    }

    return payload;
  } catch {
    return null;
  }
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate subreddit name to prevent URL injection
 */
export function validateSubreddit(subreddit: string): boolean {
  // Reddit subreddit names: 3-21 alphanumeric characters or underscores
  return /^[a-zA-Z0-9_]{2,21}$/.test(subreddit);
}

/**
 * Validate country code (ISO 3166-1 alpha-2)
 */
export function validateCountryCode(country: string): boolean {
  return /^[a-zA-Z]{2}$/.test(country);
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Validate App Store app ID (numeric)
 */
export function validateAppId(appId: string): boolean {
  return /^\d{1,15}$/.test(appId);
}

/**
 * Sanitize string for safe logging (removes potential log injection)
 */
export function sanitizeForLogging(str: string): string {
  return str
    .replace(/[\r\n]/g, ' ') // Remove newlines
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable chars
    .slice(0, 200); // Limit length
}

// ============================================================================
// Security Headers
// ============================================================================

/**
 * Get recommended security headers for responses
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return '127.0.0.1';
}

/**
 * Check if request is from localhost
 */
export function isLocalhost(request: Request): boolean {
  const ip = getClientIP(request);
  const host = request.headers.get('host') || '';

  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1')
  );
}
