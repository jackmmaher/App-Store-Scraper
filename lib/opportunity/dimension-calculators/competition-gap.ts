// Competition Gap Score Calculator
// Measures how beatable the current competition is

import {
  CompetitionGapBreakdown,
  TopAppData,
} from '../types';
import {
  COMPETITION_GAP_WEIGHTS,
  THRESHOLDS,
  FEATURE_KEYWORDS,
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
 * Calculate title keyword saturation (0-100)
 * Higher = more competitors have keyword in title = harder to compete
 */
function calculateTitleSaturation(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;
  const matchCount = topApps.filter(app => app.has_keyword_in_title).length;
  // Each match adds 10 points (10 matches = 100)
  return clamp(matchCount * 10, 0, 100);
}

/**
 * Normalize review count to 0-100 scale (logarithmic)
 * Uses geometric mean to handle outliers
 */
function calculateReviewStrength(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const reviewCounts = topApps.map(app => app.reviews);
  const geoMean = geometricMean(reviewCounts);

  // Logarithmic scale: 100 reviews → 40, 10K → 80, 1M+ → 100
  const normalized = Math.log10(geoMean + 1) / Math.log10(THRESHOLDS.REVIEW_COUNT_MAX + 1) * 100;
  return clamp(normalized, 0, 100);
}

/**
 * Calculate rating penalty (0-100)
 * Apps with 4.5+ ratings are harder to beat
 */
function calculateRatingPenalty(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const ratings = topApps.map(app => app.rating);
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

  // Penalty starts at 4.5, maxes out at 4.9
  if (avgRating < THRESHOLDS.RATING_PENALTY_START) {
    // Below 4.5: scale from 0 to 50
    return clamp((avgRating / THRESHOLDS.RATING_PENALTY_START) * 50, 0, 50);
  }

  // 4.5 to 4.9: scale from 50 to 100
  const range = THRESHOLDS.RATING_PENALTY_MAX - THRESHOLDS.RATING_PENALTY_START;
  const position = (avgRating - THRESHOLDS.RATING_PENALTY_START) / range;
  return clamp(50 + position * 50, 50, 100);
}

/**
 * Estimate feature density from app descriptions (0-100)
 * More features = harder to build a competitive MVP
 */
function calculateFeatureDensity(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 0;

  const featureCounts = topApps.map(app => app.feature_count);
  const avgFeatures = featureCounts.reduce((sum, f) => sum + f, 0) / featureCounts.length;

  // Scale: 3 features = 30, 10 features = 60, 25+ features = 100
  const normalized = (avgFeatures - THRESHOLDS.FEATURE_COUNT_MIN) /
    (THRESHOLDS.FEATURE_COUNT_MAX - THRESHOLDS.FEATURE_COUNT_MIN) * 100;
  return clamp(normalized, 0, 100);
}

/**
 * Extract feature count from app description
 * Counts mentions of feature-related keywords
 */
export function extractFeatureCount(description: string): number {
  if (!description) return 0;

  const lowerDesc = description.toLowerCase();
  let count = 0;

  for (const keyword of FEATURE_KEYWORDS) {
    if (lowerDesc.includes(keyword)) {
      count++;
    }
  }

  // Also count bullet points as features (common in App Store descriptions)
  const bulletMatches = lowerDesc.match(/[•\-\*]\s*\w/g);
  if (bulletMatches) {
    count += Math.min(bulletMatches.length, 15); // Cap at 15 bullets
  }

  return count;
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate Competition Gap Score (0-100)
 *
 * High score = weak competitors, room to win
 * Formula: 100 - weighted_sum_of_competition_factors
 *
 * Components (inverted):
 * - Title Keyword Saturation (30%): % of top 10 with keyword in title
 * - Avg Review Count Normalized (35%): logarithmic scale, 1M+ = 100
 * - Avg Rating Penalty (20%): 4.5+ rating = harder to beat
 * - Feature Density (15%): extracted from descriptions
 */
export function calculateCompetitionGap(
  topApps: TopAppData[]
): CompetitionGapBreakdown {
  const titleSaturation = calculateTitleSaturation(topApps);
  const reviewStrength = calculateReviewStrength(topApps);
  const ratingPenalty = calculateRatingPenalty(topApps);
  const featureDensity = calculateFeatureDensity(topApps);

  // Weighted sum of competition factors
  const competitionStrength =
    titleSaturation * COMPETITION_GAP_WEIGHTS.title_keyword_saturation +
    reviewStrength * COMPETITION_GAP_WEIGHTS.avg_review_count +
    ratingPenalty * COMPETITION_GAP_WEIGHTS.avg_rating_penalty +
    featureDensity * COMPETITION_GAP_WEIGHTS.feature_density;

  // Invert: higher score = weaker competition = more opportunity
  const total = Math.round((100 - competitionStrength) * 10) / 10;

  return {
    title_keyword_saturation: Math.round(titleSaturation * 10) / 10,
    avg_review_count_normalized: Math.round(reviewStrength * 10) / 10,
    avg_rating_penalty: Math.round(ratingPenalty * 10) / 10,
    feature_density: Math.round(featureDensity * 10) / 10,
    total: clamp(total, 0, 100),
  };
}

/**
 * Generate human-readable explanation of competition gap
 */
export function explainCompetitionGap(breakdown: CompetitionGapBreakdown): string {
  const factors: string[] = [];

  if (breakdown.title_keyword_saturation < 30) {
    factors.push('Few competitors have the keyword in title (less competition)');
  } else if (breakdown.title_keyword_saturation > 70) {
    factors.push('Many competitors already targeting this keyword');
  }

  if (breakdown.avg_review_count_normalized < 40) {
    factors.push('Low review counts indicate room for a quality entrant');
  } else if (breakdown.avg_review_count_normalized > 80) {
    factors.push('High review counts from established competitors');
  }

  if (breakdown.avg_rating_penalty < 50) {
    factors.push('Average ratings leave room for a better experience');
  } else if (breakdown.avg_rating_penalty > 80) {
    factors.push('High-rated competitors will be hard to beat');
  }

  if (breakdown.feature_density < 40) {
    factors.push('Simple apps dominate (easy MVP path)');
  } else if (breakdown.feature_density > 70) {
    factors.push('Feature-rich apps require significant development');
  }

  return factors.join('. ') + '.';
}
