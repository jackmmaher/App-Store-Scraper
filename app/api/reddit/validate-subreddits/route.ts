import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

// POST /api/reddit/validate-subreddits - Validate subreddits and discover related ones
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { subreddits } = body;

    // Validate input
    if (!Array.isArray(subreddits) || subreddits.length === 0) {
      return NextResponse.json(
        { error: 'subreddits must be a non-empty array' },
        { status: 400 }
      );
    }

    // Clean subreddit names (remove r/ prefix if present)
    const cleanedSubreddits = subreddits.map((s: string) =>
      s.replace(/^r\//, '').trim()
    ).filter(Boolean);

    console.log('[Validate Subreddits] Validating:', cleanedSubreddits);

    // Call crawl-service to validate
    const crawlServiceUrl = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';
    const crawlResponse = await fetch(`${crawlServiceUrl}/crawl/reddit/validate-subreddits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CRAWL_SERVICE_API_KEY || '',
      },
      body: JSON.stringify({
        subreddits: cleanedSubreddits,
      }),
      signal: AbortSignal.timeout(60000), // 1 minute timeout
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error('[Validate Subreddits] Crawl service error:', errorText);
      return NextResponse.json(
        { error: `Crawl service error: ${crawlResponse.status}` },
        { status: 502 }
      );
    }

    const result = await crawlResponse.json();
    console.log('[Validate Subreddits] Result:', {
      valid: result.valid?.length || 0,
      invalid: result.invalid?.length || 0,
      discovered: result.discovered?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Validate Subreddits] Error:', error);

    // Handle timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Validation timed out. Try with fewer subreddits.' },
        { status: 504 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to validate subreddits';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
