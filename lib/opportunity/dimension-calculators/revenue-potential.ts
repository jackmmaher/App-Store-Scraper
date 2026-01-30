// Revenue Potential Score Calculator
// Measures whether money flows in this category

import {
  RevenuePotentialBreakdown,
  TopAppData,
  OpportunityRawData,
} from '../types';
import {
  REVENUE_POTENTIAL_WEIGHTS,
} from '../constants';

// ============================================================================
// Math Utilities
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function geometricMean(nums: number[]): number {
  if (nums.length === 0) return 0;
  const positiveNums = nums.filter((n) => n > 0);
  if (positiveNums.length === 0) return 0;
  const logSum = positiveNums.reduce((sum, n) => sum + Math.log(n), 0);
  return Math.exp(logSum / positiveNums.length);
}

// ============================================================================
// Component Calculations
// ============================================================================

/**
 * Calculate category average price score (0-100)
 * Paid apps signal willingness to pay
 */
function calculatePriceScore(topApps: TopAppData[], categoryData: OpportunityRawData['category_data']): number {
  // Use category-wide data if available
  const avgPrice = categoryData?.avg_price ?? 0;

  // Also check top apps for paid presence
  const paidApps = topApps.filter(app => app.price > 0);
  const topAppsAvgPrice = paidApps.length > 0
    ? paidApps.reduce((sum, app) => sum + app.price, 0) / paidApps.length
    : 0;

  // Combine category and top apps data
  const combinedAvg = avgPrice > 0 ? (avgPrice + topAppsAvgPrice) / 2 : topAppsAvgPrice;

  // Scale: $1 = 30, $5 = 60, $10+ = 100
  if (combinedAvg <= 0) return 0;
  if (combinedAvg <= 1) return combinedAvg * 30;
  if (combinedAvg <= 5) return 30 + ((combinedAvg - 1) / 4) * 30;
  if (combinedAvg <= 10) return 60 + ((combinedAvg - 5) / 5) * 40;
  return 100;
}

/**
 * Calculate IAP presence ratio (0-100)
 * High IAP presence indicates monetization potential
 */
function calculateIAPScore(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const appsWithIAP = topApps.filter(app => app.has_iap).length;
  const ratio = appsWithIAP / topApps.length;

  // Direct percentage: 70% with IAP = 70 score
  return Math.round(ratio * 100);
}

/**
 * Calculate subscription presence score (0-100)
 * Subscriptions indicate recurring revenue opportunity
 */
function calculateSubscriptionScore(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const appsWithSubs = topApps.filter(app => app.has_subscription).length;
  const ratio = appsWithSubs / topApps.length;

  // Weight subscriptions higher - even 30% subscription presence is significant
  // 30% = 60 score, 50%+ = 100
  if (ratio <= 0.3) {
    return (ratio / 0.3) * 60;
  }
  if (ratio <= 0.5) {
    return 60 + ((ratio - 0.3) / 0.2) * 40;
  }
  return 100;
}

/**
 * Calculate review count as revenue proxy (0-100)
 * More reviews ≈ more downloads ≈ more revenue potential
 */
function calculateReviewProxy(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const reviewCounts = topApps.map(app => app.reviews);
  const totalReviews = reviewCounts.reduce((sum, r) => sum + r, 0);

  // Use geometric mean to handle outliers, then scale
  const geoMean = geometricMean(reviewCounts);

  // Scale: 1K reviews = 40, 10K = 60, 100K = 80, 1M+ = 100
  const normalized = Math.log10(geoMean + 1) / Math.log10(1000000 + 1) * 100;
  return clamp(normalized, 0, 100);
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate Revenue Potential Score (0-100)
 *
 * High score = money flows in this category
 *
 * Components:
 * - Category Average Price (25%): paid apps signal willingness to pay
 * - IAP Presence Ratio (35%): % of top 10 with IAP
 * - Subscription Presence (25%): recurring revenue indicator
 * - Review Count Proxy (15%): more reviews ≈ more downloads ≈ more $
 */
export function calculateRevenuePotential(
  topApps: TopAppData[],
  categoryData: OpportunityRawData['category_data']
): RevenuePotentialBreakdown {
  const priceScore = calculatePriceScore(topApps, categoryData);
  const iapScore = calculateIAPScore(topApps);
  const subscriptionScore = calculateSubscriptionScore(topApps);
  const reviewProxy = calculateReviewProxy(topApps);

  // Weighted sum
  const total =
    priceScore * REVENUE_POTENTIAL_WEIGHTS.category_avg_price +
    iapScore * REVENUE_POTENTIAL_WEIGHTS.iap_presence_ratio +
    subscriptionScore * REVENUE_POTENTIAL_WEIGHTS.subscription_presence +
    reviewProxy * REVENUE_POTENTIAL_WEIGHTS.review_count_proxy;

  return {
    category_avg_price: Math.round(priceScore * 10) / 10,
    iap_presence_ratio: Math.round(iapScore * 10) / 10,
    subscription_presence: Math.round(subscriptionScore * 10) / 10,
    review_count_as_proxy: Math.round(reviewProxy * 10) / 10,
    total: Math.round(clamp(total, 0, 100) * 10) / 10,
  };
}

/**
 * Determine recommended monetization strategy
 */
export function suggestMonetization(breakdown: RevenuePotentialBreakdown): {
  primary: string;
  secondary: string | null;
  reasoning: string;
} {
  // High subscription presence - go subscription
  if (breakdown.subscription_presence > 60) {
    return {
      primary: 'Subscription',
      secondary: breakdown.category_avg_price > 40 ? 'Lifetime purchase option' : null,
      reasoning: `${Math.round(breakdown.subscription_presence)}% of competitors use subscriptions, validating recurring revenue model`,
    };
  }

  // High IAP presence - freemium with IAP
  if (breakdown.iap_presence_ratio > 60) {
    return {
      primary: 'Freemium with IAP',
      secondary: 'Optional subscription tier',
      reasoning: `${Math.round(breakdown.iap_presence_ratio)}% of competitors monetize through in-app purchases`,
    };
  }

  // High price acceptance - premium paid
  if (breakdown.category_avg_price > 50) {
    return {
      primary: 'Premium paid app',
      secondary: 'IAP for additional features',
      reasoning: 'Category shows willingness to pay upfront for quality',
    };
  }

  // Low everything - ad-supported or freemium
  return {
    primary: 'Freemium with ads',
    secondary: 'Ad-free IAP upgrade',
    reasoning: 'Low monetization signals suggest ad-supported model with upgrade path',
  };
}

/**
 * Generate human-readable explanation of revenue potential
 */
export function explainRevenuePotential(breakdown: RevenuePotentialBreakdown): string {
  const factors: string[] = [];

  if (breakdown.subscription_presence > 60) {
    factors.push('Strong subscription presence indicates recurring revenue viability');
  }

  if (breakdown.iap_presence_ratio > 70) {
    factors.push('Most competitors monetize through in-app purchases');
  }

  if (breakdown.category_avg_price > 50) {
    factors.push('Higher price points accepted in this category');
  } else if (breakdown.category_avg_price < 20) {
    factors.push('Price-sensitive market - freemium may work better');
  }

  if (breakdown.review_count_as_proxy > 70) {
    factors.push('High review counts suggest large addressable market');
  }

  if (factors.length === 0) {
    factors.push('Moderate revenue signals - consider competitive pricing');
  }

  return factors.join('. ') + '.';
}

/**
 * Estimate revenue tier
 */
export function getRevenueTier(score: number): {
  tier: 'high' | 'medium' | 'low';
  estimate: string;
} {
  if (score >= 70) {
    return {
      tier: 'high',
      estimate: 'Strong monetization potential - $10K+/month achievable',
    };
  }
  if (score >= 45) {
    return {
      tier: 'medium',
      estimate: 'Moderate revenue potential - $1K-10K/month range',
    };
  }
  return {
    tier: 'low',
    estimate: 'Limited revenue signals - may need volume play or niche pricing',
  };
}
