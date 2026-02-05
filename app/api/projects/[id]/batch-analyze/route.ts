/**
 * POST /api/projects/[id]/batch-analyze
 *
 * Processes ALL reviews for a project through Claude in chunks of 200,
 * then merges the results into a single deduplicated analysis.
 *
 * This replaces the old analyze route that sampled only 120 of 5,000 reviews
 * (97% data loss). Now every review is processed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getProject } from '@/lib/supabase';
import { chunkReviews, processReviewChunk } from '@/lib/analysis/batch-processor';
import { mergeChunkResults } from '@/lib/analysis/chunk-merger';

// Allow up to 5 minutes for large review sets
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured on server' },
      { status: 500 }
    );
  }

  const { id } = await params;

  // 3. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: `Invalid project ID format: ${id}` },
      { status: 400 }
    );
  }

  try {
    // 4. Fetch the project
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 5. Validate reviews exist
    if (!project.reviews || project.reviews.length === 0) {
      return NextResponse.json(
        { error: 'Project has no reviews to analyze. Scrape reviews first.' },
        { status: 400 }
      );
    }

    const reviews = project.reviews;
    const appName = project.app_name;

    // 6. Chunk the reviews
    const chunks = chunkReviews(reviews, 200);
    const totalChunks = chunks.length;

    console.log(
      `[batch-analyze] Starting analysis for "${appName}": ` +
      `${reviews.length} reviews in ${totalChunks} chunks`
    );

    const startTime = Date.now();

    // 7. Process chunks sequentially with delay between each
    const chunkResults = [];
    for (let i = 0; i < totalChunks; i++) {
      console.log(
        `[batch-analyze] Processing chunk ${i + 1}/${totalChunks} ` +
        `(${chunks[i].length} reviews)`
      );

      try {
        const result = await processReviewChunk(
          chunks[i],
          appName,
          i,
          totalChunks,
          apiKey,
        );
        chunkResults.push(result);
      } catch (chunkError) {
        const message =
          chunkError instanceof Error ? chunkError.message : 'Unknown chunk error';
        console.error(`[batch-analyze] Chunk ${i + 1} failed: ${message}`);
        // Continue processing remaining chunks rather than aborting entirely
        // The merger will work with whatever chunks succeeded
        console.warn(
          `[batch-analyze] Skipping chunk ${i + 1} and continuing with remaining chunks`
        );
      }

      // 1-second delay between chunks to avoid rate limits
      if (i < totalChunks - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // 8. Verify we got at least some results
    if (chunkResults.length === 0) {
      return NextResponse.json(
        {
          error: 'All chunks failed to process. Check server logs for details.',
        },
        { status: 500 }
      );
    }

    const processingTime = Date.now() - startTime;

    // 9. Merge results
    console.log(
      `[batch-analyze] Merging ${chunkResults.length}/${totalChunks} chunk results`
    );
    const merged = mergeChunkResults(chunkResults, reviews.length, processingTime);

    console.log(
      `[batch-analyze] Analysis complete for "${appName}": ` +
      `${merged.painPoints.length} pain points, ` +
      `${merged.featureRequests.length} feature requests, ` +
      `${merged.competitorMentions.length} competitor mentions, ` +
      `${merged.userSegments.length} user segments ` +
      `(${(processingTime / 1000).toFixed(1)}s)`
    );

    // 10. Return merged result
    return NextResponse.json({
      success: true,
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
    console.error(`[batch-analyze] Fatal error: ${message}`);
    return NextResponse.json(
      { error: `Batch analysis failed: ${message}` },
      { status: 500 }
    );
  }
}
