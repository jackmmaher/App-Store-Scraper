import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { searchOpportunities, OpportunityStatus } from '@/lib/opportunity';

// GET /api/opportunity/search - Search opportunities with filters
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const params = {
      q: searchParams.get('q') || undefined,
      category: searchParams.get('category') || undefined,
      country: searchParams.get('country') || 'us',
      status: (searchParams.get('status') as OpportunityStatus) || undefined,
      sort: (searchParams.get('sort') as 'opportunity_score' | 'competition_gap' | 'market_demand' | 'revenue_potential' | 'trend_momentum' | 'scored_at') || 'opportunity_score',
      sort_dir: (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc',
      min_score: searchParams.get('min_score')
        ? parseFloat(searchParams.get('min_score')!)
        : undefined,
      max_score: searchParams.get('max_score')
        ? parseFloat(searchParams.get('max_score')!)
        : undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '50', 10), 100),
    };

    const result = await searchOpportunities(params);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error searching opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to search opportunities' },
      { status: 500 }
    );
  }
}
