import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getOpportunityStats,
  getTodaysWinner,
  getRecentDailyRuns,
} from '@/lib/opportunity';

// GET /api/opportunity/stats - Get opportunity statistics
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const country = searchParams.get('country') || 'us';

    // Fetch all stats in parallel
    const [stats, todaysWinner, recentRuns] = await Promise.all([
      getOpportunityStats(country),
      getTodaysWinner(country),
      getRecentDailyRuns(7),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        todays_winner: todaysWinner
          ? {
              id: todaysWinner.id,
              keyword: todaysWinner.keyword,
              category: todaysWinner.category,
              opportunity_score: todaysWinner.opportunity_score,
              status: todaysWinner.status,
              selected_at: todaysWinner.selected_at,
            }
          : null,
        recent_runs: recentRuns.map((run) => ({
          id: run.id,
          run_date: run.run_date,
          status: run.status,
          winner_keyword: run.winner_keyword,
          winner_category: run.winner_category,
          winner_score: run.winner_score,
          total_scored: run.total_keywords_scored,
        })),
      },
    });
  } catch (error) {
    console.error('Error getting opportunity stats:', error);
    return NextResponse.json(
      { error: 'Failed to get opportunity stats' },
      { status: 500 }
    );
  }
}
