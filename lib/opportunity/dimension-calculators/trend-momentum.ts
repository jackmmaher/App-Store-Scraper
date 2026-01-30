// Trend Momentum Score Calculator
// Measures whether the category is growing or dying

import {
  TrendMomentumBreakdown,
  OpportunityRawData,
} from '../types';
import {
  TREND_MOMENTUM_WEIGHTS,
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
 * Calculate Google Trends slope score (0-100)
 * Rising trends = higher score
 *
 * Slope interpretation (12-month change):
 * -0.5 or below: Rapidly declining (0-20)
 * -0.2 to -0.5: Declining (20-40)
 * -0.2 to 0: Slightly declining (40-50)
 * 0 to 0.2: Stable to slight growth (50-65)
 * 0.2 to 0.5: Growing (65-85)
 * 0.5+: Hot/rapidly growing (85-100)
 */
function calculateTrendsSlopeScore(trendsData: OpportunityRawData['google_trends']): number {
  if (!trendsData) return 50; // Default to neutral

  const slope = trendsData.slope;

  // Rapidly declining
  if (slope <= -0.5) {
    return clamp(20 + ((slope + 0.5) / 0.5) * 20, 0, 20);
  }

  // Declining
  if (slope <= THRESHOLDS.TRENDS_SLOPE_DECLINE) {
    const range = THRESHOLDS.TRENDS_SLOPE_DECLINE - (-0.5);
    const position = (slope - (-0.5)) / range;
    return 20 + position * 20;
  }

  // Slightly declining to stable
  if (slope <= THRESHOLDS.TRENDS_SLOPE_STABLE) {
    const range = THRESHOLDS.TRENDS_SLOPE_STABLE - THRESHOLDS.TRENDS_SLOPE_DECLINE;
    const position = (slope - THRESHOLDS.TRENDS_SLOPE_DECLINE) / range;
    return 40 + position * 10;
  }

  // Stable to slight growth
  if (slope <= THRESHOLDS.TRENDS_SLOPE_GROWTH) {
    const range = THRESHOLDS.TRENDS_SLOPE_GROWTH - THRESHOLDS.TRENDS_SLOPE_STABLE;
    const position = (slope - THRESHOLDS.TRENDS_SLOPE_STABLE) / range;
    return 50 + position * 15;
  }

  // Growing
  if (slope <= THRESHOLDS.TRENDS_SLOPE_HOT) {
    const range = THRESHOLDS.TRENDS_SLOPE_HOT - THRESHOLDS.TRENDS_SLOPE_GROWTH;
    const position = (slope - THRESHOLDS.TRENDS_SLOPE_GROWTH) / range;
    return 65 + position * 20;
  }

  // Hot/rapidly growing
  const overshoot = Math.min(slope - THRESHOLDS.TRENDS_SLOPE_HOT, 0.5);
  return 85 + (overshoot / 0.5) * 15;
}

/**
 * Calculate new apps launched score (0-100)
 * More new apps = active market (good sign)
 * Scale: 0-5 = low, 5-15 = medium, 15+ = high activity
 */
function calculateNewAppsScore(categoryData: OpportunityRawData['category_data']): number {
  const newApps = categoryData?.new_apps_90d ?? 0;

  // Scale: 0 = 20, 5 = 50, 15 = 80, 30+ = 100
  if (newApps <= 0) return 20; // Market exists but no new entrants
  if (newApps <= 5) return 20 + (newApps / 5) * 30;
  if (newApps <= 15) return 50 + ((newApps - 5) / 10) * 30;
  if (newApps <= 30) return 80 + ((newApps - 15) / 15) * 20;
  return 100;
}

/**
 * Calculate Reddit growth rate score (0-100)
 * Based on subreddit subscriber velocity and engagement trends
 */
function calculateRedditGrowthScore(redditData: OpportunityRawData['reddit']): number {
  if (!redditData) return 50; // Default to neutral

  // Use combination of posts per week and average engagement
  const postsPerWeek = redditData.posts_per_week;
  const avgUpvotes = redditData.avg_upvotes;
  const avgComments = redditData.avg_comments;

  // Engagement score: upvotes + comments*2 (comments are more valuable)
  const avgEngagement = avgUpvotes + avgComments * 2;

  // Scale posts: 5/week = 30, 20/week = 60, 50+/week = 90
  let postScore: number;
  if (postsPerWeek <= 5) {
    postScore = (postsPerWeek / 5) * 30;
  } else if (postsPerWeek <= 20) {
    postScore = 30 + ((postsPerWeek - 5) / 15) * 30;
  } else {
    postScore = 60 + Math.min((postsPerWeek - 20) / 30, 1) * 30;
  }

  // Scale engagement: 10 = 30, 50 = 60, 200+ = 90
  let engagementScore: number;
  if (avgEngagement <= 10) {
    engagementScore = (avgEngagement / 10) * 30;
  } else if (avgEngagement <= 50) {
    engagementScore = 30 + ((avgEngagement - 10) / 40) * 30;
  } else {
    engagementScore = 60 + Math.min((avgEngagement - 50) / 150, 1) * 30;
  }

  // Combine: 60% posts, 40% engagement
  return clamp(postScore * 0.6 + engagementScore * 0.4, 0, 100);
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate Trend Momentum Score (0-100)
 *
 * High score = category is growing, not dying
 *
 * Components:
 * - Google Trends Slope (50%): rising/falling over 12 months
 * - New Apps Launched 90d (25%): market activity indicator
 * - Reddit Growth Rate (25%): subreddit subscriber/engagement velocity
 */
export function calculateTrendMomentum(
  googleTrends: OpportunityRawData['google_trends'],
  categoryData: OpportunityRawData['category_data'],
  redditData: OpportunityRawData['reddit']
): TrendMomentumBreakdown {
  const trendsSlope = calculateTrendsSlopeScore(googleTrends);
  const newApps = calculateNewAppsScore(categoryData);
  const redditGrowth = calculateRedditGrowthScore(redditData);

  // Weighted sum
  const total =
    trendsSlope * TREND_MOMENTUM_WEIGHTS.google_trends_slope +
    newApps * TREND_MOMENTUM_WEIGHTS.new_apps_launched_90d +
    redditGrowth * TREND_MOMENTUM_WEIGHTS.reddit_growth_rate;

  return {
    google_trends_slope: Math.round(trendsSlope * 10) / 10,
    new_apps_launched_90d: Math.round(newApps * 10) / 10,
    reddit_growth_rate: Math.round(redditGrowth * 10) / 10,
    total: Math.round(clamp(total, 0, 100) * 10) / 10,
  };
}

/**
 * Determine trend direction category
 */
export function getTrendDirection(breakdown: TrendMomentumBreakdown): {
  direction: 'hot' | 'growing' | 'stable' | 'declining' | 'dying';
  description: string;
  recommendation: string;
} {
  const score = breakdown.total;

  if (score >= 80) {
    return {
      direction: 'hot',
      description: 'Rapidly growing market with strong momentum',
      recommendation: 'Move fast - competition will increase soon',
    };
  }

  if (score >= 60) {
    return {
      direction: 'growing',
      description: 'Healthy growth trajectory',
      recommendation: 'Good timing to enter with quality product',
    };
  }

  if (score >= 45) {
    return {
      direction: 'stable',
      description: 'Mature market with consistent demand',
      recommendation: 'Focus on differentiation to stand out',
    };
  }

  if (score >= 30) {
    return {
      direction: 'declining',
      description: 'Market showing signs of contraction',
      recommendation: 'Proceed with caution - ensure strong USP',
    };
  }

  return {
    direction: 'dying',
    description: 'Significant decline across all indicators',
    recommendation: 'Consider alternative opportunities',
  };
}

/**
 * Generate human-readable explanation of trend momentum
 */
export function explainTrendMomentum(breakdown: TrendMomentumBreakdown): string {
  const factors: string[] = [];

  if (breakdown.google_trends_slope >= 70) {
    factors.push('Google Trends shows strong upward trajectory');
  } else if (breakdown.google_trends_slope <= 40) {
    factors.push('Google Trends indicates declining interest');
  }

  if (breakdown.new_apps_launched_90d >= 70) {
    factors.push('Many new apps launching suggests active market');
  } else if (breakdown.new_apps_launched_90d <= 30) {
    factors.push('Few new entrants may indicate mature or declining market');
  }

  if (breakdown.reddit_growth_rate >= 60) {
    factors.push('Growing Reddit engagement shows community interest');
  } else if (breakdown.reddit_growth_rate <= 30) {
    factors.push('Low Reddit activity suggests limited organic buzz');
  }

  if (factors.length === 0) {
    factors.push('Mixed trend signals - market appears stable');
  }

  return factors.join('. ') + '.';
}

/**
 * Calculate trend slope from array of values
 * Returns normalized slope (-1 to 1 scale)
 */
export function calculateSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  // Linear regression slope calculation
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  // Normalize by average value to get percentage change
  const avgY = sumY / n;
  if (avgY === 0) return 0;

  return slope / avgY * n; // Annualize to get yearly change rate
}
