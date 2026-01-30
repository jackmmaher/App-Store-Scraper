import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  scoreOpportunity,
  scoreOpportunities,
  rankOpportunities,
  upsertOpportunity,
  recordOpportunityHistory,
  searchOpportunities,
  RankedOpportunity,
  DEFAULT_CONFIG,
} from '@/lib/opportunity';
import { expandSeedKeyword } from '@/lib/keywords/autosuggest';

// POST /api/opportunity/discover - Discover and rank opportunities in a category
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      category,
      country = 'us',
      limit = DEFAULT_CONFIG.TOP_OPPORTUNITIES_LIMIT,
      seeds = [],
    } = body as {
      category: string;
      country?: string;
      limit?: number;
      seeds?: string[];
    };

    // Validate inputs
    if (!category || typeof category !== 'string') {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      );
    }

    // If no seeds provided, use category name and common variations
    const keywordSeeds = seeds.length > 0 ? seeds : getCategorySeeds(category);

    // Discover keywords using autosuggest expansion (depth 1 for speed)
    const discoveredKeywords = new Set<string>();

    for (const seed of keywordSeeds.slice(0, 3)) { // Limit to 3 seeds for speed
      const expanded = await expandSeedKeyword(seed, country, 1); // Depth 1 for faster discovery
      for (const hint of expanded) {
        discoveredKeywords.add(hint.term.toLowerCase());
      }
    }

    const keywordsToScore = Array.from(discoveredKeywords).slice(0, DEFAULT_CONFIG.KEYWORDS_PER_CATEGORY);

    console.log(`Discovered ${discoveredKeywords.size} keywords, scoring ${keywordsToScore.length}`);

    // Score all discovered keywords
    const scoredResults = await scoreOpportunities(
      keywordsToScore.map(keyword => ({ keyword, category })),
      country
    );

    // Save all to database
    for (const result of scoredResults) {
      const saved = await upsertOpportunity(result);
      if (saved) {
        await recordOpportunityHistory(saved.id, result);
      }
    }

    // Rank and prepare response
    const ranked = rankOpportunities(scoredResults);
    const topOpportunities: RankedOpportunity[] = ranked.slice(0, limit).map((opp, idx) => ({
      rank: idx + 1,
      keyword: opp.keyword,
      opportunity_score: opp.opportunity_score,
      dimensions: opp.dimensions,
      one_liner: generateOneLiner(opp),
    }));

    return NextResponse.json({
      success: true,
      data: {
        category,
        total_scored: scoredResults.length,
        opportunities: topOpportunities,
      },
    });
  } catch (error) {
    console.error('Error discovering opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to discover opportunities' },
      { status: 500 }
    );
  }
}

// GET /api/opportunity/discover?category=xxx - Get existing discovered opportunities
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const country = searchParams.get('country') || 'us';
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const minScore = searchParams.get('min_score')
      ? parseFloat(searchParams.get('min_score')!)
      : undefined;

    if (!category) {
      return NextResponse.json(
        { error: 'category query parameter is required' },
        { status: 400 }
      );
    }

    const result = await searchOpportunities({
      category,
      country,
      sort: 'opportunity_score',
      sort_dir: 'desc',
      min_score: minScore,
      limit,
    });

    const topOpportunities: RankedOpportunity[] = result.opportunities.map((opp, idx) => ({
      rank: idx + 1,
      keyword: opp.keyword,
      opportunity_score: opp.opportunity_score || 0,
      dimensions: {
        competition_gap: opp.competition_gap_score || 0,
        market_demand: opp.market_demand_score || 0,
        revenue_potential: opp.revenue_potential_score || 0,
        trend_momentum: opp.trend_momentum_score || 0,
        execution_feasibility: opp.execution_feasibility_score || 0,
      },
      one_liner: opp.reasoning?.split('.')[0] + '.' || 'Opportunity identified.',
    }));

    return NextResponse.json({
      success: true,
      data: {
        category,
        total_scored: result.total,
        opportunities: topOpportunities,
      },
    });
  } catch (error) {
    console.error('Error getting discovered opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to get opportunities' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate seed keywords for a category
 */
function getCategorySeeds(category: string): string[] {
  const seedMap: Record<string, string[]> = {
    'productivity': ['productivity', 'task manager', 'to do list', 'notes', 'focus'],
    'utilities': ['utility', 'calculator', 'scanner', 'converter', 'timer'],
    'health-fitness': ['fitness', 'workout', 'health tracker', 'meditation', 'habit'],
    'finance': ['finance', 'budget', 'expense tracker', 'investment', 'money'],
    'education': ['education', 'learning', 'study', 'flashcards', 'language'],
    'lifestyle': ['lifestyle', 'journal', 'planner', 'organizer', 'routine'],
    'business': ['business', 'invoice', 'time tracking', 'project management', 'crm'],
    'photo-video': ['photo editor', 'video editor', 'camera', 'collage', 'filter'],
    'entertainment': ['entertainment', 'streaming', 'games', 'music', 'movies'],
    'food-drink': ['food', 'recipes', 'cooking', 'meal planner', 'nutrition'],
    'travel': ['travel', 'trip planner', 'packing list', 'flights', 'hotels'],
    'weather': ['weather', 'forecast', 'radar', 'temperature', 'storm'],
    'navigation': ['navigation', 'maps', 'gps', 'directions', 'traffic'],
    'shopping': ['shopping', 'deals', 'price tracker', 'coupons', 'wishlist'],
    'social-networking': ['social', 'messaging', 'chat', 'community', 'network'],
  };

  return seedMap[category] || [category, `${category} app`, `best ${category}`];
}

/**
 * Generate a one-liner summary for an opportunity
 */
function generateOneLiner(opp: { keyword: string; opportunity_score: number; dimensions: Record<string, number> }): string {
  const topDimension = Object.entries(opp.dimensions)
    .sort(([, a], [, b]) => b - a)[0];

  const dimensionNames: Record<string, string> = {
    competition_gap: 'weak competition',
    market_demand: 'strong demand',
    revenue_potential: 'good revenue potential',
    trend_momentum: 'rising trends',
    execution_feasibility: 'easy to build',
  };

  const topDimensionName = dimensionNames[topDimension[0]] || 'opportunity';

  if (opp.opportunity_score >= 75) {
    return `Excellent opportunity with ${topDimensionName}`;
  }
  if (opp.opportunity_score >= 60) {
    return `Good opportunity showing ${topDimensionName}`;
  }
  if (opp.opportunity_score >= 45) {
    return `Moderate opportunity with ${topDimensionName}`;
  }
  return `Niche opportunity - consider differentiation`;
}
