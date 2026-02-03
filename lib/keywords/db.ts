// Keyword Database Operations
// CRUD operations for keywords, rankings, history, and jobs

import { supabase, escapeSearchString } from '../supabase';
import {
  Keyword,
  KeywordRanking,
  KeywordHistory,
  KeywordJob,
  KeywordJobType,
  KeywordJobParams,
  KeywordScoreResult,
  SearchKeywordsParams,
  SearchKeywordsResponse,
  DiscoveredKeyword,
} from './types';

// ============================================================================
// Keywords CRUD
// ============================================================================

/**
 * Upsert a keyword with scores
 */
export async function upsertKeyword(
  keyword: string,
  country: string,
  scores: Partial<KeywordScoreResult>,
  discoveryMeta?: {
    discovered_via?: string;
    source_app_id?: string;
    source_category?: string;
    source_seed?: string;
  }
): Promise<Keyword | null> {
  const { data, error } = await supabase
    .from('keywords')
    .upsert(
      {
        keyword: keyword.toLowerCase().trim(),
        country,
        volume_score: scores.volume_score ?? null,
        difficulty_score: scores.difficulty_score ?? null,
        opportunity_score: scores.opportunity_score ?? null,
        autosuggest_priority: scores.raw?.autosuggest_priority ?? null,
        autosuggest_position: scores.raw?.autosuggest_position ?? null,
        trigger_chars: scores.raw?.trigger_chars ?? null,
        total_results: scores.raw?.total_results ?? null,
        top10_avg_reviews: scores.raw?.top10_avg_reviews ?? null,
        top10_avg_rating: scores.raw?.top10_avg_rating ?? null,
        top10_title_matches: scores.raw?.top10_title_matches ?? null,
        discovered_via: discoveryMeta?.discovered_via ?? null,
        source_app_id: discoveryMeta?.source_app_id ?? null,
        source_category: discoveryMeta?.source_category ?? null,
        source_seed: discoveryMeta?.source_seed ?? null,
        scored_at: scores.volume_score !== undefined ? new Date().toISOString() : null,
      },
      {
        onConflict: 'keyword,country',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting keyword:', error);
    return null;
  }

  return data;
}

/**
 * Upsert discovered keyword (without scores)
 */
export async function upsertDiscoveredKeyword(
  discovered: DiscoveredKeyword,
  country: string
): Promise<Keyword | null> {
  const { data, error } = await supabase
    .from('keywords')
    .upsert(
      {
        keyword: discovered.keyword.toLowerCase().trim(),
        country,
        autosuggest_priority: discovered.priority ?? null,
        autosuggest_position: discovered.position ?? null,
        trigger_chars: discovered.trigger_chars ?? null,
        discovered_via: discovered.discovered_via,
        source_app_id: discovered.source_app_id ?? null,
        source_category: discovered.source_category ?? null,
        source_seed: discovered.source_seed ?? null,
      },
      {
        onConflict: 'keyword,country',
        ignoreDuplicates: true, // Don't overwrite existing keywords
      }
    )
    .select()
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error upserting discovered keyword:', error);
    return null;
  }

  return data;
}

/**
 * Bulk upsert discovered keywords
 */
export async function bulkUpsertDiscoveredKeywords(
  keywords: DiscoveredKeyword[],
  country: string
): Promise<number> {
  const rows = keywords.map((k) => ({
    keyword: k.keyword.toLowerCase().trim(),
    country,
    autosuggest_priority: k.priority ?? null,
    autosuggest_position: k.position ?? null,
    trigger_chars: k.trigger_chars ?? null,
    discovered_via: k.discovered_via,
    source_app_id: k.source_app_id ?? null,
    source_category: k.source_category ?? null,
    source_seed: k.source_seed ?? null,
  }));

  // Process in batches
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('keywords').upsert(batch, {
      onConflict: 'keyword,country',
      ignoreDuplicates: true,
    });

    if (error) {
      console.error('Error bulk upserting keywords:', error);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Get a keyword by keyword text and country
 */
export async function getKeyword(
  keyword: string,
  country: string
): Promise<Keyword | null> {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('keyword', keyword.toLowerCase().trim())
    .eq('country', country)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting keyword:', error);
    }
    return null;
  }

  return data;
}

/**
 * Get keywords discovered from a specific app (by source_app_id)
 * Used for ASO to include review-extracted keywords in the prompt
 */
export async function getKeywordsBySourceApp(
  sourceAppId: string,
  country: string = 'us',
  limit: number = 50
): Promise<Keyword[]> {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('source_app_id', sourceAppId)
    .eq('country', country)
    .not('volume_score', 'is', null) // Only scored keywords
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('Error getting keywords by source app:', error);
    return [];
  }

  return data || [];
}

/**
 * Search keywords with filters
 */
export async function searchKeywords(
  params: SearchKeywordsParams
): Promise<SearchKeywordsResponse> {
  const {
    q,
    country = 'us',
    sort = 'opportunity',
    sort_dir = 'desc',
    min_volume,
    max_volume,
    min_difficulty,
    max_difficulty,
    min_opportunity,
    discovered_via,
    page = 1,
    limit = 50,
  } = params;

  let query = supabase
    .from('keywords')
    .select('*', { count: 'exact' })
    .eq('country', country);

  // Text search (escape wildcards to prevent injection)
  if (q) {
    query = query.ilike('keyword', `%${escapeSearchString(q)}%`);
  }

  // Score filters
  if (min_volume !== undefined) {
    query = query.gte('volume_score', min_volume);
  }
  if (max_volume !== undefined) {
    query = query.lte('volume_score', max_volume);
  }
  if (min_difficulty !== undefined) {
    query = query.gte('difficulty_score', min_difficulty);
  }
  if (max_difficulty !== undefined) {
    query = query.lte('difficulty_score', max_difficulty);
  }
  if (min_opportunity !== undefined) {
    query = query.gte('opportunity_score', min_opportunity);
  }

  // Discovery filter
  if (discovered_via) {
    query = query.eq('discovered_via', discovered_via);
  }

  // Only return scored keywords by default
  query = query.not('volume_score', 'is', null);

  // Sorting
  const sortColumn =
    sort === 'volume'
      ? 'volume_score'
      : sort === 'difficulty'
        ? 'difficulty_score'
        : sort === 'created_at'
          ? 'created_at'
          : 'opportunity_score';
  query = query.order(sortColumn, { ascending: sort_dir === 'asc' });

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error searching keywords:', error);
    return {
      keywords: [],
      total: 0,
      page,
      limit,
      has_more: false,
    };
  }

  return {
    keywords: data || [],
    total: count || 0,
    page,
    limit,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Get keywords that need scoring (no scores or stale)
 */
export async function getUnscoredKeywords(
  country: string,
  limit: number = 100
): Promise<Keyword[]> {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('country', country)
    .is('volume_score', null)
    .limit(limit);

  if (error) {
    console.error('Error getting unscored keywords:', error);
    return [];
  }

  return data || [];
}

/**
 * Get keywords with stale scores (older than specified days)
 */
export async function getStaleKeywords(
  country: string,
  staleDays: number = 7,
  limit: number = 100
): Promise<Keyword[]> {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('country', country)
    .lt('scored_at', staleDate.toISOString())
    .not('volume_score', 'is', null)
    .limit(limit);

  if (error) {
    console.error('Error getting stale keywords:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Keyword Rankings
// ============================================================================

/**
 * Save keyword rankings (top 10 apps)
 */
export async function saveKeywordRankings(
  keywordId: string,
  rankings: Array<{
    app_id: string;
    rank_position: number;
    has_keyword_in_title: boolean;
    app_name: string;
    app_review_count: number;
    app_rating: number;
    app_icon_url: string | null;
  }>
): Promise<boolean> {
  // Delete existing rankings for this keyword
  await supabase.from('keyword_rankings').delete().eq('keyword_id', keywordId);

  // Insert new rankings
  const rows = rankings.map((r) => ({
    keyword_id: keywordId,
    ...r,
  }));

  const { error } = await supabase.from('keyword_rankings').insert(rows);

  if (error) {
    console.error('Error saving keyword rankings:', error);
    return false;
  }

  return true;
}

/**
 * Get rankings for a keyword
 */
export async function getKeywordRankings(
  keywordId: string
): Promise<KeywordRanking[]> {
  const { data, error } = await supabase
    .from('keyword_rankings')
    .select('*')
    .eq('keyword_id', keywordId)
    .order('rank_position', { ascending: true });

  if (error) {
    console.error('Error getting keyword rankings:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Keyword History
// ============================================================================

/**
 * Record keyword scores in history
 */
export async function recordKeywordHistory(
  keywordId: string,
  volumeScore: number,
  difficultyScore: number,
  opportunityScore: number
): Promise<KeywordHistory | null> {
  const { data, error } = await supabase
    .from('keyword_history')
    .insert({
      keyword_id: keywordId,
      volume_score: volumeScore,
      difficulty_score: difficultyScore,
      opportunity_score: opportunityScore,
    })
    .select()
    .single();

  if (error) {
    console.error('Error recording keyword history:', error);
    return null;
  }

  return data;
}

/**
 * Get keyword history
 */
export async function getKeywordHistory(
  keywordId: string,
  limit: number = 30
): Promise<KeywordHistory[]> {
  const { data, error } = await supabase
    .from('keyword_history')
    .select('*')
    .eq('keyword_id', keywordId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting keyword history:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Job Queue
// ============================================================================

/**
 * Create a keyword job
 */
export async function createKeywordJob(
  jobType: KeywordJobType,
  params: KeywordJobParams
): Promise<KeywordJob | null> {
  const { data, error } = await supabase
    .from('keyword_jobs')
    .insert({
      job_type: jobType,
      status: 'pending',
      params,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating keyword job:', error);
    return null;
  }

  return data;
}

/**
 * Get a job by ID
 */
export async function getKeywordJob(jobId: string): Promise<KeywordJob | null> {
  const { data, error } = await supabase
    .from('keyword_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting keyword job:', error);
    }
    return null;
  }

  return data;
}

/**
 * Claim the next pending job (atomic)
 */
export async function claimNextJob(): Promise<KeywordJob | null> {
  // Find oldest pending job and mark as running in one operation
  const { data: pendingJob, error: findError } = await supabase
    .from('keyword_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (findError || !pendingJob) {
    return null;
  }

  // Update to running
  const { data, error } = await supabase
    .from('keyword_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', pendingJob.id)
    .eq('status', 'pending') // Ensure it wasn't claimed by another worker
    .select()
    .single();

  if (error) {
    console.error('Error claiming job:', error);
    return null;
  }

  return data;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: {
    processed_items?: number;
    total_items?: number;
    keywords_discovered?: number;
    keywords_scored?: number;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('keyword_jobs')
    .update(progress)
    .eq('id', jobId);

  if (error) {
    console.error('Error updating job progress:', error);
    return false;
  }

  return true;
}

/**
 * Complete a job
 */
export async function completeJob(
  jobId: string,
  stats: {
    keywords_discovered?: number;
    keywords_scored?: number;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('keyword_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ...stats,
    })
    .eq('id', jobId);

  if (error) {
    console.error('Error completing job:', error);
    return false;
  }

  return true;
}

/**
 * Fail a job
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<boolean> {
  const { error } = await supabase
    .from('keyword_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId);

  if (error) {
    console.error('Error failing job:', error);
    return false;
  }

  return true;
}

/**
 * Get recent jobs
 */
export async function getRecentJobs(limit: number = 20): Promise<KeywordJob[]> {
  const { data, error } = await supabase
    .from('keyword_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting recent jobs:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get keyword statistics
 */
export async function getKeywordStats(country: string): Promise<{
  total: number;
  scored: number;
  avgVolume: number;
  avgDifficulty: number;
  avgOpportunity: number;
  highOpportunity: number;
}> {
  const { data, error } = await supabase
    .from('keywords')
    .select('volume_score, difficulty_score, opportunity_score')
    .eq('country', country);

  if (error || !data) {
    return {
      total: 0,
      scored: 0,
      avgVolume: 0,
      avgDifficulty: 0,
      avgOpportunity: 0,
      highOpportunity: 0,
    };
  }

  const scored = data.filter((k) => k.volume_score !== null);
  const highOpp = scored.filter(
    (k) => k.opportunity_score && k.opportunity_score >= 40
  );

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    total: data.length,
    scored: scored.length,
    avgVolume: Math.round(
      avg(scored.map((k) => k.volume_score || 0)) * 10
    ) / 10,
    avgDifficulty: Math.round(
      avg(scored.map((k) => k.difficulty_score || 0)) * 10
    ) / 10,
    avgOpportunity: Math.round(
      avg(scored.map((k) => k.opportunity_score || 0)) * 10
    ) / 10,
    highOpportunity: highOpp.length,
  };
}
