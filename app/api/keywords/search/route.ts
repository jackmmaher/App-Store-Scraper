import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { searchKeywords } from '@/lib/keywords/db';
import { DiscoveryMethod } from '@/lib/keywords/types';

// GET /api/keywords/search - Search and filter keywords
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const params = {
      q: searchParams.get('q') || undefined,
      country: searchParams.get('country') || 'us',
      sort: (searchParams.get('sort') as 'opportunity' | 'volume' | 'difficulty' | 'created_at') || 'opportunity',
      sort_dir: (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc',
      min_volume: searchParams.get('min_volume') ? Number(searchParams.get('min_volume')) : undefined,
      max_volume: searchParams.get('max_volume') ? Number(searchParams.get('max_volume')) : undefined,
      min_difficulty: searchParams.get('min_difficulty') ? Number(searchParams.get('min_difficulty')) : undefined,
      max_difficulty: searchParams.get('max_difficulty') ? Number(searchParams.get('max_difficulty')) : undefined,
      min_opportunity: searchParams.get('min_opportunity') ? Number(searchParams.get('min_opportunity')) : undefined,
      discovered_via: searchParams.get('discovered_via') as DiscoveryMethod | undefined,
      page: (() => {
        const rawPage = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
        return Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      })(),
      limit: (() => {
        const rawLimit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
        return Number.isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 100);
      })(),
    };

    // Validate sort parameter
    const validSorts = ['opportunity', 'volume', 'difficulty', 'created_at'];
    if (!validSorts.includes(params.sort)) {
      params.sort = 'opportunity';
    }

    // Validate sort_dir
    if (params.sort_dir !== 'asc' && params.sort_dir !== 'desc') {
      params.sort_dir = 'desc';
    }

    const results = await searchKeywords(params);

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error searching keywords:', error);
    return NextResponse.json(
      { error: 'Failed to search keywords' },
      { status: 500 }
    );
  }
}
