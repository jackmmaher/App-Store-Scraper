import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createSessionToken, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIP, getSecurityHeaders } from '@/lib/security';

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

    const token = createSessionToken();
    await setSessionCookie(token);

    return NextResponse.json(
      { success: true },
      { headers: securityHeaders }
    );
  } catch {
    // Log error server-side only, don't expose details to client
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500, headers: securityHeaders }
    );
  }
}
