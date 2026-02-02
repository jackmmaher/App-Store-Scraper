import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { expandSeedKeyword, fetchAutosuggestHints } from '@/lib/keywords/autosuggest';
import { clusterKeywords } from '@/lib/app-ideas/cluster';
import { CATEGORY_NAMES } from '@/lib/constants';
import { DiscoveredKeyword, Cluster, DiscoverRequest } from '@/lib/app-ideas/types';
import {
  createAppIdeaSession,
  updateAppIdeaSession,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/app-ideas/discover/stream - Discover keywords and cluster them with streaming progress
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: DiscoverRequest = await request.json();
  const { entryType, entryValue, country = 'us' } = body;

  if (!entryType || !entryValue) {
    return new Response(JSON.stringify({ error: 'Entry type and value required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Track if stream has been closed to prevent double-close errors
      let streamClosed = false;

      const sendEvent = (data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          // Controller might be closed
        }
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          closeStream();
        } catch {
          // Already closed
        }
      };

      try {
        // Create a new session in the database
        const session = await createAppIdeaSession(entryType, entryValue, country);
        if (!session) {
          sendEvent({ type: 'error', message: 'Failed to create session' });
          closeStream();
          return;
        }

        // Send initial state
        sendEvent({
          type: 'start',
          sessionId: session.id,
          phases: [
            { id: 'discover', label: 'Discovering Keywords', status: 'pending' },
            { id: 'cluster', label: 'Clustering Keywords', status: 'pending' },
          ],
        });

        // Phase 1: Discover keywords
        sendEvent({
          type: 'phase_start',
          phaseId: 'discover',
          label: 'Discovering Keywords',
        });

        let keywords: DiscoveredKeyword[] = [];
        let keywordCount = 0;

        // Callback to send progress as keywords are discovered
        const onKeywordDiscovered = (hint: { term: string; priority: number }) => {
          keywordCount++;
          // Send progress event every 5 keywords to avoid overwhelming the stream
          if (keywordCount % 5 === 0 || keywordCount <= 3) {
            sendEvent({
              type: 'keyword_progress',
              phaseId: 'discover',
              keywordsFound: keywordCount,
              latestKeyword: hint.term,
            });
          }
        };

        try {
          switch (entryType) {
            case 'category': {
              const categoryName = CATEGORY_NAMES[entryValue] || entryValue;
              sendEvent({
                type: 'keyword_progress',
                phaseId: 'discover',
                keywordsFound: 0,
                message: `Expanding "${categoryName}"...`,
              });
              const hints = await expandSeedKeyword(categoryName.toLowerCase(), country, 2, onKeywordDiscovered);
              keywords = hints.map((hint, index) => ({
                term: hint.term.toLowerCase(),
                priority: hint.priority,
                position: index + 1,
              }));
              break;
            }
            case 'keyword': {
              sendEvent({
                type: 'keyword_progress',
                phaseId: 'discover',
                keywordsFound: 0,
                message: `Expanding "${entryValue}"...`,
              });
              const hints = await expandSeedKeyword(entryValue.toLowerCase(), country, 2, onKeywordDiscovered);
              keywords = hints.map((hint, index) => ({
                term: hint.term.toLowerCase(),
                priority: hint.priority,
                position: index + 1,
              }));
              break;
            }
            case 'app': {
              sendEvent({
                type: 'keyword_progress',
                phaseId: 'discover',
                keywordsFound: 0,
                message: 'Fetching app metadata...',
              });
              keywords = await getKeywordsFromApp(entryValue, country, (count, term) => {
                sendEvent({
                  type: 'keyword_progress',
                  phaseId: 'discover',
                  keywordsFound: count,
                  latestKeyword: term,
                });
              });
              break;
            }
            default:
              sendEvent({ type: 'error', message: 'Invalid entry type' });
              closeStream();
              return;
          }
        } catch (err) {
          console.error('Keyword discovery failed:', err);
          sendEvent({ type: 'error', message: 'Failed to discover keywords' });
          closeStream();
          return;
        }

        sendEvent({
          type: 'phase_complete',
          phaseId: 'discover',
          keywordsFound: keywords.length,
          progress: 0.5,
        });

        if (keywords.length === 0) {
          await updateAppIdeaSession(session.id, {
            status: 'complete',
            discovered_keywords: [],
          });
          sendEvent({ type: 'error', message: 'No keywords discovered. Try a different input.' });
          closeStream();
          return;
        }

        // Update session with discovered keywords
        await updateAppIdeaSession(session.id, {
          status: 'clustering',
          discovered_keywords: keywords,
        });

        // Phase 2: Cluster keywords
        sendEvent({
          type: 'phase_start',
          phaseId: 'cluster',
          label: 'Clustering Keywords',
          keywordCount: keywords.length,
        });

        let clusters: Cluster[];
        try {
          clusters = await clusterKeywords(keywords, apiKey);
        } catch (err) {
          console.error('Clustering failed:', err);
          sendEvent({ type: 'error', message: 'Failed to cluster keywords. Please try again.' });
          closeStream();
          return;
        }

        sendEvent({
          type: 'phase_complete',
          phaseId: 'cluster',
          clustersCreated: clusters.length,
          progress: 1,
        });

        // Update session with clusters
        await updateAppIdeaSession(session.id, {
          status: 'scoring',
          clusters: clusters,
        });

        // Send complete event
        sendEvent({
          type: 'complete',
          sessionId: session.id,
          keywords,
          clusters,
        });

        closeStream();
      } catch (error) {
        console.error('[POST /api/app-ideas/discover/stream] Error:', error);
        sendEvent({
          type: 'error',
          message: error instanceof Error ? error.message : 'Discovery failed',
        });
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
}

/**
 * Get keywords from an app's metadata
 */
async function getKeywordsFromApp(
  appId: string,
  country: string,
  onProgress?: (count: number, term: string) => void
): Promise<DiscoveredKeyword[]> {
  const lookupUrl = `https://itunes.apple.com/lookup?id=${appId}&country=${country}`;
  const response = await fetch(lookupUrl);

  if (!response.ok) {
    throw new Error(`iTunes lookup failed: ${response.status}`);
  }

  const data = await response.json();
  const app = data.results?.[0];

  if (!app) {
    throw new Error('App not found');
  }

  const keywords: DiscoveredKeyword[] = [];
  const seen = new Set<string>();

  // Get app name words
  const nameWords = app.trackName
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w: string) => w.length >= 3);

  for (const word of nameWords) {
    if (!seen.has(word)) {
      seen.add(word);
      keywords.push({ term: word, priority: 8000, position: keywords.length + 1 });
      if (onProgress) onProgress(keywords.length, word);
    }
  }

  // Expand each name word to get related keywords
  for (const word of nameWords.slice(0, 3)) {
    const hints = await fetchAutosuggestHints(word, country);
    for (const hint of hints.slice(0, 10)) {
      const term = hint.term.toLowerCase();
      if (!seen.has(term)) {
        seen.add(term);
        keywords.push({
          term,
          priority: hint.priority,
          position: keywords.length + 1,
        });
        if (onProgress && keywords.length % 3 === 0) onProgress(keywords.length, term);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Also expand by app category
  if (app.primaryGenreName) {
    const categoryHints = await fetchAutosuggestHints(
      app.primaryGenreName.toLowerCase(),
      country
    );
    for (const hint of categoryHints.slice(0, 10)) {
      const term = hint.term.toLowerCase();
      if (!seen.has(term)) {
        seen.add(term);
        keywords.push({
          term,
          priority: hint.priority,
          position: keywords.length + 1,
        });
        if (onProgress && keywords.length % 3 === 0) onProgress(keywords.length, term);
      }
    }
  }

  return keywords;
}
