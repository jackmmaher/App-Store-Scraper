import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { generateRedditSearchConfig } from '@/lib/reddit/config-generator';

// POST /api/reddit/generate-config - Generate Reddit search config for a competitor
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { competitorId } = body;

    if (!competitorId || typeof competitorId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid competitorId' },
        { status: 400 }
      );
    }

    const config = await generateRedditSearchConfig(competitorId);

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error) {
    console.error('Error generating Reddit config:', error);

    const message = error instanceof Error ? error.message : 'Failed to generate config';

    // Handle specific error cases
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
