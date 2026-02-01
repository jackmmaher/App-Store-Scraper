import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getRedditAnalysis, getUnmetNeedSolutions } from '@/lib/supabase';

// GET /api/reddit/analysis/[competitorId] - Fetch existing analysis for a competitor
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ competitorId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { competitorId } = await params;

  if (!competitorId || typeof competitorId !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid competitorId' },
      { status: 400 }
    );
  }

  try {
    console.log('[Reddit Analysis GET] Fetching for competitor:', competitorId);

    // Fetch the analysis
    const analysis = await getRedditAnalysis(competitorId);

    if (!analysis) {
      return NextResponse.json(
        { error: 'No analysis found for this competitor' },
        { status: 404 }
      );
    }

    console.log('[Reddit Analysis GET] Found analysis:', analysis.id);

    // Fetch solution annotations for this analysis
    const solutions = await getUnmetNeedSolutions(analysis.id);
    console.log('[Reddit Analysis GET] Found', solutions.length, 'solutions');

    // Merge solutions into unmetNeeds array
    const unmetNeedsWithSolutions = analysis.unmetNeeds.map((need) => {
      const solution = solutions.find((s) => s.needId === need.id);
      return {
        ...need,
        solutionNotes: solution?.notes || need.solutionNotes,
      };
    });

    // Return the analysis with merged solutions
    return NextResponse.json({
      success: true,
      analysis: {
        ...analysis,
        unmetNeeds: unmetNeedsWithSolutions,
      },
    });
  } catch (error) {
    console.error('[Reddit Analysis GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analysis';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
