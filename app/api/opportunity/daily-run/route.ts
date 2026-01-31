import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  scoreOpportunity,
  rankOpportunities,
  selectWinner,
  upsertOpportunity,
  recordOpportunityHistory,
  selectOpportunity,
  createDailyRun,
  getTodaysDailyRun,
  updateDailyRunProgress,
  completeDailyRun,
  failDailyRun,
  DEFAULT_CRAWL_CATEGORIES,
  DEFAULT_CONFIG,
  OpportunityScoreResult,
} from '@/lib/opportunity';
import { expandSeedKeyword } from '@/lib/keywords/autosuggest';

// iTunes Search API for keyword discovery (fallback when autosuggest fails)
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

// Verify cron secret for Vercel Cron
function verifyCronAuth(request: NextRequest): boolean {
  // For Vercel Cron, check the Authorization header
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Fall back to session auth for manual triggers
  return false;
}

// POST /api/opportunity/daily-run - Execute daily autonomous opportunity discovery
export async function POST(request: NextRequest) {
  try {
    // Check authentication (cron secret or session)
    const isCron = verifyCronAuth(request);
    const isSessionAuth = await isAuthenticated();

    if (!isCron && !isSessionAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Parse optional config from body first
    let config = {
      categories: [...DEFAULT_CRAWL_CATEGORIES],
      keywords_per_category: DEFAULT_CONFIG.KEYWORDS_PER_CATEGORY_DAILY,
      country: 'us',
    };

    try {
      const body = await request.json();
      if (body.categories) config.categories = body.categories;
      if (body.keywords_per_category) config.keywords_per_category = body.keywords_per_category;
      if (body.country) config.country = body.country;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Check if already ran today
    let existingRun = await getTodaysDailyRun();

    if (existingRun) {
      if (existingRun.status === 'completed') {
        return NextResponse.json({
          success: true,
          data: {
            run_id: existingRun.id,
            status: 'already_completed',
            winner: existingRun.winner_keyword
              ? {
                  keyword: existingRun.winner_keyword,
                  category: existingRun.winner_category,
                  opportunity_score: existingRun.winner_score,
                  blueprint_triggered: existingRun.blueprint_triggered,
                }
              : null,
          },
        });
      }

      // If previous run was 'failed' or 'running', reset it and continue
      console.log(`Found existing daily run with status '${existingRun.status}', resetting...`);
      await updateDailyRunProgress(existingRun.id, {
        total_keywords_discovered: 0,
        total_keywords_scored: 0,
        status: 'running', // Reset status to running for retry
      });
    }

    // Create daily run record (or use existing one)
    let dailyRun = existingRun;
    if (!dailyRun) {
      dailyRun = await createDailyRun(config.categories);
      if (!dailyRun) {
        // One more try - race condition may have created it
        dailyRun = await getTodaysDailyRun();
        if (!dailyRun) {
          return NextResponse.json(
            { error: 'Failed to create daily run record' },
            { status: 500 }
          );
        }
      }
    }

    // Track all scored opportunities
    const allScoredOpportunities: OpportunityScoreResult[] = [];
    let totalDiscovered = 0;

    // Process each category
    for (const category of config.categories) {
      try {
        // Get seed keywords for this category
        const seeds = getCategorySeeds(category);

        // Discover keywords using autosuggest expansion
        const discoveredKeywords = new Set<string>();
        console.log(`Processing category: ${category} with seeds:`, seeds.slice(0, 3));

        // First try autosuggest
        for (const seed of seeds.slice(0, 3)) {
          try {
            const expanded = await expandSeedKeyword(seed, config.country, 2);
            console.log(`Seed "${seed}" returned ${expanded.length} keywords from autosuggest`);
            for (const hint of expanded) {
              discoveredKeywords.add(hint.term.toLowerCase());
            }
          } catch (err) {
            console.error(`Error expanding seed "${seed}":`, err);
          }
        }

        // If autosuggest returned nothing, use iTunes search fallback
        if (discoveredKeywords.size === 0) {
          console.log(`Autosuggest empty for ${category}, using iTunes fallback...`);
          for (const seed of seeds.slice(0, 3)) {
            try {
              const keywords = await searchITunesForKeywords(seed, config.country);
              console.log(`iTunes search for "${seed}" found ${keywords.length} keywords`);
              keywords.forEach(kw => discoveredKeywords.add(kw));
            } catch (err) {
              console.error(`Error searching iTunes for "${seed}":`, err);
            }
          }
        }

        // Also add the seed keywords themselves as they're valid opportunities
        seeds.slice(0, 5).forEach(seed => discoveredKeywords.add(seed.toLowerCase()));

        totalDiscovered += discoveredKeywords.size;
        console.log(`Category ${category}: discovered ${discoveredKeywords.size} total keywords`);

        // Take limited keywords per category
        const keywordsToScore = Array.from(discoveredKeywords).slice(
          0,
          config.keywords_per_category
        );

        // Score each keyword
        for (const keyword of keywordsToScore) {
          try {
            const result = await scoreOpportunity(keyword, category, config.country);
            allScoredOpportunities.push(result);

            // Save to database
            const saved = await upsertOpportunity(result);
            if (saved) {
              await recordOpportunityHistory(saved.id, result);
            }
          } catch (err) {
            console.error(`Error scoring ${keyword}:`, err);
            // Continue with other keywords
          }
        }

        // Update progress
        await updateDailyRunProgress(dailyRun.id, {
          total_keywords_discovered: totalDiscovered,
          total_keywords_scored: allScoredOpportunities.length,
        });
      } catch (err) {
        console.error(`Error processing category ${category}:`, err);
        // Continue with other categories
      }
    }

    // Select the winner
    const winner = selectWinner(allScoredOpportunities);

    if (!winner) {
      await failDailyRun(dailyRun.id, 'No opportunities scored');
      return NextResponse.json({
        success: false,
        error: 'No opportunities could be scored',
        data: {
          run_id: dailyRun.id,
          categories_processed: config.categories,
          total_scored: 0,
        },
      });
    }

    // Mark winner as selected in database
    const savedWinner = await upsertOpportunity(winner);
    if (!savedWinner) {
      // Failed to save winner - mark run as failed
      await failDailyRun(dailyRun.id, 'Failed to save winner opportunity to database');
      return NextResponse.json({
        success: false,
        error: 'Failed to save winner opportunity',
        data: {
          run_id: dailyRun.id,
          categories_processed: config.categories,
          total_scored: allScoredOpportunities.length,
        },
      });
    }

    await selectOpportunity(savedWinner.id);

    // Complete the daily run
    await completeDailyRun(
      dailyRun.id,
      {
        opportunity_id: savedWinner.id,
        keyword: winner.keyword,
        category: winner.category,
        score: winner.opportunity_score,
      },
      false // Blueprint trigger will be handled separately
    );

    // TODO: Trigger blueprint generation for winner
    // This would integrate with the existing blueprint generation system
    // await triggerBlueprintGeneration(savedWinner.id);

    return NextResponse.json({
      success: true,
      data: {
        run_id: dailyRun.id,
        categories_processed: config.categories,
        total_scored: allScoredOpportunities.length,
        winner: {
          keyword: winner.keyword,
          category: winner.category,
          opportunity_score: winner.opportunity_score,
          blueprint_triggered: false,
        },
      },
    });
  } catch (error) {
    console.error('Error in daily run:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to execute daily run: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// GET /api/opportunity/daily-run - Get today's run status
export async function GET(request: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const existingRun = await getTodaysDailyRun();

    if (!existingRun) {
      return NextResponse.json({
        success: true,
        data: {
          status: 'not_started',
          message: 'No daily run has been executed today',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        run_id: existingRun.id,
        run_date: existingRun.run_date,
        status: existingRun.status,
        categories_processed: existingRun.categories_processed,
        total_keywords_discovered: existingRun.total_keywords_discovered,
        total_keywords_scored: existingRun.total_keywords_scored,
        winner: existingRun.winner_keyword
          ? {
              keyword: existingRun.winner_keyword,
              category: existingRun.winner_category,
              opportunity_score: existingRun.winner_score,
              blueprint_triggered: existingRun.blueprint_triggered,
            }
          : null,
        started_at: existingRun.started_at,
        completed_at: existingRun.completed_at,
      },
    });
  } catch (error) {
    console.error('Error getting daily run status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to get daily run status: ${errorMessage}` },
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
    productivity: ['productivity', 'task manager', 'to do list', 'notes', 'focus timer'],
    utilities: ['utility', 'calculator', 'scanner', 'converter', 'timer'],
    'health-fitness': [
      'fitness',
      'workout',
      'health tracker',
      'meditation',
      'habit tracker',
    ],
    finance: ['finance', 'budget', 'expense tracker', 'investment', 'money manager'],
    education: ['education', 'learning', 'study', 'flashcards', 'language learning'],
    lifestyle: ['lifestyle', 'journal', 'planner', 'organizer', 'daily routine'],
    business: ['business', 'invoice', 'time tracking', 'project management', 'crm'],
    'photo-video': ['photo editor', 'video editor', 'camera', 'collage', 'filter'],
    entertainment: ['entertainment', 'streaming', 'games', 'music', 'movies'],
    'food-drink': ['food', 'recipes', 'cooking', 'meal planner', 'nutrition'],
    travel: ['travel', 'trip planner', 'packing list', 'flights', 'hotels'],
    weather: ['weather', 'forecast', 'radar', 'temperature', 'storm tracker'],
    navigation: ['navigation', 'maps', 'gps', 'directions', 'traffic'],
    shopping: ['shopping', 'deals', 'price tracker', 'coupons', 'wishlist'],
    'social-networking': ['social', 'messaging', 'chat', 'community', 'network'],
  };

  return seedMap[category] || [category, `${category} app`, `best ${category}`];
}
