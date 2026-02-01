// Reddit Yield Tracker
// Tracks subreddit and topic performance for yield-based optimization

import { supabase } from '@/lib/supabase';
import { RedditAnalysisResult, UnmetNeed, SubredditSummary } from './types';
import { RedditSearchConfig } from './types';

// ============================================================================
// Types
// ============================================================================

export interface SubredditPerformance {
  subreddit: string;
  app_category: string;
  total_searches: number;
  total_posts_found: number;
  avg_post_engagement: number;
  needs_discovered: number;
  high_severity_needs: number;
  yield_score: number;
  last_used: string;
}

export interface TopicPerformance {
  topic_phrase: string;
  app_category: string;
  times_used: number;
  posts_found: number;
  avg_relevance_score: number;
  contributed_to_needs: number;
}

// ============================================================================
// Record Performance After Analysis
// ============================================================================

/**
 * Record subreddit performance after a Reddit analysis completes.
 * Updates yield tracking data for future subreddit selection.
 */
export async function recordSubredditPerformance(
  analysisResult: RedditAnalysisResult,
  searchConfig: RedditSearchConfig,
  appCategory: string
): Promise<void> {
  try {
    for (const sub of analysisResult.topSubreddits) {
      // Find needs that came from this subreddit
      const needsFromSub = analysisResult.unmetNeeds.filter(need =>
        need.evidence.topSubreddits.includes(sub.name)
      );

      const highSeverityFromSub = needsFromSub.filter(n => n.severity === 'high').length;

      // Upsert performance data
      const { error } = await supabase.rpc('upsert_subreddit_performance', {
        p_subreddit: sub.name,
        p_app_category: appCategory,
        p_posts_found: sub.postCount,
        p_avg_engagement: sub.avgEngagement,
        p_needs_discovered: needsFromSub.length,
        p_high_severity_needs: highSeverityFromSub,
      });

      if (error) {
        console.error(`[Yield Tracker] Error recording subreddit ${sub.name}:`, error);
      }
    }

    console.log(`[Yield Tracker] Recorded performance for ${analysisResult.topSubreddits.length} subreddits`);
  } catch (error) {
    console.error('[Yield Tracker] Error recording subreddit performance:', error);
  }
}

/**
 * Record topic performance after analysis.
 */
export async function recordTopicPerformance(
  searchConfig: RedditSearchConfig,
  appCategory: string,
  topSubreddits: SubredditSummary[],
  unmetNeeds: UnmetNeed[]
): Promise<void> {
  try {
    for (const topic of searchConfig.searchTopics) {
      // Estimate posts found for this topic (approximation)
      const totalPosts = topSubreddits.reduce((sum, s) => sum + s.postCount, 0);
      const postsPerTopic = Math.floor(totalPosts / searchConfig.searchTopics.length);

      // Check if this topic contributed to any needs
      // (This is an approximation - would need post-level tracking for accuracy)
      const contributedToNeeds = unmetNeeds.length > 0 ? 1 : 0;

      const { error } = await supabase.rpc('upsert_topic_performance', {
        p_topic_phrase: topic,
        p_app_category: appCategory,
        p_posts_found: postsPerTopic,
        p_contributed_to_needs: contributedToNeeds,
      });

      if (error) {
        console.error(`[Yield Tracker] Error recording topic ${topic}:`, error);
      }
    }

    console.log(`[Yield Tracker] Recorded performance for ${searchConfig.searchTopics.length} topics`);
  } catch (error) {
    console.error('[Yield Tracker] Error recording topic performance:', error);
  }
}

/**
 * Record overall analysis performance metrics.
 */
export async function recordAnalysisPerformance(
  redditAnalysisId: string,
  metrics: {
    subredditsSearched: number;
    topicsSearched: number;
    postsCrawled: number;
    commentsCrawled: number;
    needsDiscovered: number;
    avgConfidenceScore: number;
    quotesAttributed: number;
    crawlDurationSeconds: number;
    analysisDurationSeconds: number;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('analysis_performance').insert({
      reddit_analysis_id: redditAnalysisId,
      subreddits_searched: metrics.subredditsSearched,
      topics_searched: metrics.topicsSearched,
      posts_crawled: metrics.postsCrawled,
      comments_crawled: metrics.commentsCrawled,
      needs_discovered: metrics.needsDiscovered,
      high_severity_needs: 0, // Would need to calculate
      medium_severity_needs: 0,
      low_severity_needs: 0,
      avg_confidence_score: metrics.avgConfidenceScore,
      quotes_attributed: metrics.quotesAttributed,
      crawl_duration_seconds: metrics.crawlDurationSeconds,
      analysis_duration_seconds: metrics.analysisDurationSeconds,
    });

    if (error) {
      console.error('[Yield Tracker] Error recording analysis performance:', error);
    }
  } catch (error) {
    console.error('[Yield Tracker] Error recording analysis performance:', error);
  }
}

// ============================================================================
// Get High-Yield Subreddits
// ============================================================================

/**
 * Get high-yield subreddits for a given app category.
 * Uses historical performance data to suggest the best subreddits.
 */
export async function getHighYieldSubreddits(
  appCategory: string,
  limit: number = 10
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('subreddit_performance')
      .select('subreddit, yield_score')
      .eq('app_category', appCategory)
      .gt('total_searches', 0) // Only include tested subreddits
      .order('yield_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Yield Tracker] Error fetching high-yield subreddits:', error);
      return [];
    }

    return data?.map(d => d.subreddit) || [];
  } catch (error) {
    console.error('[Yield Tracker] Error fetching high-yield subreddits:', error);
    return [];
  }
}

/**
 * Get high-yield topics for a given app category.
 */
export async function getHighYieldTopics(
  appCategory: string,
  limit: number = 10
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('topic_performance')
      .select('topic_phrase, contributed_to_needs, posts_found')
      .eq('app_category', appCategory)
      .gt('times_used', 0)
      .order('contributed_to_needs', { ascending: false })
      .order('posts_found', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Yield Tracker] Error fetching high-yield topics:', error);
      return [];
    }

    return data?.map(d => d.topic_phrase) || [];
  } catch (error) {
    console.error('[Yield Tracker] Error fetching high-yield topics:', error);
    return [];
  }
}

// ============================================================================
// Supabase RPC Functions (need to be created in migration)
// ============================================================================

// These SQL functions will be created via migration for atomic upserts:
//
// CREATE OR REPLACE FUNCTION upsert_subreddit_performance(
//   p_subreddit TEXT,
//   p_app_category TEXT,
//   p_posts_found INT,
//   p_avg_engagement FLOAT,
//   p_needs_discovered INT,
//   p_high_severity_needs INT
// ) RETURNS VOID AS $$
// BEGIN
//   INSERT INTO subreddit_performance (
//     subreddit, app_category, total_searches, total_posts_found,
//     avg_post_engagement, needs_discovered, high_severity_needs, last_used
//   ) VALUES (
//     p_subreddit, p_app_category, 1, p_posts_found,
//     p_avg_engagement, p_needs_discovered, p_high_severity_needs, NOW()
//   )
//   ON CONFLICT (subreddit, app_category)
//   DO UPDATE SET
//     total_searches = subreddit_performance.total_searches + 1,
//     total_posts_found = subreddit_performance.total_posts_found + p_posts_found,
//     avg_post_engagement = (subreddit_performance.avg_post_engagement + p_avg_engagement) / 2,
//     needs_discovered = subreddit_performance.needs_discovered + p_needs_discovered,
//     high_severity_needs = subreddit_performance.high_severity_needs + p_high_severity_needs,
//     last_used = NOW();
// END;
// $$ LANGUAGE plpgsql;
