// Opportunity Database Operations
// CRUD operations for opportunities, history, jobs, and daily runs

import { supabase, escapeSearchString } from '../supabase';
import {
  Opportunity,
  OpportunityHistory,
  OpportunityJob,
  OpportunityJobType,
  OpportunityJobParams,
  OpportunityScoreResult,
  DailyRun,
  SearchOpportunitiesParams,
  SearchOpportunitiesResponse,
  OpportunityStats,
  CategoryStats,
} from './types';

// ============================================================================
// Opportunities CRUD
// ============================================================================

/**
 * Upsert an opportunity with scores
 */
export async function upsertOpportunity(
  result: OpportunityScoreResult
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .upsert(
      {
        keyword: result.keyword.toLowerCase().trim(),
        category: result.category,
        country: result.country,
        competition_gap_score: result.dimensions.competition_gap,
        market_demand_score: result.dimensions.market_demand,
        revenue_potential_score: result.dimensions.revenue_potential,
        trend_momentum_score: result.dimensions.trend_momentum,
        execution_feasibility_score: result.dimensions.execution_feasibility,
        opportunity_score: result.opportunity_score,
        competition_gap_breakdown: result.breakdowns.competition_gap,
        market_demand_breakdown: result.breakdowns.market_demand,
        revenue_potential_breakdown: result.breakdowns.revenue_potential,
        trend_momentum_breakdown: result.breakdowns.trend_momentum,
        execution_feasibility_breakdown: result.breakdowns.execution_feasibility,
        raw_data: result.raw_data,
        reasoning: result.reasoning,
        top_competitor_weaknesses: result.top_competitor_weaknesses,
        suggested_differentiator: result.suggested_differentiator,
        scored_at: new Date().toISOString(),
      },
      {
        onConflict: 'keyword,category,country',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting opportunity:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
    return null;
  }

  return data;
}

/**
 * Get an opportunity by keyword, category, and country
 */
export async function getOpportunity(
  keyword: string,
  category: string,
  country: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('keyword', keyword.toLowerCase().trim())
    .eq('category', category)
    .eq('country', country)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting opportunity:', error);
    }
    return null;
  }

  return data;
}

/**
 * Get an opportunity by ID
 */
export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting opportunity by ID:', error);
    }
    return null;
  }

  return data;
}

/**
 * Search opportunities with filters
 */
export async function searchOpportunities(
  params: SearchOpportunitiesParams
): Promise<SearchOpportunitiesResponse> {
  const {
    q,
    category,
    country = 'us',
    status,
    sort = 'opportunity_score',
    sort_dir = 'desc',
    min_score,
    max_score,
    page = 1,
    limit = 50,
  } = params;

  let query = supabase
    .from('opportunities')
    .select('*', { count: 'exact' })
    .eq('country', country);

  // Text search (escape wildcards to prevent injection)
  if (q) {
    query = query.ilike('keyword', `%${escapeSearchString(q)}%`);
  }

  // Category filter
  if (category) {
    query = query.eq('category', category);
  }

  // Status filter
  if (status) {
    query = query.eq('status', status);
  }

  // Score filters
  if (min_score !== undefined) {
    query = query.gte('opportunity_score', min_score);
  }
  if (max_score !== undefined) {
    query = query.lte('opportunity_score', max_score);
  }

  // Only return scored opportunities
  query = query.not('opportunity_score', 'is', null);

  // Sorting
  const sortColumn = sort === 'scored_at' ? 'scored_at' :
    sort === 'competition_gap' ? 'competition_gap_score' :
    sort === 'market_demand' ? 'market_demand_score' :
    sort === 'revenue_potential' ? 'revenue_potential_score' :
    sort === 'trend_momentum' ? 'trend_momentum_score' :
    'opportunity_score';
  query = query.order(sortColumn, { ascending: sort_dir === 'asc' });

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error searching opportunities:', error);
    return {
      opportunities: [],
      total: 0,
      page,
      limit,
      has_more: false,
    };
  }

  return {
    opportunities: data || [],
    total: count || 0,
    page,
    limit,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Get top opportunities for a category
 */
export async function getTopOpportunities(
  category: string,
  country: string = 'us',
  limit: number = 20
): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('category', category)
    .eq('country', country)
    .not('opportunity_score', 'is', null)
    .order('opportunity_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting top opportunities:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark opportunity as selected
 */
export async function selectOpportunity(id: string): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .update({
      status: 'selected',
      selected_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error selecting opportunity:', error);
    return null;
  }

  return data;
}

/**
 * Mark opportunity as blueprinted
 */
export async function markBlueprintGenerated(
  id: string,
  blueprintId: string
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .update({
      status: 'blueprinted',
      blueprint_id: blueprintId,
      blueprinted_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error marking blueprint generated:', error);
    return null;
  }

  return data;
}

// ============================================================================
// Opportunity History
// ============================================================================

/**
 * Record opportunity scores in history
 */
export async function recordOpportunityHistory(
  opportunityId: string,
  result: OpportunityScoreResult
): Promise<OpportunityHistory | null> {
  const { data, error } = await supabase
    .from('opportunity_history')
    .insert({
      opportunity_id: opportunityId,
      opportunity_score: result.opportunity_score,
      competition_gap_score: result.dimensions.competition_gap,
      market_demand_score: result.dimensions.market_demand,
      revenue_potential_score: result.dimensions.revenue_potential,
      trend_momentum_score: result.dimensions.trend_momentum,
      execution_feasibility_score: result.dimensions.execution_feasibility,
    })
    .select()
    .single();

  if (error) {
    console.error('Error recording opportunity history:', error);
    return null;
  }

  return data;
}

/**
 * Get opportunity history
 */
export async function getOpportunityHistory(
  opportunityId: string,
  limit: number = 30
): Promise<OpportunityHistory[]> {
  const { data, error } = await supabase
    .from('opportunity_history')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting opportunity history:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Job Queue
// ============================================================================

/**
 * Create an opportunity job
 */
export async function createOpportunityJob(
  jobType: OpportunityJobType,
  params: OpportunityJobParams
): Promise<OpportunityJob | null> {
  const { data, error } = await supabase
    .from('opportunity_jobs')
    .insert({
      job_type: jobType,
      status: 'pending',
      params,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating opportunity job:', error);
    return null;
  }

  return data;
}

/**
 * Get a job by ID
 */
export async function getOpportunityJob(jobId: string): Promise<OpportunityJob | null> {
  const { data, error } = await supabase
    .from('opportunity_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting opportunity job:', error);
    }
    return null;
  }

  return data;
}

/**
 * Update job progress
 */
export async function updateOpportunityJobProgress(
  jobId: string,
  progress: {
    processed_items?: number;
    total_items?: number;
    opportunities_scored?: number;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_jobs')
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
export async function completeOpportunityJob(
  jobId: string,
  stats: {
    opportunities_scored?: number;
    winner_id?: string;
    winner_keyword?: string;
    winner_score?: number;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_jobs')
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
export async function failOpportunityJob(
  jobId: string,
  errorMessage: string
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_jobs')
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

// ============================================================================
// Daily Runs
// ============================================================================

/**
 * Create a new daily run
 */
export async function createDailyRun(
  categories: string[]
): Promise<DailyRun | null> {
  // Use UTC date string for consistent date handling across timezones
  const todayUTC = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('opportunity_daily_runs')
    .insert({
      run_date: todayUTC, // Explicitly set date to avoid timezone issues
      categories_processed: categories,
      status: 'running',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating daily run:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    // If it's a unique constraint violation, try to get existing run
    if (error.code === '23505') {
      console.log('Daily run already exists for today, fetching existing...');
      return getTodaysDailyRun();
    }
    return null;
  }

  return data;
}

/**
 * Get today's daily run
 */
export async function getTodaysDailyRun(): Promise<DailyRun | null> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('opportunity_daily_runs')
    .select('*')
    .eq('run_date', today)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting today\'s daily run:', error);
    }
    return null;
  }

  return data;
}

/**
 * Update daily run progress
 */
export async function updateDailyRunProgress(
  runId: string,
  progress: {
    total_keywords_discovered?: number;
    total_keywords_scored?: number;
    status?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_daily_runs')
    .update(progress)
    .eq('id', runId);

  if (error) {
    console.error('Error updating daily run progress:', error);
    return false;
  }

  return true;
}

/**
 * Complete daily run with winner
 */
export async function completeDailyRun(
  runId: string,
  winner: {
    opportunity_id: string;
    keyword: string;
    category: string;
    score: number;
  },
  blueprintTriggered: boolean = false,
  blueprintId?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_daily_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      winner_opportunity_id: winner.opportunity_id,
      winner_keyword: winner.keyword,
      winner_category: winner.category,
      winner_score: winner.score,
      blueprint_triggered: blueprintTriggered,
      blueprint_id: blueprintId,
    })
    .eq('id', runId);

  if (error) {
    console.error('Error completing daily run:', error);
    return false;
  }

  return true;
}

/**
 * Fail daily run
 */
export async function failDailyRun(
  runId: string,
  errorMessage: string
): Promise<boolean> {
  const { error } = await supabase
    .from('opportunity_daily_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', runId);

  if (error) {
    console.error('Error failing daily run:', error);
    return false;
  }

  return true;
}

/**
 * Get recent daily runs
 */
export async function getRecentDailyRuns(limit: number = 7): Promise<DailyRun[]> {
  const { data, error } = await supabase
    .from('opportunity_daily_runs')
    .select('*')
    .order('run_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting recent daily runs:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get opportunity statistics
 */
export async function getOpportunityStats(country: string = 'us'): Promise<OpportunityStats> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('category, opportunity_score, status')
    .eq('country', country);

  if (error || !data) {
    return {
      total_opportunities: 0,
      avg_score: 0,
      high_opportunity_count: 0,
      selected_count: 0,
      blueprinted_count: 0,
      top_category: null,
      top_category_avg_score: null,
      by_category: [],
    };
  }

  const scored = data.filter(o => o.opportunity_score !== null);
  const highOpp = scored.filter(o => o.opportunity_score && o.opportunity_score >= 60);
  const selected = data.filter(o => o.status === 'selected');
  const blueprinted = data.filter(o => o.status === 'blueprinted');

  // Calculate by category
  const categoryMap = new Map<string, { scores: number[]; count: number }>();
  for (const opp of scored) {
    const cat = opp.category;
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { scores: [], count: 0 });
    }
    const entry = categoryMap.get(cat)!;
    entry.scores.push(opp.opportunity_score || 0);
    entry.count++;
  }

  const byCategory: CategoryStats[] = Array.from(categoryMap.entries())
    .map(([category, { scores, count }]) => ({
      category,
      count,
      avg_score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      high_opportunity_count: scores.filter(s => s >= 60).length,
    }))
    .sort((a, b) => b.avg_score - a.avg_score);

  const topCategory = byCategory.length > 0 ? byCategory[0] : null;

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    total_opportunities: data.length,
    avg_score: Math.round(avg(scored.map(o => o.opportunity_score || 0)) * 10) / 10,
    high_opportunity_count: highOpp.length,
    selected_count: selected.length,
    blueprinted_count: blueprinted.length,
    top_category: topCategory?.category || null,
    top_category_avg_score: topCategory?.avg_score || null,
    by_category: byCategory,
  };
}

/**
 * Get all existing keywords for a category and country
 * Used to exclude already-discovered keywords from new discovery runs
 */
export async function getExistingKeywordsForCategory(
  category: string,
  country: string = 'us'
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('keyword')
    .eq('category', category)
    .eq('country', country);

  if (error) {
    console.error('Error getting existing keywords:', error);
    return new Set();
  }

  return new Set((data || []).map(o => o.keyword.toLowerCase()));
}

/**
 * Get today's winner (most recently selected opportunity today)
 */
export async function getTodaysWinner(country: string = 'us'): Promise<Opportunity | null> {
  // Use UTC date string for consistent comparison across timezones
  const todayUTC = new Date().toISOString().split('T')[0];
  const startOfDayUTC = `${todayUTC}T00:00:00.000Z`;

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('country', country)
    .gte('selected_at', startOfDayUTC)
    .order('opportunity_score', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error getting today\'s winner:', error);
    }
    return null;
  }

  return data;
}
