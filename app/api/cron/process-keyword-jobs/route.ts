import { NextRequest, NextResponse } from 'next/server';
import {
  claimNextJob,
  updateJobProgress,
  completeJob,
  failJob,
  bulkUpsertDiscoveredKeywords,
  upsertKeyword,
} from '@/lib/keywords/db';
import {
  discoverFromSeed,
  discoverFromCompetitor,
  discoverFromCategory,
} from '@/lib/keywords/discovery';
import { scoreKeyword } from '@/lib/keywords/scoring';
import { DiscoveredKeyword } from '@/lib/keywords/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// GET /api/cron/process-keyword-jobs - Process pending keyword jobs
// Should be called by cron every 5 minutes
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    // Claim next pending job
    const job = await claimNextJob();

    if (!job) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs',
      });
    }

    const params = job.params;
    const country = params.country || 'us';

    try {
      let discovered = 0;
      let scored = 0;
      const keywords: DiscoveredKeyword[] = [];

      // Run discovery based on job type
      if (job.job_type === 'discover_seed' && params.seed) {
        const results = await discoverFromSeed(
          params.seed,
          country,
          params.depth || 2,
          (kw) => keywords.push(kw)
        );
        discovered = results.length;
      } else if (job.job_type === 'discover_competitor' && params.app_id) {
        // For competitor discovery, we need app data which should be in params
        // This is typically triggered with full app data from the UI
        console.log('Competitor discovery requires app data - skipping');
      } else if (job.job_type === 'discover_category' && params.category) {
        const results = await discoverFromCategory(
          params.category,
          country,
          apiKey,
          (kw) => keywords.push(kw)
        );
        discovered = results.length;
      } else if (job.job_type === 'score_bulk' && params.keywords) {
        // Bulk score existing keywords
        const keywordsToScore = params.keywords;
        await updateJobProgress(job.id, { total_items: keywordsToScore.length });

        for (let i = 0; i < keywordsToScore.length; i++) {
          const kw = keywordsToScore[i];
          try {
            const scores = await scoreKeyword(kw, country);
            await upsertKeyword(kw, country, scores);
            scored++;

            await updateJobProgress(job.id, {
              processed_items: i + 1,
              keywords_scored: scored,
            });

            // Rate limiting
            await new Promise((r) => setTimeout(r, 300));
          } catch (err) {
            console.error(`Error scoring ${kw}:`, err);
          }
        }

        await completeJob(job.id, { keywords_scored: scored });
        return NextResponse.json({
          success: true,
          job_id: job.id,
          job_type: job.job_type,
          scored,
        });
      }

      // Update progress
      await updateJobProgress(job.id, {
        keywords_discovered: discovered,
        total_items: keywords.length,
      });

      // Bulk save discovered keywords
      if (keywords.length > 0) {
        await bulkUpsertDiscoveredKeywords(keywords, country);
      }

      // Score discovered keywords
      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        try {
          const scores = await scoreKeyword(kw.keyword, country);
          await upsertKeyword(kw.keyword, country, scores, {
            discovered_via: kw.discovered_via,
            source_seed: kw.source_seed,
            source_category: kw.source_category,
          });
          scored++;

          await updateJobProgress(job.id, {
            processed_items: i + 1,
            keywords_scored: scored,
          });

          // Rate limiting
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          console.error(`Error scoring ${kw.keyword}:`, err);
        }
      }

      await completeJob(job.id, {
        keywords_discovered: discovered,
        keywords_scored: scored,
      });

      return NextResponse.json({
        success: true,
        job_id: job.id,
        job_type: job.job_type,
        discovered,
        scored,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Job failed';
      await failJob(job.id, errorMessage);

      return NextResponse.json({
        success: false,
        job_id: job.id,
        error: errorMessage,
      });
    }
  } catch (error) {
    console.error('Error processing jobs:', error);
    return NextResponse.json(
      { error: 'Failed to process jobs' },
      { status: 500 }
    );
  }
}
