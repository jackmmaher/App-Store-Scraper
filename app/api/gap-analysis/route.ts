import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSessions,
  getGapSession,
  createGapSession,
  deleteGapSession,
  updateGapSessionStatus,
  bulkInsertGapApps,
  updateGapAppClassifications,
  getGapChatMessages,
  saveGapChatMessage,
  clearGapChatMessages,
  type GapAnalysisApp,
} from '@/lib/supabase';
import { scrapeMultipleCountries, type GapScrapeResult } from '@/lib/gap-scraper';
import { COUNTRY_CODES, CATEGORY_NAMES } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/gap-analysis - Fetch all sessions OR single session via ?id= query param
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('id');
  const action = request.nextUrl.searchParams.get('action');

  try {
    // Handle chat-history action
    if (sessionId && action === 'chat-history') {
      const messages = await getGapChatMessages(sessionId);
      return NextResponse.json({ messages });
    }

    // If ?id= is provided, fetch single session (fallback for dynamic route issues)
    if (sessionId) {
      const result = await getGapSession(sessionId);
      if (!result) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    // Otherwise fetch all sessions
    const sessions = await getGapSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[GET /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/gap-analysis - Create session OR perform action via ?action= query param
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('id');
  const action = request.nextUrl.searchParams.get('action');

  // Handle actions for existing session
  if (sessionId && action) {
    switch (action) {
      case 'scrape':
        return handleScrape(sessionId);
      case 'classify':
        return handleClassify(sessionId);
      case 'analyze':
        return handleAnalyze(sessionId, request);
      case 'chat':
        return handleChat(sessionId, request);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  }

  // Default: Create new session
  try {
    const body = await request.json();
    const { name, category, countries, appsPerCountry } = body as {
      name?: string;
      category: string;
      countries: string[];
      appsPerCountry?: number;
    };

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    if (!countries || countries.length < 2) {
      return NextResponse.json({ error: 'At least 2 countries are required' }, { status: 400 });
    }

    if (countries.length > 15) {
      return NextResponse.json({ error: 'Maximum 15 countries allowed' }, { status: 400 });
    }

    const session = await createGapSession(
      name || null,
      category,
      countries,
      appsPerCountry || 50
    );

    if (!session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ session, success: true }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

// DELETE /api/gap-analysis?id= - Delete a session OR clear chat via query param
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('id');
  const action = request.nextUrl.searchParams.get('action');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  try {
    // Handle clear-chat action
    if (action === 'clear-chat') {
      const success = await clearGapChatMessages(sessionId);
      if (!success) {
        return NextResponse.json({ error: 'Failed to clear chat' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Default: delete session
    const success = await deleteGapSession(sessionId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

// Handle scrape action
async function handleScrape(sessionId: string) {
  try {
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session } = result;

    if (session.scrape_status === 'completed') {
      return NextResponse.json({ error: 'Session already completed' }, { status: 400 });
    }

    await updateGapSessionStatus(sessionId, 'in_progress', {
      current_country: session.countries[0],
      current_index: 0,
      total_countries: session.countries.length,
      countries_completed: [],
      total_apps_found: 0,
      unique_apps: 0,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(event));
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
                // Bulk insert all apps at once (much faster than individual upserts)
                const appsToInsert = results.map((app) => ({
                  app_store_id: app.app_store_id,
                  app_name: app.app_name,
                  app_icon_url: app.app_icon_url,
                  app_developer: app.app_developer,
                  app_rating: app.app_rating,
                  app_review_count: app.app_review_count,
                  app_primary_genre: app.app_primary_genre,
                  app_url: app.app_url,
                  countries_present: app.countries_present,
                  country_ranks: app.country_ranks,
                  presence_count: app.presence_count,
                  average_rank: app.average_rank,
                }));

                const inserted = await bulkInsertGapApps(sessionId, appsToInsert);
                if (!inserted) {
                  console.error('Failed to bulk insert apps');
                }

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
    console.error('[handleScrape] Error:', error);
    return NextResponse.json({ error: 'Failed to start scrape' }, { status: 500 });
  }
}

// Handle classify action
async function handleClassify(sessionId: string) {
  try {
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;

    if (session.scrape_status !== 'completed') {
      return NextResponse.json({ error: 'Scrape not completed' }, { status: 400 });
    }

    if (apps.length === 0) {
      return NextResponse.json({ error: 'No apps to classify' }, { status: 400 });
    }

    const totalCountries = session.countries.length;
    const classifications: Array<{
      app_store_id: string;
      classification: GapAnalysisApp['classification'];
      classification_reason: string;
    }> = [];

    for (const app of apps) {
      const presenceRatio = app.presence_count / totalCountries;
      const avgRank = app.average_rank || 999;

      let classification: GapAnalysisApp['classification'] = null;
      let reason = '';

      if (avgRank <= 3 && presenceRatio >= 0.8) {
        classification = 'global_leader';
        reason = `Top 3 avg rank (${avgRank.toFixed(1)}) in ${(presenceRatio * 100).toFixed(0)}% of markets`;
      } else if (presenceRatio >= 0.2 && presenceRatio <= 0.7) {
        const hasTop10 = Object.values(app.country_ranks).some(
          (rank) => rank !== null && rank <= 10
        );
        if (hasTop10) {
          const top10Countries = Object.entries(app.country_ranks)
            .filter(([, rank]) => rank !== null && rank <= 10)
            .map(([country]) => country.toUpperCase());
          classification = 'local_champion';
          reason = `Top 10 in ${top10Countries.join(', ')}, present in ${(presenceRatio * 100).toFixed(0)}% of markets`;
        }
      }

      classifications.push({
        app_store_id: app.app_store_id,
        classification,
        classification_reason: reason,
      });
    }

    const success = await updateGapAppClassifications(sessionId, classifications);
    if (!success) {
      return NextResponse.json({ error: 'Failed to save classifications' }, { status: 500 });
    }

    const stats = {
      total: apps.length,
      global_leaders: classifications.filter((c) => c.classification === 'global_leader').length,
      brands: classifications.filter((c) => c.classification === 'brand').length,
      local_champions: classifications.filter((c) => c.classification === 'local_champion').length,
      unclassified: classifications.filter((c) => !c.classification).length,
    };

    return NextResponse.json({ success: true, classifications: classifications.filter((c) => c.classification), stats });
  } catch (error) {
    console.error('[handleClassify] Error:', error);
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
  }
}

// Handle analyze action
async function handleAnalyze(sessionId: string, request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { appStoreId } = body as { appStoreId: string };

    if (!appStoreId) {
      return NextResponse.json({ error: 'App store ID required' }, { status: 400 });
    }

    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;
    const app = apps.find((a) => a.app_store_id === appStoreId);
    if (!app) {
      return NextResponse.json({ error: 'App not found in session' }, { status: 404 });
    }

    const topCountries = Object.entries(app.country_ranks)
      .filter(([, rank]) => rank !== null && rank <= 10)
      .sort(([, a], [, b]) => (a || 999) - (b || 999))
      .map(([country, rank]) => `${COUNTRY_CODES[country] || country} (#${rank})`)
      .join(', ');

    const missingCountries = session.countries
      .filter((c) => !app.countries_present.includes(c))
      .map((c) => COUNTRY_CODES[c] || c)
      .join(', ');

    const prompt = `You are a market intelligence analyst. Analyze this app's cross-country presence:

App: ${app.app_name}
Developer: ${app.app_developer || 'Unknown'}
Category: ${app.app_primary_genre || 'Unknown'}
Rating: ${app.app_rating?.toFixed(1) || 'N/A'}
Reviews: ${app.app_review_count?.toLocaleString() || 'N/A'}

Markets where it ranks well (Top 10): ${topCountries || 'None'}
Markets where it's absent: ${missingCountries || 'Present everywhere'}
Total presence: ${app.presence_count}/${session.countries.length} markets

Provide a brief market gap analysis:
1. Why might this app succeed in some markets but not others?
2. What's the opportunity for competitors in the missing markets?
3. What would it take to replicate this app's success?`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to analyze app' }, { status: 500 });
    }

    const data = await response.json();
    const analysis = data.content[0]?.text || 'No analysis generated';

    return NextResponse.json({ analysis, app: { app_store_id: app.app_store_id, app_name: app.app_name } });
  } catch (error) {
    console.error('[handleAnalyze] Error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

// Handle chat action
async function handleChat(sessionId: string, request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { message } = body as { message: string };

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;
    const chatHistory = await getGapChatMessages(sessionId);
    const recentHistory = chatHistory.slice(-20);

    const categoryName = CATEGORY_NAMES[session.category] || session.category;
    const systemPrompt = `You are a market analyst helping with gap analysis for the "${categoryName}" category across ${session.countries.length} countries. There are ${apps.length} unique apps found. Answer questions about market opportunities and app presence patterns.`;

    const conversationMessages = [
      ...recentHistory.map((msg) => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      { role: 'user' as const, content: message },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to get response' }, { status: 500 });
    }

    const data = await response.json();
    const assistantResponse = data.content[0]?.text || 'No response generated';

    const savedUserMessage = await saveGapChatMessage(sessionId, 'user', message);
    const savedAssistantMessage = await saveGapChatMessage(sessionId, 'assistant', assistantResponse);

    return NextResponse.json({ userMessage: savedUserMessage, assistantMessage: savedAssistantMessage });
  } catch (error) {
    console.error('[handleChat] Error:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
