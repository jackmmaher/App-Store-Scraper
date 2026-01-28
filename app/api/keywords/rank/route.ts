import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

interface SearchResult {
  trackId: number;
  trackName: string;
  bundleId: string;
  sellerName: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl100: string;
  trackViewUrl: string;
}

// POST /api/keywords/rank - Check app ranking for a keyword
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keyword, appId, country = 'us' } = body as {
      keyword: string;
      appId: string;
      country?: string;
    };

    if (!keyword || !appId) {
      return NextResponse.json(
        { error: 'keyword and appId are required' },
        { status: 400 }
      );
    }

    // Search iTunes API
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${country}&entity=software&limit=200`;

    const response = await fetch(searchUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to search App Store' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const results: SearchResult[] = data.results || [];

    // Find the app's position
    const position = results.findIndex(
      (result) => result.trackId.toString() === appId
    );

    // Get top 10 competitors for this keyword
    const topApps = results.slice(0, 10).map((result, index) => ({
      rank: index + 1,
      id: result.trackId.toString(),
      name: result.trackName,
      developer: result.sellerName,
      rating: result.averageUserRating,
      reviews: result.userRatingCount,
      icon: result.artworkUrl100,
      url: result.trackViewUrl,
      isTarget: result.trackId.toString() === appId,
    }));

    return NextResponse.json({
      keyword,
      country,
      appId,
      ranking: position >= 0 ? position + 1 : null,
      totalResults: results.length,
      topApps,
      found: position >= 0,
      message: position >= 0
        ? `App ranks #${position + 1} for "${keyword}"`
        : `App not found in top ${results.length} results for "${keyword}"`,
    });
  } catch (error) {
    console.error('Error checking keyword rank:', error);
    return NextResponse.json(
      { error: 'Failed to check keyword ranking' },
      { status: 500 }
    );
  }
}
