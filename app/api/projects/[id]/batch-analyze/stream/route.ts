/**
 * GET /api/projects/[id]/batch-analyze/stream
 *
 * SSE streaming endpoint for batch review analysis. Sends real-time progress
 * events as each chunk is processed, allowing the frontend to show a progress
 * bar and incremental results.
 *
 * Event types:
 *   start          - Processing has begun, includes totalChunks and totalReviews
 *   chunk_complete - A single chunk finished processing
 *   merging        - All chunks done, merge phase starting
 *   complete       - Final merged result is ready
 *   error          - An error occurred (may be chunk-level or fatal)
 */

import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getProject } from '@/lib/supabase';
import { chunkReviews, processReviewChunk } from '@/lib/analysis/batch-processor';
import { mergeChunkResults } from '@/lib/analysis/chunk-merger';

// Allow up to 5 minutes for large review sets
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id } = await params;

  // 3. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return new Response(
      JSON.stringify({ error: `Invalid project ID format: ${id}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 4. Fetch the project before starting the stream
  let project;
  try {
    project = await getProject(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Failed to fetch project: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!project) {
    return new Response(
      JSON.stringify({ error: 'Project not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!project.reviews || project.reviews.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Project has no reviews to analyze. Scrape reviews first.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const reviews = project.reviews;
  const appName = project.app_name;
  const chunks = chunkReviews(reviews, 200);
  const totalChunks = chunks.length;

  // 5. Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(data: Record<string, unknown>) {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // If encoding fails, silently skip this event
        }
      }

      try {
        // Send start event
        sendEvent({
          type: 'start',
          totalChunks,
          totalReviews: reviews.length,
        });

        const startTime = Date.now();
        const chunkResults = [];
        let chunksProcessed = 0;

        // Process chunks sequentially
        for (let i = 0; i < totalChunks; i++) {
          try {
            const result = await processReviewChunk(
              chunks[i],
              appName,
              i,
              totalChunks,
              apiKey,
            );
            chunkResults.push(result);
            chunksProcessed++;

            sendEvent({
              type: 'chunk_complete',
              chunkIndex: i,
              chunksProcessed,
              totalChunks,
              chunkReviewCount: chunks[i].length,
              painPointsFound: result.painPoints.length,
              featureRequestsFound: result.featureRequests.length,
            });
          } catch (chunkError) {
            const message =
              chunkError instanceof Error ? chunkError.message : 'Unknown chunk error';
            console.error(
              `[batch-analyze/stream] Chunk ${i + 1}/${totalChunks} failed: ${message}`
            );

            sendEvent({
              type: 'error',
              message: `Chunk ${i + 1} failed: ${message}. Continuing with remaining chunks.`,
              chunkIndex: i,
              fatal: false,
            });
          }

          // 1-second delay between chunks to avoid rate limits
          if (i < totalChunks - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        // Check if we got any results
        if (chunkResults.length === 0) {
          sendEvent({
            type: 'error',
            message: 'All chunks failed to process. Check server logs for details.',
            fatal: true,
          });
          controller.close();
          return;
        }

        // Send merging event
        sendEvent({ type: 'merging' });

        const processingTime = Date.now() - startTime;

        // Merge results
        const merged = mergeChunkResults(
          chunkResults,
          reviews.length,
          processingTime,
        );

        console.log(
          `[batch-analyze/stream] Analysis complete for "${appName}": ` +
          `${merged.painPoints.length} pain points, ` +
          `${merged.featureRequests.length} feature requests, ` +
          `${merged.competitorMentions.length} competitor mentions ` +
          `(${(processingTime / 1000).toFixed(1)}s)`
        );

        // Send complete event with full result
        sendEvent({
          type: 'complete',
          result: merged,
          stats: {
            totalReviews: reviews.length,
            chunksProcessed: chunkResults.length,
            totalChunks,
            chunksFailed: totalChunks - chunkResults.length,
            processingTimeMs: processingTime,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[batch-analyze/stream] Fatal error: ${message}`);

        sendEvent({
          type: 'error',
          message: `Batch analysis failed: ${message}`,
          fatal: true,
        });
      } finally {
        controller.close();
      }
    },
  });

  // 6. Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
