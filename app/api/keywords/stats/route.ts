import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getKeywordStats, getRecentJobs } from '@/lib/keywords/db';

// GET /api/keywords/stats - Get keyword statistics
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const country = request.nextUrl.searchParams.get('country') || 'us';

    const [stats, recentJobs] = await Promise.all([
      getKeywordStats(country),
      getRecentJobs(10),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentJobs,
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}
