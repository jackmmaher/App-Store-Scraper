import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { scoreKeyword } from '@/lib/keywords/scoring';
import { upsertKeyword, getKeyword, saveKeywordRankings, recordKeywordHistory } from '@/lib/keywords/db';

// POST /api/keywords/score - Score a single keyword
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keyword, country = 'us', source_app_id, discovered_via } = body as {
      keyword: string;
      country?: string;
      source_app_id?: string;
      discovered_via?: string;
    };

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { error: 'keyword is required' },
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

    // Score the keyword
    const scores = await scoreKeyword(normalizedKeyword, country);

    // Save to database with discovery metadata
    const savedKeyword = await upsertKeyword(normalizedKeyword, country, scores, {
      discovered_via: discovered_via || 'manual',
      source_app_id,
    });

    // Save rankings if we have a keyword ID
    if (savedKeyword && scores.top_10_apps.length > 0) {
      await saveKeywordRankings(
        savedKeyword.id,
        scores.top_10_apps.map((app, idx) => ({
          app_id: app.id,
          rank_position: idx + 1,
          has_keyword_in_title: app.has_keyword_in_title,
          app_name: app.name,
          app_review_count: app.reviews,
          app_rating: app.rating,
          app_icon_url: app.icon_url,
        }))
      );

      // Record history
      await recordKeywordHistory(
        savedKeyword.id,
        scores.volume_score,
        scores.difficulty_score,
        scores.opportunity_score
      );
    }

    return NextResponse.json({
      success: true,
      data: scores,
      saved: savedKeyword !== null,
    });
  } catch (error) {
    console.error('Error scoring keyword:', error);
    return NextResponse.json(
      { error: 'Failed to score keyword' },
      { status: 500 }
    );
  }
}

// GET /api/keywords/score?keyword=xxx&country=us - Get existing score
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword');
    const country = searchParams.get('country') || 'us';

    if (!keyword) {
      return NextResponse.json(
        { error: 'keyword query parameter is required' },
        { status: 400 }
      );
    }

    const existingKeyword = await getKeyword(keyword, country);

    if (!existingKeyword) {
      return NextResponse.json(
        { error: 'Keyword not found. Use POST to score it.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: existingKeyword,
    });
  } catch (error) {
    console.error('Error getting keyword:', error);
    return NextResponse.json(
      { error: 'Failed to get keyword' },
      { status: 500 }
    );
  }
}
