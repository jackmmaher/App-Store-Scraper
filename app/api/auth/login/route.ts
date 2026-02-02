import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createSessionToken } from '@/lib/auth';
import { checkRateLimit, getClientIP, getSecurityHeaders, createSignedToken } from '@/lib/security';

const SESSION_COOKIE_NAME = 'app_store_scraper_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  const securityHeaders = getSecurityHeaders();

  // Rate limit login attempts (stricter: 10 per minute)
  const rateLimit = checkRateLimit(`login:${clientIP}`, 10, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          ...securityHeaders,
          'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400, headers: securityHeaders }
      );
    }

    // Verify password with IP-based rate limiting
    const result = await verifyPassword(password, clientIP);

    if (!result.success) {
      const response: { error: string; lockoutRemaining?: number } = {
        error: result.error || 'Invalid password',
      };

      if (result.lockoutRemaining) {
        response.lockoutRemaining = result.lockoutRemaining;
      }

      return NextResponse.json(response, {
        status: 401,
        headers: securityHeaders,
      });
    }

    // Create session token and signed cookie value
    const token = createSessionToken();
    const signedToken = createSignedToken({ sessionId: token }, SESSION_DURATION);

    // Create response with cookie set directly
    const response = NextResponse.json(
      { success: true },
      { headers: securityHeaders }
    );

    // Set cookie directly on response object
    response.cookies.set(SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better navigation compatibility
      maxAge: SESSION_DURATION / 1000,
      path: '/',
    });

    return response;
  } catch {
    // Log error server-side only, don't expose details to client
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500, headers: securityHeaders }
    );
  }
}
