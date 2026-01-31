import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  scoreOpportunityBasic,
  scoreOpportunitiesBasic,
  rankOpportunities,
  upsertOpportunity,
  recordOpportunityHistory,
  searchOpportunities,
  getExistingKeywordsForCategory,
  RankedOpportunity,
  DEFAULT_CONFIG,
} from '@/lib/opportunity';
import { expandSeedKeyword } from '@/lib/keywords/autosuggest';

// iTunes Search API for keyword discovery
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

async function searchITunesForKeywords(
  seed: string,
  country: string
): Promise<string[]> {
  try {
    const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(seed)}&country=${country}&entity=software&limit=50`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const apps = data.results || [];

    // Extract keywords from app names
    const keywords = new Set<string>();
    for (const app of apps) {
      const name = app.trackName?.toLowerCase() || '';
      // Extract meaningful words from app names (2+ chars, not common words)
      const words = name.split(/[\s\-\:\.]+/).filter((w: string) =>
        w.length >= 2 &&
        !['the', 'and', 'for', 'app', 'pro', 'free', 'lite', 'plus', 'with'].includes(w)
      );
      words.forEach((w: string) => keywords.add(w));

      // Also add 2-word combinations
      for (let i = 0; i < words.length - 1; i++) {
        keywords.add(`${words[i]} ${words[i + 1]}`);
      }
    }

    return Array.from(keywords);
  } catch (error) {
    console.error('Error searching iTunes for keywords:', error);
    return [];
  }
}

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

    // Fetch existing keywords to exclude from discovery
    const existingKeywords = await getExistingKeywordsForCategory(category, country);
    console.log(`Found ${existingKeywords.size} existing keywords for ${category}/${country} to exclude`);

    // Discover keywords using autosuggest + iTunes search fallback
    const discoveredKeywords = new Set<string>();

    console.log(`Starting discovery for category: ${category} with seeds:`, keywordSeeds.slice(0, 3));

    // First try autosuggest
    for (const seed of keywordSeeds.slice(0, 3)) {
      try {
        console.log(`Expanding seed via autosuggest: ${seed}`);
        const expanded = await expandSeedKeyword(seed, country, 1);
        console.log(`Seed "${seed}" returned ${expanded.length} keywords from autosuggest`);
        for (const hint of expanded) {
          const kw = hint.term.toLowerCase();
          // Skip keywords that already exist in the database
          if (!existingKeywords.has(kw)) {
            discoveredKeywords.add(kw);
          }
        }
      } catch (err) {
        console.error(`Error expanding seed "${seed}":`, err);
      }
    }

    // If autosuggest returned nothing (after excluding existing), use iTunes search fallback
    if (discoveredKeywords.size === 0) {
      console.log('Autosuggest returned no new results, using iTunes search fallback...');
      for (const seed of keywordSeeds.slice(0, 3)) {
        try {
          const keywords = await searchITunesForKeywords(seed, country);
          console.log(`iTunes search for "${seed}" found ${keywords.length} keywords`);
          keywords.forEach(kw => {
            // Skip keywords that already exist in the database
            if (!existingKeywords.has(kw.toLowerCase())) {
              discoveredKeywords.add(kw);
            }
          });
        } catch (err) {
          console.error(`Error searching iTunes for "${seed}":`, err);
        }
      }
    }

    // Also add the seed keywords themselves if not already discovered
    keywordSeeds.slice(0, 5).forEach(seed => {
      const kw = seed.toLowerCase();
      if (!existingKeywords.has(kw)) {
        discoveredKeywords.add(kw);
      }
    });

    const keywordsToScore = Array.from(discoveredKeywords).slice(0, DEFAULT_CONFIG.KEYWORDS_PER_CATEGORY);

    console.log(`Discovered ${discoveredKeywords.size} NEW keywords (excluded ${existingKeywords.size} existing), will score ${keywordsToScore.length}:`, keywordsToScore);

    // If no new keywords found, return early with informative message
    if (keywordsToScore.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          category,
          total_scored: 0,
          opportunities: [],
          message: `No new keywords found for ${category}. All ${existingKeywords.size} discovered keywords already exist. Try a different category or add custom seeds.`,
        },
      });
    }

    // Score all discovered keywords (using BASIC scoring - fast, iTunes only)
    console.log(`Starting BASIC scoring for ${keywordsToScore.length} keywords...`);
    const scoredResults = await scoreOpportunitiesBasic(
      keywordsToScore.map(keyword => ({ keyword, category })),
      country
    );
    console.log(`Scored ${scoredResults.length} opportunities (basic scoring)`);

    // Save all to database
    let savedCount = 0;
    for (const result of scoredResults) {
      try {
        const saved = await upsertOpportunity(result);
        if (saved) {
          savedCount++;
          await recordOpportunityHistory(saved.id, result);
        } else {
          console.error(`Failed to save opportunity: ${result.keyword}`);
        }
      } catch (err) {
        console.error(`Error saving opportunity ${result.keyword}:`, err);
      }
    }
    console.log(`Saved ${savedCount}/${scoredResults.length} opportunities to database`);

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
        existing_skipped: existingKeywords.size,
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
