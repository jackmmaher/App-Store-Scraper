import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSession,
  updateGapSessionStatus,
  upsertGapApp,
  upsertApps,
} from '@/lib/supabase';

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
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        try {
          // Call Python scraper
          const scraperUrl = process.env.NODE_ENV === 'production'
            ? `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/py-gap-scrape`
            : 'http://localhost:3000/api/py-gap-scrape';

          const response = await fetch(scraperUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: session.category,
              countries: session.countries,
              appsPerCountry: session.apps_per_country,
            }),
          });

          if (!response.ok) {
            throw new Error(`Scraper returned ${response.status}`);
          }

          // Process SSE from Python scraper
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let countriesCompleted: string[] = [];
          let totalAppsFound = 0;
          let uniqueApps = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const eventData = JSON.parse(line.slice(6));

                  // Forward progress events
                  if (eventData.type === 'country_start') {
                    sendEvent('country_start', {
                      country: eventData.country,
                      index: eventData.index,
                      total: eventData.total,
                    });

                    // Update progress in DB
                    await updateGapSessionStatus(sessionId, 'in_progress', {
                      current_country: eventData.country,
                      current_index: eventData.index,
                      total_countries: eventData.total,
                      countries_completed: countriesCompleted,
                      total_apps_found: totalAppsFound,
                      unique_apps: uniqueApps,
                    });
                  }

                  if (eventData.type === 'country_progress') {
                    sendEvent('country_progress', {
                      country: eventData.country,
                      apps_found: eventData.apps_found,
                    });
                  }

                  if (eventData.type === 'country_complete') {
                    countriesCompleted.push(eventData.country);
                    totalAppsFound += eventData.apps_found;
                    uniqueApps = eventData.total_unique;

                    sendEvent('country_complete', {
                      country: eventData.country,
                      apps_found: eventData.apps_found,
                      unique_new: eventData.unique_new,
                      total_unique: eventData.total_unique,
                    });
                  }

                  if (eventData.type === 'complete') {
                    // Save all apps to database
                    const apps = eventData.apps || [];

                    for (const app of apps) {
                      // Upsert to gap_analysis_apps
                      for (const [country, rank] of Object.entries(app.country_ranks)) {
                        await upsertGapApp(sessionId, {
                          app_store_id: app.app_store_id,
                          app_name: app.app_name,
                          app_icon_url: app.app_icon_url,
                          app_developer: app.app_developer,
                          app_rating: app.app_rating,
                          app_review_count: app.app_review_count,
                          app_primary_genre: app.app_primary_genre,
                          app_url: app.app_url,
                        }, country, rank as number);
                      }

                      // Also upsert to master apps table
                      const appResult = {
                        id: app.app_store_id,
                        name: app.app_name,
                        bundle_id: '',
                        developer: app.app_developer || '',
                        developer_id: '',
                        price: 0,
                        currency: 'USD',
                        rating: app.app_rating || 0,
                        rating_current_version: 0,
                        review_count: app.app_review_count || 0,
                        review_count_current_version: 0,
                        version: '',
                        release_date: '',
                        current_version_release_date: '',
                        min_os_version: '',
                        file_size_bytes: '',
                        content_rating: '',
                        genres: app.app_primary_genre ? [app.app_primary_genre] : [],
                        primary_genre: app.app_primary_genre || '',
                        primary_genre_id: '',
                        url: app.app_url || '',
                        icon_url: app.app_icon_url || '',
                        description: '',
                      };

                      // Upsert for each country the app was found in
                      for (const country of app.countries_present) {
                        await upsertApps([appResult], country, session.category);
                      }
                    }

                    // Update session status
                    await updateGapSessionStatus(sessionId, 'completed', {
                      countries_completed: eventData.countries_scraped,
                      total_apps_found: eventData.total_apps,
                      unique_apps: eventData.unique_apps,
                    });

                    sendEvent('complete', {
                      total_apps: eventData.total_apps,
                      unique_apps: eventData.unique_apps,
                      countries_scraped: eventData.countries_scraped,
                    });
                  }

                  if (eventData.type === 'error') {
                    throw new Error(eventData.message);
                  }
                } catch (parseErr) {
                  console.error('Error parsing SSE event:', parseErr);
                }
              }
            }
          }
        } catch (error) {
          console.error('[Scrape] Error:', error);

          await updateGapSessionStatus(sessionId, 'failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Scrape failed',
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
      },
    });
  } catch (error) {
    console.error('[POST /api/gap-analysis/[id]/scrape] Error:', error);
    return NextResponse.json({ error: 'Failed to start scrape' }, { status: 500 });
  }
}
