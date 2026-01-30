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
  // Check authentication (cron secret or session)
  const isCron = verifyCronAuth(request);
  const isSessionAuth = await isAuthenticated();

  if (!isCron && !isSessionAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if already ran today
    const existingRun = await getTodaysDailyRun();
    if (existingRun && existingRun.status === 'completed') {
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

    // Parse optional config from body
    let config = {
      categories: [...DEFAULT_CRAWL_CATEGORIES],
      keywords_per_category: DEFAULT_CONFIG.KEYWORDS_PER_CATEGORY,
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

    // Create daily run record
    const dailyRun = await createDailyRun(config.categories);
    if (!dailyRun) {
      return NextResponse.json(
        { error: 'Failed to create daily run record' },
        { status: 500 }
      );
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
        for (const seed of seeds.slice(0, 3)) {
          const expanded = await expandSeedKeyword(seed, config.country, 2);
          for (const hint of expanded) {
            discoveredKeywords.add(hint.term.toLowerCase());
          }
        }

        totalDiscovered += discoveredKeywords.size;

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
    if (savedWinner) {
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
    }

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
    return NextResponse.json(
      { error: 'Failed to execute daily run' },
      { status: 500 }
    );
  }
}

// GET /api/opportunity/daily-run - Get today's run status
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
    return NextResponse.json(
      { error: 'Failed to get daily run status' },
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
