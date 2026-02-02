import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSession,
  updateGapSessionStatus,
  bulkInsertGapApps,
} from '@/lib/supabase';
import { scrapeMultipleCountries, type GapScrapeResult } from '@/lib/gap-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for scraping

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/gap-analysis/[id]/scrape - Start multi-country scrape (SSE)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  try {
    // Get session
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session } = result;

    // Don't restart if already completed
    if (session.scrape_status === 'completed') {
      return NextResponse.json({ error: 'Session already completed' }, { status: 400 });
    }

    // Update status to in_progress
    await updateGapSessionStatus(sessionId, 'in_progress', {
      current_country: session.countries[0],
      current_index: 0,
      total_countries: session.countries.length,
      countries_completed: [],
      total_apps_found: 0,
      unique_apps: 0,
    });

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Track if stream has been closed to prevent double-close errors
        let streamClosed = false;

        const sendEvent = (type: string, data: Record<string, unknown>) => {
          if (streamClosed) return;
          try {
            const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
            controller.enqueue(encoder.encode(event));
          } catch {
            // Controller might be closed
          }
        };

        const closeStream = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        };

        let countriesCompleted: string[] = [];
        let totalAppsFound = 0;

        try {
          await scrapeMultipleCountries(
            session.category,
            session.countries,
            session.apps_per_country,
            {
              onCountryStart: async (country, index, total) => {
                sendEvent('country_start', { country, index, total });

                await updateGapSessionStatus(sessionId, 'in_progress', {
                  current_country: country,
                  current_index: index,
                  total_countries: total,
                  countries_completed: countriesCompleted,
                  total_apps_found: totalAppsFound,
                  unique_apps: 0,
                });
              },

              onCountryProgress: (country, appsFound) => {
                sendEvent('country_progress', { country, apps_found: appsFound });
              },

              onCountryComplete: (country, appsFound, uniqueNew, totalUnique) => {
                countriesCompleted.push(country);
                totalAppsFound += appsFound;

                sendEvent('country_complete', {
                  country,
                  apps_found: appsFound,
                  unique_new: uniqueNew,
                  total_unique: totalUnique,
                });
              },

              onComplete: async (results: GapScrapeResult[], countriesScraped: string[]) => {
                // Save all apps to database using bulk insert (much faster)
                const success = await bulkInsertGapApps(sessionId, results);
                if (!success) {
                  throw new Error('Failed to save apps to database');
                }

                // Update session status
                await updateGapSessionStatus(sessionId, 'completed', {
                  countries_completed: countriesScraped,
                  total_apps_found: totalAppsFound,
                  unique_apps: results.length,
                });

                sendEvent('complete', {
                  total_apps: totalAppsFound,
                  unique_apps: results.length,
                  countries_scraped: countriesScraped,
                });
              },

              onError: (error: string) => {
                throw new Error(error);
              },
            }
          );
        } catch (error) {
          console.error('[Scrape] Error:', error);

          await updateGapSessionStatus(sessionId, 'failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Scrape failed',
          });
        } finally {
          closeStream();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[POST /api/gap-analysis/[id]/scrape] Error:', error);
    return NextResponse.json({ error: 'Failed to start scrape' }, { status: 500 });
  }
}
