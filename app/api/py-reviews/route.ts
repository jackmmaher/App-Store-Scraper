/**
 * Python Reviews Streaming API
 *
 * Proxies to the Python crawler service and streams results back via SSE.
 * Sends heartbeat events while crawler is working to keep connection alive.
 */

import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes for large apps

const CRAWL_SERVICE_URL = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';

interface ReviewFilter {
  sort: string;
  target: number;
}

interface ReviewRequest {
  appId: string;
  country?: string;
  streaming?: boolean;
  filters?: ReviewFilter[];
  stealth?: {
    baseDelay?: number;
    randomization?: number;
    filterCooldown?: number;
    autoThrottle?: boolean;
  };
}

interface Review {
  id: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  version: string;
  vote_count: number;
  vote_sum: number;
  country: string;
  sort_source: string;
}

export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: ReviewRequest = await request.json();
    const { appId, country = 'us', filters = [] } = body;

    if (!appId) {
      return new Response(JSON.stringify({ error: 'Missing appId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if crawler is available
    try {
      const healthCheck = await fetch(`${CRAWL_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!healthCheck.ok) {
        throw new Error('Crawler not responding');
      }
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Crawler service not available. Make sure you started the app with: npm run dev:full',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate total reviews to fetch
    const totalTarget = filters.reduce((sum, f) => sum + f.target, 0) || 500;
    const enabledFilters = filters.length > 0 ? filters : [{ sort: 'mostRecent', target: 500 }];

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Controller might be closed
          }
        };

        // Track if we're still running
        let isRunning = true;
        let heartbeatCount = 0;

        // Start heartbeat to keep connection alive and show progress
        // NOTE: We don't send fake filter counts - only filterComplete events have real data
        const heartbeatInterval = setInterval(() => {
          if (!isRunning) {
            clearInterval(heartbeatInterval);
            return;
          }
          heartbeatCount++;

          // Estimate which filter we're on based on time (each filter takes ~20-30s)
          const estimatedFilterIndex = Math.min(
            Math.floor(heartbeatCount / 15), // ~15 heartbeats per filter at 2s interval
            enabledFilters.length - 1
          );

          sendEvent({
            type: 'heartbeat',
            filter: enabledFilters[estimatedFilterIndex]?.sort || 'mostRecent',
            filterIndex: estimatedFilterIndex,
            elapsedSeconds: heartbeatCount * 2,
            message: `Crawling ${enabledFilters[estimatedFilterIndex]?.sort || 'reviews'}...`,
          });
        }, 2000);

        try {
          // Send start event
          sendEvent({
            type: 'start',
            filters: enabledFilters.map((f) => f.sort),
            totalTarget,
          });

          // Call the Python crawler - it handles all sort types internally
          // 5 minute timeout for the crawl request (browser scraping can be slow)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

          const response = await fetch(`${CRAWL_SERVICE_URL}/crawl/app-store/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: appId,
              country,
              max_reviews: totalTarget,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Stop heartbeat
          isRunning = false;
          clearInterval(heartbeatInterval);

          if (!response.ok) {
            const errorText = await response.text();
            sendEvent({
              type: 'error',
              message: `Crawler error: ${response.status} - ${errorText}`,
            });
            controller.close();
            return;
          }

          const data = await response.json();
          const reviews = data.reviews || [];

          // Format all reviews to match Review interface
          const formattedReviews: Review[] = reviews.map((r: Record<string, unknown>) => ({
            id: String(r.id || `review-${Date.now()}-${Math.random()}`),
            author: String(r.author || 'Anonymous'),
            rating: Number(r.rating) || 5,
            title: String(r.title || ''),
            content: String(r.content || r.text || ''),
            version: String(r.version || 'Unknown'),
            vote_count: Number(r.vote_count) || 0,
            vote_sum: Number(r.vote_sum) || 0,
            country: String(r.country || country),
            sort_source: String(r.sort_source || 'mostRecent'),
          }));

          // Count reviews per sort source
          const sortCounts: Record<string, number> = {};
          for (const review of formattedReviews) {
            sortCounts[review.sort_source] = (sortCounts[review.sort_source] || 0) + 1;
          }

          // Send filterComplete events for each sort type that was processed
          for (const filter of enabledFilters) {
            const count = sortCounts[filter.sort] || 0;
            sendEvent({
              type: 'filterComplete',
              filter: filter.sort,
              reviewsCollected: count,
            });
          }

          // Send final progress with actual count
          sendEvent({
            type: 'progress',
            filter: enabledFilters[enabledFilters.length - 1]?.sort || 'mostRecent',
            filterIndex: enabledFilters.length - 1,
            page: 10,
            maxPages: 10,
            reviewsThisPage: 0,
            totalUnique: formattedReviews.length,
            filterReviewsTotal: formattedReviews.length,
            nextDelayMs: 0,
          });

          // Calculate stats
          const ratings = formattedReviews.map((r) => r.rating);
          const avgRating = ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0;

          const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
          for (const rating of ratings) {
            ratingDistribution[String(rating)] = (ratingDistribution[String(rating)] || 0) + 1;
          }

          // Send complete event with all reviews
          sendEvent({
            type: 'complete',
            reviews: formattedReviews,
            stats: {
              total: formattedReviews.length,
              average_rating: Math.round(avgRating * 10) / 10,
              rating_distribution: ratingDistribution,
              countries_scraped: [country],
              sort_sources: sortCounts,
            },
          });
        } catch (error) {
          isRunning = false;
          clearInterval(heartbeatInterval);

          let errorMessage = 'Unknown error';
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              errorMessage = 'Review scraping timed out after 5 minutes. The crawl service may be slow or unresponsive. Try reducing the number of reviews or check crawl-service logs.';
            } else {
              errorMessage = error.message;
            }
          }

          sendEvent({
            type: 'error',
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
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('py-reviews error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start review scraping' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
