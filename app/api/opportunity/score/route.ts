import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  scoreOpportunity,
  upsertOpportunity,
  getOpportunity,
  recordOpportunityHistory,
} from '@/lib/opportunity';

// POST /api/opportunity/score - Score a single opportunity
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keyword, category, country = 'us' } = body as {
      keyword: string;
      category: string;
      country?: string;
    };

    // Validate inputs
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { error: 'keyword is required' },
        { status: 400 }
      );
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      );
    }

    const normalizedKeyword = keyword.toLowerCase().trim();
    if (normalizedKeyword.length < 2 || normalizedKeyword.length > 100) {
      return NextResponse.json(
        { error: 'keyword must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    // Score the opportunity
    const result = await scoreOpportunity(normalizedKeyword, category, country);

    // Save to database
    const savedOpportunity = await upsertOpportunity(result);

    // Record history if saved
    if (savedOpportunity) {
      await recordOpportunityHistory(savedOpportunity.id, result);
    }

    return NextResponse.json({
      success: true,
      data: {
        keyword: result.keyword,
        opportunity_score: result.opportunity_score,
        dimensions: result.dimensions,
        reasoning: result.reasoning,
        top_competitor_weaknesses: result.top_competitor_weaknesses,
        suggested_differentiator: result.suggested_differentiator,
      },
      saved: savedOpportunity !== null,
    });
  } catch (error) {
    console.error('Error scoring opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to score opportunity' },
      { status: 500 }
    );
  }
}

// GET /api/opportunity/score?keyword=xxx&category=yyy&country=us - Get existing score
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword');
    const category = searchParams.get('category');
    const country = searchParams.get('country') || 'us';

    if (!keyword) {
      return NextResponse.json(
        { error: 'keyword query parameter is required' },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'category query parameter is required' },
        { status: 400 }
      );
    }

    const existingOpportunity = await getOpportunity(keyword, category, country);

    if (!existingOpportunity) {
      return NextResponse.json(
        { error: 'Opportunity not found. Use POST to score it.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: existingOpportunity,
    });
  } catch (error) {
    console.error('Error getting opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to get opportunity' },
      { status: 500 }
    );
  }
}
