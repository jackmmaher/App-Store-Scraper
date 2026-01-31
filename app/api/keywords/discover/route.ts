import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  discoverFromSeed,
  discoverFromCompetitor,
  discoverFromCategory,
} from '@/lib/keywords/discovery';
import { scoreKeyword } from '@/lib/keywords/scoring';
import {
  upsertKeyword,
  saveKeywordRankings,
  createKeywordJob,
  getKeywordJob,
  updateJobProgress,
  completeJob,
  failJob,
} from '@/lib/keywords/db';
import { batchAddAppsFromiTunes } from '@/lib/supabase';
import { DiscoveryMethod, DiscoveredKeyword, JobProgressEvent } from '@/lib/keywords/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

interface DiscoverRequest {
  method: DiscoveryMethod;
  seed?: string;
  app_id?: string;
  app_data?: {
    name: string;
    subtitle?: string;
    description?: string;
    reviews?: Array<{ title: string; content: string }>;
  };
  category?: string;
  country?: string;
  depth?: number;
  score_immediately?: boolean;
}

// POST /api/keywords/discover - Discover and optionally score keywords (streaming)
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const body: DiscoverRequest = await request.json();
    const {
      method,
      seed,
      app_id,
      app_data,
      category,
      country = 'us',
      depth = 2,
      score_immediately = true,
    } = body;

    // Validate input based on method
    if (method === 'autosuggest' && !seed) {
      return NextResponse.json(
        { error: 'seed is required for autosuggest discovery' },
        { status: 400 }
      );
    }

    if (method === 'competitor' && (!app_id || !app_data)) {
      return NextResponse.json(
        { error: 'app_id and app_data are required for competitor discovery' },
        { status: 400 }
      );
    }

    if (method === 'category_crawl' && !category) {
      return NextResponse.json(
        { error: 'category is required for category crawl discovery' },
        { status: 400 }
      );
    }

    // Create job for tracking
    const job = await createKeywordJob(
      method === 'autosuggest' ? 'discover_seed' :
      method === 'competitor' ? 'discover_competitor' : 'discover_category',
      {
        seed,
        app_id,
        category,
        country,
        depth,
      }
    );

    if (!job) {
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: JobProgressEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        // Heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          sendEvent({ type: 'heartbeat', timestamp: Date.now() });
        }, 10000);

        let discovered = 0;
        let scored = 0;

        try {
          const keywords: DiscoveredKeyword[] = [];

          // Discovery callback
          const onKeyword = (kw: DiscoveredKeyword) => {
            keywords.push(kw);
            discovered++;
            sendEvent({
              type: 'keyword',
              keyword: kw,
              discovered,
            });
          };

          // Run discovery based on method
          if (method === 'autosuggest' && seed) {
            await discoverFromSeed(seed, country, depth, onKeyword);
          } else if (method === 'competitor' && app_id && app_data && apiKey) {
            await discoverFromCompetitor(app_id, app_data, apiKey, onKeyword);
          } else if (method === 'category_crawl' && category) {
            await discoverFromCategory(category, country, apiKey, onKeyword);
          }

          await updateJobProgress(job.id, {
            keywords_discovered: discovered,
            total_items: discovered,
          });

          sendEvent({
            type: 'progress',
            status: 'running',
            discovered,
            message: `Discovered ${discovered} keywords. ${score_immediately ? 'Scoring...' : 'Complete.'}`,
          });

          // Score keywords if requested
          const allAppIds = new Set<string>(); // Collect all app IDs for batch adding

          if (score_immediately && keywords.length > 0) {
            for (const kw of keywords) {
              try {
                const scores = await scoreKeyword(kw.keyword, country);
                const savedKeyword = await upsertKeyword(kw.keyword, country, scores, {
                  discovered_via: kw.discovered_via,
                  source_app_id: kw.source_app_id,
                  source_category: kw.source_category,
                  source_seed: kw.source_seed,
                });

                // Save rankings if we have them
                if (savedKeyword && scores.top_10_apps && scores.top_10_apps.length > 0) {
                  const rankingsToSave = scores.top_10_apps.map((app, index) => ({
                    app_id: app.id,
                    rank_position: index + 1,
                    has_keyword_in_title: app.has_keyword_in_title,
                    app_name: app.name,
                    app_review_count: app.reviews,
                    app_rating: app.rating,
                    app_icon_url: app.icon_url || null,
                  }));
                  await saveKeywordRankings(savedKeyword.id, rankingsToSave);

                  // Collect app IDs for batch adding to master database
                  for (const app of scores.top_10_apps) {
                    allAppIds.add(app.id);
                  }
                }

                scored++;
                await updateJobProgress(job.id, {
                  processed_items: scored,
                  keywords_scored: scored,
                });

                sendEvent({
                  type: 'progress',
                  status: 'running',
                  discovered,
                  scored,
                  progress: scored / keywords.length,
                  score: scores,
                });

                // Rate limiting
                await new Promise((r) => setTimeout(r, 300));
              } catch (err) {
                console.error(`Error scoring keyword ${kw.keyword}:`, err);
              }
            }

            // Batch add all discovered apps to the master database
            if (allAppIds.size > 0) {
              batchAddAppsFromiTunes(Array.from(allAppIds), country).catch(err => {
                console.error('Error batch adding apps to database:', err);
              });
            }
          }

          clearInterval(heartbeatInterval);
          await completeJob(job.id, {
            keywords_discovered: discovered,
            keywords_scored: scored,
          });

          sendEvent({
            type: 'complete',
            status: 'completed',
            discovered,
            scored,
            message: `Complete. Discovered ${discovered} keywords, scored ${scored}.`,
          });
        } catch (error) {
          clearInterval(heartbeatInterval);
          const errorMessage = error instanceof Error ? error.message : 'Discovery failed';
          await failJob(job.id, errorMessage);

          sendEvent({
            type: 'error',
            status: 'failed',
            message: errorMessage,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Job-Id': job.id,
      },
    });
  } catch (error) {
    console.error('Error in discover endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to start discovery' },
      { status: 500 }
    );
  }
}

// GET /api/keywords/discover?job_id=xxx - Get job status
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobId = request.nextUrl.searchParams.get('job_id');

    if (!jobId) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      );
    }

    const job = await getKeywordJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error getting job:', error);
    return NextResponse.json(
      { error: 'Failed to get job' },
      { status: 500 }
    );
  }
}
