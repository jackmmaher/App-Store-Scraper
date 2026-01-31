// Pipeline Job Processor
// Processes background jobs for the unified opportunity pipeline

import { supabase } from '@/lib/supabase';
import {
  scoreOpportunity,
  scoreOpportunityBasic,
  upsertOpportunity,
  recordOpportunityHistory,
} from '@/lib/opportunity';
import { expandSeedKeyword } from '@/lib/keywords/autosuggest';

// ============================================================================
// Types
// ============================================================================

export interface PipelineJob {
  id: string;
  job_type: 'discover' | 'score_basic' | 'enrich_full';
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  params: Record<string, unknown>;
  total_items: number | null;
  processed_items: number;
  result: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Job Queue Operations
// ============================================================================

/**
 * Claim the next pending job from the queue
 */
export async function claimNextJob(
  jobTypes?: ('discover' | 'score_basic' | 'enrich_full')[]
): Promise<PipelineJob | null> {
  const { data, error } = await supabase.rpc('claim_pipeline_job', {
    p_job_types: jobTypes || null,
  });

  if (error) {
    console.error('Error claiming job:', error);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Create a new job if one doesn't already exist
 */
export async function createJobIfNotExists(
  jobType: 'discover' | 'score_basic' | 'enrich_full',
  params: Record<string, unknown>,
  priority: number = 0
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_pipeline_job_if_not_exists', {
    p_job_type: jobType,
    p_params: params,
    p_priority: priority,
  });

  if (error) {
    console.error('Error creating job:', error);
    return null;
  }

  return data;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  processedItems: number,
  totalItems?: number
): Promise<void> {
  const updateData: Record<string, unknown> = {
    processed_items: processedItems,
  };

  if (totalItems !== undefined) {
    updateData.total_items = totalItems;
  }

  await supabase
    .from('pipeline_jobs')
    .update(updateData)
    .eq('id', jobId);
}

/**
 * Complete a job successfully
 */
export async function completeJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  await supabase
    .from('pipeline_jobs')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Fail a job with error
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<void> {
  // Get current retry count
  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('retry_count, max_retries')
    .eq('id', jobId)
    .single();

  if (!job) return;

  const newRetryCount = (job.retry_count || 0) + 1;
  const shouldRetry = newRetryCount < (job.max_retries || 3);

  await supabase
    .from('pipeline_jobs')
    .update({
      status: shouldRetry ? 'pending' : 'failed',
      error_message: errorMessage,
      retry_count: newRetryCount,
      completed_at: shouldRetry ? null : new Date().toISOString(),
      started_at: null, // Reset for retry
    })
    .eq('id', jobId);
}

// ============================================================================
// Job Processors
// ============================================================================

/**
 * Process a discover job - expands seed keywords via autosuggest
 * and queues basic scoring jobs for each
 */
async function processDiscoverJob(job: PipelineJob): Promise<JobResult> {
  const { seed, category, country = 'us' } = job.params as {
    seed: string;
    category: string;
    country?: string;
  };

  if (!seed || !category) {
    return { success: false, message: 'Missing seed or category' };
  }

  try {
    // Expand seed keyword
    const expanded = await expandSeedKeyword(seed, country, 2);
    const keywords = expanded.map(h => h.term.toLowerCase());

    // Add the seed itself
    if (!keywords.includes(seed.toLowerCase())) {
      keywords.unshift(seed.toLowerCase());
    }

    await updateJobProgress(job.id, 0, keywords.length);

    // Queue basic scoring jobs for each keyword
    let queued = 0;
    for (const keyword of keywords) {
      const jobId = await createJobIfNotExists('score_basic', {
        keyword,
        category,
        country,
      });
      if (jobId) queued++;
    }

    return {
      success: true,
      message: `Discovered ${keywords.length} keywords, queued ${queued} scoring jobs`,
      data: { keywords_discovered: keywords.length, jobs_queued: queued },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

/**
 * Process a score_basic job - quick scoring using iTunes + autosuggest only
 */
async function processScoreBasicJob(job: PipelineJob): Promise<JobResult> {
  const { keyword, category, country = 'us' } = job.params as {
    keyword: string;
    category: string;
    country?: string;
  };

  if (!keyword || !category) {
    return { success: false, message: 'Missing keyword or category' };
  }

  try {
    // Score using basic (fast) scoring
    const result = await scoreOpportunityBasic(keyword, category, country);

    // Save to opportunities table
    const saved = await upsertOpportunity(result);
    if (saved) {
      await recordOpportunityHistory(saved.id, result);
    }

    // Also update keywords table with basic enrichment data
    await supabase
      .from('keywords')
      .upsert({
        keyword,
        country,
        category,
        opportunity_score: result.opportunity_score,
        competition_gap_score: result.dimensions.competition_gap,
        market_demand_score: result.dimensions.market_demand,
        revenue_potential_score: result.dimensions.revenue_potential,
        trend_momentum_score: result.dimensions.trend_momentum,
        execution_feasibility_score: result.dimensions.execution_feasibility,
        enrichment_level: 'basic',
        enriched_at: new Date().toISOString(),
        reasoning: result.reasoning,
        top_competitor_weaknesses: result.top_competitor_weaknesses,
        suggested_differentiator: result.suggested_differentiator,
        scored_at: new Date().toISOString(),
      }, {
        onConflict: 'keyword,country',
      });

    return {
      success: true,
      message: `Scored "${keyword}" with opportunity score ${result.opportunity_score}`,
      data: {
        opportunity_score: result.opportunity_score,
        opportunity_id: saved?.id,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

/**
 * Process an enrich_full job - full enrichment with trends, reddit, etc.
 */
async function processEnrichFullJob(job: PipelineJob): Promise<JobResult> {
  const { keyword, category, country = 'us' } = job.params as {
    keyword: string;
    category: string;
    country?: string;
  };

  if (!keyword || !category) {
    return { success: false, message: 'Missing keyword or category' };
  }

  try {
    // Score using full (slow) scoring with all data sources
    const result = await scoreOpportunity(keyword, category, country);

    // Save to opportunities table
    const saved = await upsertOpportunity(result);
    if (saved) {
      await recordOpportunityHistory(saved.id, result);
    }

    // Update keywords table with full enrichment data
    await supabase
      .from('keywords')
      .upsert({
        keyword,
        country,
        category,
        opportunity_score: result.opportunity_score,
        competition_gap_score: result.dimensions.competition_gap,
        market_demand_score: result.dimensions.market_demand,
        revenue_potential_score: result.dimensions.revenue_potential,
        trend_momentum_score: result.dimensions.trend_momentum,
        execution_feasibility_score: result.dimensions.execution_feasibility,
        enrichment_level: 'full',
        enriched_at: new Date().toISOString(),
        raw_data: result.raw_data,
        reasoning: result.reasoning,
        top_competitor_weaknesses: result.top_competitor_weaknesses,
        suggested_differentiator: result.suggested_differentiator,
        scored_at: new Date().toISOString(),
      }, {
        onConflict: 'keyword,country',
      });

    return {
      success: true,
      message: `Fully enriched "${keyword}" with opportunity score ${result.opportunity_score}`,
      data: {
        opportunity_score: result.opportunity_score,
        opportunity_id: saved?.id,
        has_trends: !!result.raw_data.google_trends,
        has_reddit: !!result.raw_data.reddit,
        has_pain_points: !!result.raw_data.pain_points,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message };
  }
}

// ============================================================================
// Main Process Function
// ============================================================================

/**
 * Process a single job based on its type
 */
export async function processJob(job: PipelineJob): Promise<JobResult> {
  console.log(`Processing ${job.job_type} job ${job.id}...`);

  let result: JobResult;

  switch (job.job_type) {
    case 'discover':
      result = await processDiscoverJob(job);
      break;
    case 'score_basic':
      result = await processScoreBasicJob(job);
      break;
    case 'enrich_full':
      result = await processEnrichFullJob(job);
      break;
    default:
      result = { success: false, message: `Unknown job type: ${job.job_type}` };
  }

  // Update job status based on result
  if (result.success) {
    await completeJob(job.id, result.data || {});
  } else {
    await failJob(job.id, result.message);
  }

  console.log(`Job ${job.id} ${result.success ? 'completed' : 'failed'}: ${result.message}`);
  return result;
}

/**
 * Process multiple jobs from the queue
 * Returns the number of jobs processed
 */
export async function processJobs(
  maxJobs: number = 5,
  jobTypes?: ('discover' | 'score_basic' | 'enrich_full')[]
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextJob(jobTypes);
    if (!job) break;

    await processJob(job);
    processed++;
  }

  return processed;
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats(): Promise<{
  pending_count: number;
  running_count: number;
  completed_today: number;
  failed_today: number;
  avg_processing_time_ms: number | null;
}> {
  const { data, error } = await supabase.rpc('get_pipeline_stats');

  if (error || !data?.[0]) {
    return {
      pending_count: 0,
      running_count: 0,
      completed_today: 0,
      failed_today: 0,
      avg_processing_time_ms: null,
    };
  }

  return data[0];
}
