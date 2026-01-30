// Market Demand Score Calculator
// Measures how many people are actively searching for this solution

import {
  MarketDemandBreakdown,
  OpportunityRawData,
} from '../types';
import {
  MARKET_DEMAND_WEIGHTS,
  THRESHOLDS,
} from '../constants';

// ============================================================================
// Math Utilities
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================================
// Component Calculations
// ============================================================================

/**
 * Normalize autosuggest priority to 0-100 scale
 * Apple's priority typically ranges from 0 to ~20,000
 */
function calculateAutosuggestScore(priority: number | null): number {
  if (priority === null) return 0;
  // Normalize: 20K+ = 100
  return clamp((priority / THRESHOLDS.AUTOSUGGEST_PRIORITY_MAX) * 100, 0, 100);
}

/**
 * Google Trends interest score
 * Already 0-100 from the API
 */
function calculateTrendsInterest(trendsData: OpportunityRawData['google_trends']): number {
  if (!trendsData) return 50; // Default to neutral if no data
  return clamp(trendsData.average_interest, 0, 100);
}

/**
 * Calculate Reddit mention velocity score (0-100)
 * Based on posts per week in relevant subreddits
 */
function calculateRedditVelocity(redditData: OpportunityRawData['reddit']): number {
  if (!redditData) return 50; // Default to neutral if no data

  const postsPerWeek = redditData.posts_per_week;

  // Scale: 5/week = 30, 20/week = 60, 50+/week = 100
  if (postsPerWeek <= THRESHOLDS.REDDIT_POSTS_LOW) {
    return (postsPerWeek / THRESHOLDS.REDDIT_POSTS_LOW) * 30;
  }

  if (postsPerWeek <= THRESHOLDS.REDDIT_POSTS_MID) {
    const range = THRESHOLDS.REDDIT_POSTS_MID - THRESHOLDS.REDDIT_POSTS_LOW;
    const position = (postsPerWeek - THRESHOLDS.REDDIT_POSTS_LOW) / range;
    return 30 + position * 30;
  }

  if (postsPerWeek <= THRESHOLDS.REDDIT_POSTS_HIGH) {
    const range = THRESHOLDS.REDDIT_POSTS_HIGH - THRESHOLDS.REDDIT_POSTS_MID;
    const position = (postsPerWeek - THRESHOLDS.REDDIT_POSTS_MID) / range;
    return 60 + position * 40;
  }

  return 100;
}

/**
 * Normalize search result count to 0-100 scale
 * iTunes returns max 200 results
 */
function calculateSearchResultScore(totalResults: number): number {
  // Scale: 200 results = 100 (saturated market = high demand)
  return clamp((totalResults / THRESHOLDS.SEARCH_RESULTS_MAX) * 100, 0, 100);
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate Market Demand Score (0-100)
 *
 * High score = people are actively searching
 *
 * Components:
 * - Autosuggest Priority (40%): Apple's internal popularity signal
 * - Google Trends Interest (30%): 0-100 from pytrends
 * - Reddit Mention Velocity (20%): posts/week in relevant subreddits
 * - Search Result Count (10%): iTunes API total results
 */
export function calculateMarketDemand(
  autosuggestPriority: number | null,
  totalSearchResults: number,
  googleTrends: OpportunityRawData['google_trends'],
  redditData: OpportunityRawData['reddit']
): MarketDemandBreakdown {
  const autosuggestScore = calculateAutosuggestScore(autosuggestPriority);
  const trendsScore = calculateTrendsInterest(googleTrends);
  const redditScore = calculateRedditVelocity(redditData);
  const searchScore = calculateSearchResultScore(totalSearchResults);

  // Weighted sum
  const total =
    autosuggestScore * MARKET_DEMAND_WEIGHTS.autosuggest_priority +
    trendsScore * MARKET_DEMAND_WEIGHTS.google_trends_interest +
    redditScore * MARKET_DEMAND_WEIGHTS.reddit_mention_velocity +
    searchScore * MARKET_DEMAND_WEIGHTS.search_result_count;

  return {
    autosuggest_priority: Math.round(autosuggestScore * 10) / 10,
    google_trends_interest: Math.round(trendsScore * 10) / 10,
    reddit_mention_velocity: Math.round(redditScore * 10) / 10,
    search_result_count: Math.round(searchScore * 10) / 10,
    total: Math.round(clamp(total, 0, 100) * 10) / 10,
  };
}

/**
 * Generate human-readable explanation of market demand
 */
export function explainMarketDemand(breakdown: MarketDemandBreakdown): string {
  const factors: string[] = [];

  if (breakdown.autosuggest_priority > 70) {
    factors.push('Strong Apple autosuggest priority indicates high search volume');
  } else if (breakdown.autosuggest_priority < 30) {
    factors.push('Low autosuggest priority suggests limited App Store searches');
  }

  if (breakdown.google_trends_interest > 70) {
    factors.push('High Google Trends interest shows broad market awareness');
  } else if (breakdown.google_trends_interest < 30) {
    factors.push('Low Google Trends interest may indicate niche market');
  }

  if (breakdown.reddit_mention_velocity > 60) {
    factors.push('Active Reddit discussions indicate engaged community');
  } else if (breakdown.reddit_mention_velocity < 30) {
    factors.push('Limited Reddit activity suggests low organic interest');
  }

  if (breakdown.search_result_count > 80) {
    factors.push('Many search results confirm market exists');
  } else if (breakdown.search_result_count < 30) {
    factors.push('Few search results may indicate untapped niche');
  }

  return factors.join('. ') + '.';
}

/**
 * Estimate demand level category
 */
export function getDemandLevel(score: number): {
  level: 'high' | 'medium' | 'low';
  description: string;
} {
  if (score >= 70) {
    return {
      level: 'high',
      description: 'Strong demand signals across multiple sources',
    };
  }
  if (score >= 40) {
    return {
      level: 'medium',
      description: 'Moderate demand with growth potential',
    };
  }
  return {
    level: 'low',
    description: 'Limited demand signals - may require market education',
  };
}
