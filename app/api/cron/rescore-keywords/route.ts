import { NextRequest, NextResponse } from 'next/server';
import { getStaleKeywords, createKeywordJob } from '@/lib/keywords/db';

export const runtime = 'nodejs';

// GET /api/cron/rescore-keywords - Queue stale keywords for rescoring
// Should be called by cron daily at 4 AM
export async function GET(request: NextRequest) {
  // Verify cron secret (if configured)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const country = request.nextUrl.searchParams.get('country') || 'us';
    const staleDays = Number(request.nextUrl.searchParams.get('stale_days')) || 7;

    // Get keywords that haven't been scored in staleDays
    const staleKeywords = await getStaleKeywords(country, staleDays, 500);

    if (staleKeywords.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stale keywords to rescore',
        queued: 0,
      });
    }

    // Create a bulk scoring job
    const job = await createKeywordJob('score_bulk', {
      keywords: staleKeywords.map((k) => k.keyword),
      country,
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Failed to create rescore job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Queued ${staleKeywords.length} keywords for rescoring`,
      queued: staleKeywords.length,
      job_id: job.id,
    });
  } catch (error) {
    console.error('Error queuing rescore job:', error);
    return NextResponse.json(
      { error: 'Failed to queue rescore job' },
      { status: 500 }
    );
  }
}
