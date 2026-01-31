/**
 * Python Reviews Streaming API
 *
 * Proxies to the Python crawler service and streams results back via SSE.
 */

import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

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

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Send start event
          sendEvent({
            type: 'start',
            filters: filters.map((f) => f.sort),
            totalTarget,
          });

          // Call the Python crawler
          const response = await fetch(`${CRAWL_SERVICE_URL}/crawl/app-store/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              app_id: appId,
              country,
              max_reviews: totalTarget,
            }),
          });

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
          const formattedReviews = reviews.map((r: Record<string, unknown>) => ({
            id: String(r.id || `review-${Date.now()}-${Math.random()}`),
            author: String(r.author || 'Anonymous'),
            rating: Number(r.rating) || 5,
            title: String(r.title || ''),
            content: String(r.content || r.text || ''),
            version: String(r.version || 'Unknown'),
            vote_count: Number(r.vote_count) || 0,
            vote_sum: Number(r.vote_sum) || 0,
            country: country,
            sort_source: filters[0]?.sort || 'mostRecent',
          }));

          // Stream progress updates in batches
          const batchSize = 50;
          for (let i = 0; i < formattedReviews.length; i += batchSize) {
            const sent = Math.min(i + batchSize, formattedReviews.length);

            // Send progress event
            sendEvent({
              type: 'progress',
              filter: filters[0]?.sort || 'mostRecent',
              filterIndex: 0,
              page: Math.floor(i / batchSize) + 1,
              maxPages: Math.ceil(formattedReviews.length / batchSize),
              reviewsThisPage: Math.min(batchSize, formattedReviews.length - i),
              totalUnique: sent,
              filterReviewsTotal: sent,
              nextDelayMs: 0,
            });

            // Small delay between progress updates
            await new Promise((r) => setTimeout(r, 50));
          }

          // Calculate stats
          const ratings = formattedReviews.map((r: { rating: number }) => r.rating);
          const avgRating = ratings.length > 0
            ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
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
            },
          });
        } catch (error) {
          sendEvent({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
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
