import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import type { ReviewScrapeSession, Review, ReviewStats } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const CRAWL_SERVICE_URL = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';

export const maxDuration = 600; // 10 minutes for scraping

interface RouteParams {
  params: Promise<{ id: string; sessionId: string }>;
}

// Generate deterministic review ID from content
async function generateReviewId(author: string, content: string): Promise<string> {
  const text = `${author}:${content.slice(0, 100)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `review-${hashHex.slice(0, 16)}`;
}

// GET /api/projects/[id]/scrape-sessions/[sessionId] - Get session details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const { data: session, error } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      console.error('[GET session] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[GET session] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

// POST /api/projects/[id]/scrape-sessions/[sessionId] - Start scraping or cancel
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const body = await request.json();
    const { action } = body as { action: 'start' | 'cancel' };

    // Get current session with project ownership check
    const { data: session, error: fetchError } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      // Cancel the session
      const { error } = await supabase
        .from('review_scrape_sessions')
        .update({
          status: 'cancelled',
          progress: { message: 'Cancelled by user' },
        })
        .eq('id', sessionId);

      if (error) {
        return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (action === 'start') {
      if (session.status !== 'pending') {
        return NextResponse.json({ error: 'Session already started or completed' }, { status: 400 });
      }

      // Start the scrape via SSE stream
      return startScrapeStream(session as ReviewScrapeSession);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[POST session action] Error:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/scrape-sessions/[sessionId] - Delete session
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const { error } = await supabase
      .from('review_scrape_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('project_id', projectId);

    if (error) {
      console.error('[DELETE session] Error:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE session] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

// Start scraping with SSE stream
async function startScrapeStream(session: ReviewScrapeSession): Promise<Response> {
  const encoder = new TextEncoder();

  // Update session to in_progress
  await supabase
    .from('review_scrape_sessions')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      progress: { message: 'Starting scrape...' },
    })
    .eq('id', session.id);

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;

      const sendEvent = (data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
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

      let isRunning = true;
      let heartbeatCount = 0;

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (!isRunning) {
          clearInterval(heartbeatInterval);
          return;
        }
        heartbeatCount++;
        sendEvent({
          type: 'heartbeat',
          elapsedSeconds: heartbeatCount * 2,
          message: 'Crawling reviews...',
        });
      }, 2000);

      try {
        sendEvent({
          type: 'start',
          sessionId: session.id,
          filters: session.filters.map(f => f.sort),
          totalTarget: session.target_reviews,
        });

        // Check crawler availability
        try {
          const healthCheck = await fetch(`${CRAWL_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (!healthCheck.ok) {
            throw new Error('Crawler not responding');
          }
        } catch {
          throw new Error('Crawler service not available. Make sure you started the app with: npm run dev:full');
        }

        // Call the Python crawler
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000);

        let response: Response;
        try {
          response = await fetch(`${CRAWL_SERVICE_URL}/crawl/app-store/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: session.app_store_id,
              country: session.country,
              max_reviews: session.target_reviews,
            }),
            signal: abortController.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        isRunning = false;
        clearInterval(heartbeatInterval);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Crawler error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const rawReviews = data.reviews || [];

        // Format reviews
        const formattedReviews: Review[] = await Promise.all(
          rawReviews.map(async (r: Record<string, unknown>) => {
            const rawRating = r.rating;
            let rating: number | null = null;
            if (rawRating !== null && rawRating !== undefined) {
              const numRating = Number(rawRating);
              if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
                rating = numRating;
              }
            }

            const author = String(r.author || 'Anonymous');
            const content = String(r.content || r.text || '');
            const id = r.id ? String(r.id) : await generateReviewId(author, content);

            return {
              id,
              author,
              rating,
              title: String(r.title || ''),
              content,
              version: String(r.version || 'Unknown'),
              vote_count: Number(r.vote_count || r.helpful_count) || 0,
              vote_sum: Number(r.vote_sum) || 0,
              country: String(r.country || session.country),
              sort_source: String(r.sort_source || 'mostRecent'),
              date: String(r.date || r.dateISO || ''),
            };
          })
        );

        // Calculate stats
        const validRatings = formattedReviews
          .map(r => r.rating)
          .filter((r): r is number => r !== null);
        const avgRating = validRatings.length > 0
          ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
          : 0;

        const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, 'null': 0 };
        for (const review of formattedReviews) {
          const key = review.rating !== null ? String(review.rating) : 'null';
          ratingDistribution[key] = (ratingDistribution[key] || 0) + 1;
        }

        const sortCounts: Record<string, number> = {};
        for (const review of formattedReviews) {
          const source = review.sort_source || 'unknown';
          sortCounts[source] = (sortCounts[source] || 0) + 1;
        }

        const stats: ReviewStats = {
          total: formattedReviews.length,
          average_rating: Math.round(avgRating * 10) / 10,
          rating_distribution: ratingDistribution,
          countries_scraped: [session.country],
        };

        // Update session with results
        await supabase
          .from('review_scrape_sessions')
          .update({
            status: 'completed',
            reviews_collected: formattedReviews.length,
            reviews: formattedReviews,
            stats,
            completed_at: new Date().toISOString(),
            progress: { message: 'Completed' },
          })
          .eq('id', session.id);

        sendEvent({
          type: 'complete',
          sessionId: session.id,
          reviewsCollected: formattedReviews.length,
          stats,
        });

      } catch (error) {
        isRunning = false;
        clearInterval(heartbeatInterval);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update session with error
        await supabase
          .from('review_scrape_sessions')
          .update({
            status: 'failed',
            progress: { message: errorMessage },
          })
          .eq('id', session.id);

        sendEvent({
          type: 'error',
          message: errorMessage,
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
}
