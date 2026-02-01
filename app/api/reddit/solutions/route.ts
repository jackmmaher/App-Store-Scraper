import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { saveUnmetNeedSolutions, getRedditAnalysisById } from '@/lib/supabase';

interface SolutionInput {
  needId: string;
  notes: string;
}

interface SaveSolutionsRequest {
  analysisId: string;
  solutions: SolutionInput[];
}

// PUT /api/reddit/solutions - Save user solution annotations for unmet needs
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as SaveSolutionsRequest;

    // Validate required fields
    if (!body.analysisId || typeof body.analysisId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid analysisId' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.solutions)) {
      return NextResponse.json(
        { error: 'solutions must be an array' },
        { status: 400 }
      );
    }

    // Validate each solution entry
    for (const solution of body.solutions) {
      if (!solution.needId || typeof solution.needId !== 'string') {
        return NextResponse.json(
          { error: 'Each solution must have a valid needId' },
          { status: 400 }
        );
      }
      if (typeof solution.notes !== 'string') {
        return NextResponse.json(
          { error: 'Each solution must have notes as a string' },
          { status: 400 }
        );
      }
    }

    console.log('[Reddit Solutions] Saving', body.solutions.length, 'solutions for analysis:', body.analysisId);

    // Verify the analysis exists
    const analysis = await getRedditAnalysisById(body.analysisId);
    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Save the solutions (uses upsert pattern)
    const success = await saveUnmetNeedSolutions(body.analysisId, body.solutions);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save solutions' },
        { status: 500 }
      );
    }

    console.log('[Reddit Solutions] Saved successfully');

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[Reddit Solutions] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save solutions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
