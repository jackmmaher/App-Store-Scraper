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

// Generate deterministic review ID from content (avoids collisions from Date.now + Math.random)
async function generateReviewId(author: string, content: string): Promise<string> {
  const text = `${author}:${content.slice(0, 100)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `review-${hashHex.slice(0, 16)}`;
}

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
  rating: number | null;
  title: string;
  content: string;
  version: string;
  vote_count: number;
  vote_sum: number;
  country: string;
  sort_source: string;
  date?: string;
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
        // Track if stream has been closed to prevent double-close
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

        // Track if we're still running
        let isRunning = true;
        let heartbeatCount = 0;

        // Calculate estimated timing based on targets
        // RSS phase: ~30-60s, Browser phase: ~60-180s depending on review count
        const totalReviewTarget = enabledFilters.reduce((sum, f) => sum + f.target, 0);
        const estimatedPagesPerFilter = Math.ceil(totalReviewTarget / enabledFilters.length / 10); // ~10 reviews per page
        const estimatedSecondsPerFilter = Math.max(30, Math.min(120, totalReviewTarget / enabledFilters.length / 5)); // 5 reviews/sec estimate

        // Start heartbeat to keep connection alive and show progress
        const heartbeatInterval = setInterval(() => {
          if (!isRunning) {
            clearInterval(heartbeatInterval);
            return;
          }
          heartbeatCount++;
          const elapsedSeconds = Math.round(heartbeatCount * 1.5);

          // Estimate which filter we're on based on elapsed time
          const estimatedFilterIndex = Math.min(
            Math.floor(elapsedSeconds / estimatedSecondsPerFilter),
            enabledFilters.length - 1
          );

          // Estimate page within current filter
          const timeInCurrentFilter = elapsedSeconds - (estimatedFilterIndex * estimatedSecondsPerFilter);
          const filterProgress = Math.min(timeInCurrentFilter / estimatedSecondsPerFilter, 0.95); // Cap at 95% until complete
          const estimatedPage = Math.max(1, Math.ceil(filterProgress * estimatedPagesPerFilter));

          // Estimate reviews collected so far (rough approximation)
          const completedFiltersReviews = estimatedFilterIndex * (totalReviewTarget / enabledFilters.length);
          const currentFilterReviews = filterProgress * (enabledFilters[estimatedFilterIndex]?.target || 500);
          const estimatedTotalReviews = Math.round(completedFiltersReviews + currentFilterReviews);

          sendEvent({
            type: 'heartbeat',
            filter: enabledFilters[estimatedFilterIndex]?.sort || 'mostRecent',
            filterIndex: estimatedFilterIndex,
            elapsedSeconds,
            // Include estimated progress data
            page: estimatedPage,
            maxPages: estimatedPagesPerFilter,
            estimatedReviews: estimatedTotalReviews,
            filterReviewsEstimate: Math.round(currentFilterReviews),
            message: `Crawling ${enabledFilters[estimatedFilterIndex]?.sort || 'reviews'}...`,
            // Phase indicator: RSS (~first 30s) or Browser (after)
            phase: elapsedSeconds < 30 ? 'rss' : 'browser',
            // Add timeout awareness
            timeRemaining: Math.max(0, 660 - elapsedSeconds),
          });
        }, 1500);

        try {
          // Send start event
          sendEvent({
            type: 'start',
            filters: enabledFilters.map((f) => f.sort),
            totalTarget,
          });

          // Call the Python crawler - it handles all sort types internally
          // 11 minute timeout for the crawl request
          // Must be > Python timeout (8 min browser + 2 min RSS = 10 min max) + buffer
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 11 * 60 * 1000);

          let response: Response;
          try {
            response = await fetch(`${CRAWL_SERVICE_URL}/crawl/app-store/reviews`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                app_id: appId,
                country,
                max_reviews: totalTarget,
              }),
              signal: abortController.signal,
            });
          } finally {
            clearTimeout(timeoutId); // Always clear timeout to prevent leaks
          }

          // Stop heartbeat
          isRunning = false;
          clearInterval(heartbeatInterval);

          if (!response.ok) {
            const errorText = await response.text();
            sendEvent({
              type: 'error',
              message: `Crawler error: ${response.status} - ${errorText}`,
            });
            // Let finally block handle stream cleanup
            return;
          }

          const data = await response.json();
          const reviews = data.reviews || [];

          // Format all reviews to match Review interface
          // Note: rating is null when missing so it can be filtered out in analytics
          // (defaulting to 0 or 5 would bias average rating calculations)
          const formattedReviews: Review[] = await Promise.all(
            reviews.map(async (r: Record<string, unknown>) => {
              // Parse rating - use null for missing/invalid values to avoid biasing analytics
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

              // Use deterministic ID generation to avoid collisions
              const id = r.id
                ? String(r.id)
                : await generateReviewId(author, content);

              return {
                id,
                author,
                rating,
                title: String(r.title || ''),
                content,
                version: String(r.version || 'Unknown'),
                vote_count: Number(r.vote_count || r.helpful_count) || 0,
                vote_sum: Number(r.vote_sum) || 0,
                country: String(r.country || country),
                sort_source: String(r.sort_source || 'mostRecent'),
                date: String(r.date || r.dateISO || ''),
              };
            })
          );

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

          // Calculate stats - filter out null ratings to avoid biasing analytics
          const validRatings = formattedReviews
            .map((r) => r.rating)
            .filter((r): r is number => r !== null);
          const avgRating = validRatings.length > 0
            ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
            : 0;

          const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, 'null': 0 };
          for (const review of formattedReviews) {
            const key = review.rating !== null ? String(review.rating) : 'null';
            ratingDistribution[key] = (ratingDistribution[key] || 0) + 1;
          }

          // Send reviews in batches to avoid SSE truncation with large payloads
          const BATCH_SIZE = 200;
          const totalBatches = Math.ceil(formattedReviews.length / BATCH_SIZE);

          console.log(`Sending ${formattedReviews.length} reviews in ${totalBatches} batches`);

          for (let i = 0; i < formattedReviews.length; i += BATCH_SIZE) {
            const batch = formattedReviews.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            sendEvent({
              type: 'reviewBatch',
              reviews: batch,
              batchNumber,
              totalBatches,
              totalReviews: formattedReviews.length,
            });
          }

          // Send complete event with just stats (reviews already sent in batches)
          sendEvent({
            type: 'complete',
            reviews: [], // Reviews already sent via batches
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
              errorMessage = 'Review scraping timed out after 11 minutes. Try reducing the number of reviews (under 1000) or contact support if this persists.';
            } else if (error.message === 'fetch failed' || (error.cause && typeof error.cause === 'object')) {
              // Connection dropped - service likely crashed
              const elapsedSecondsApprox = Math.round(heartbeatCount * 1.5);
              errorMessage = `Connection to crawler service lost after ${elapsedSecondsApprox} seconds. ` +
                'Possible causes: (1) Crawler timed out - try fewer reviews, ' +
                '(2) Out of memory - check Python logs, ' +
                '(3) Playwright browser crashed. Check crawl-service logs for details.';
            } else {
              errorMessage = error.message;
            }
          }

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
