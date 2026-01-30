// Keyword Scoring System
// Calculates Volume, Difficulty, and Opportunity scores

import {
  KeywordScoreResult,
  VolumeScoreComponents,
  DifficultyScoreComponents,
  RankedApp,
} from './types';
import { getAutosuggestData } from './autosuggest';

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

// ============================================================================
// iTunes Search API
// ============================================================================

interface iTunesApp {
  trackId: number;
  trackName: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl100: string;
  releaseDate: string;
  currentVersionReleaseDate: string;
}

interface iTunesSearchResult {
  resultCount: number;
  results: iTunesApp[];
}

async function searchiTunes(
  keyword: string,
  country: string = 'us',
  limit: number = 200
): Promise<{ apps: iTunesApp[]; total: number }> {
  const url = `${ITUNES_SEARCH_URL}?term=${encodeURIComponent(keyword)}&country=${country}&entity=software&limit=${limit}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`iTunes search error: ${response.status}`);
      return { apps: [], total: 0 };
    }

    const data: iTunesSearchResult = await response.json();
    return {
      apps: data.results || [],
      total: data.resultCount || 0,
    };
  } catch (error) {
    console.error('Error searching iTunes:', error);
    return { apps: [], total: 0 };
  }
}

// ============================================================================
// Math Utilities
// ============================================================================

function geometricMean(nums: number[]): number {
  if (nums.length === 0) return 0;
  // Filter out zeros to avoid log(0)
  const positiveNums = nums.filter((n) => n > 0);
  if (positiveNums.length === 0) return 0;

  const logSum = positiveNums.reduce((sum, n) => sum + Math.log(n), 0);
  return Math.exp(logSum / positiveNums.length);
}

function arithmeticMean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Volume Score Calculation
// ============================================================================

/**
 * Calculate volume score (0-100) - estimates search popularity
 *
 * Components:
 * - Autosuggest Priority (40%): Apple's internal popularity signal
 * - Autosuggest Position (20%): Higher position = more popular
 * - Market Size Proxy (25%): Total reviews in top 10 = demand indicator
 * - Trigger Length (15%): Fewer chars to trigger = more popular
 */
export function calculateVolumeScore(
  autosuggestPriority: number | null,
  autosuggestPosition: number | null,
  totalReviews: number,
  triggerChars: number,
  keywordLength: number
): VolumeScoreComponents {
  // Priority score: Apple returns ~0-20000, normalize to 0-100
  const priorityScore =
    autosuggestPriority !== null
      ? clamp((autosuggestPriority / 15000) * 100, 0, 100)
      : 0;

  // Position score: Position 1 = 100, Position 10 = 10, Not found = 0
  const positionScore =
    autosuggestPosition !== null
      ? clamp(110 - autosuggestPosition * 10, 0, 100)
      : 0;

  // Market size score: Based on total reviews in top 10
  // ~10K total → 60, ~100K → 75, ~1M+ → 90+
  const marketScore = clamp(Math.log10(totalReviews + 1) * 15, 0, 100);

  // Trigger score: Fewer chars needed to trigger = more popular
  // Normalize by keyword length to be fair to longer keywords
  const triggerRatio = triggerChars / keywordLength;
  const triggerScore = clamp((1 - triggerRatio) * 100 + 20, 0, 100);

  // Weighted sum
  const total =
    priorityScore * 0.4 +
    positionScore * 0.2 +
    marketScore * 0.25 +
    triggerScore * 0.15;

  return {
    priority_score: Math.round(priorityScore * 10) / 10,
    position_score: Math.round(positionScore * 10) / 10,
    market_score: Math.round(marketScore * 10) / 10,
    trigger_score: Math.round(triggerScore * 10) / 10,
    total: Math.round(total * 10) / 10,
  };
}

// ============================================================================
// Difficulty Score Calculation
// ============================================================================

/**
 * Calculate difficulty score (0-100) - measures how hard to rank in top 10
 *
 * Components:
 * - Title Match Density (30%): Apps in top 10 with keyword in title
 * - Review Strength (35%): Geometric mean of reviews (handles outliers)
 * - Rating Quality (10%): Average rating of top 10
 * - Result Saturation (10%): Total results returned
 * - Market Maturity (15%): Average age of top 10 apps
 */
export function calculateDifficultyScore(
  titleMatches: number,
  reviewCounts: number[],
  ratings: number[],
  totalResults: number,
  appAges: number[]
): DifficultyScoreComponents {
  // Title match score: More apps with keyword in title = harder
  // Each match adds 10 points (10 matches = 100)
  const titleScore = clamp(titleMatches * 10, 0, 100);

  // Review strength score: Geometric mean handles outliers
  // ~100 reviews → 40, ~10K → 80, ~100K+ → 100
  const geoMean = geometricMean(reviewCounts);
  const reviewScore = clamp(Math.log10(geoMean + 1) * 20, 0, 100);

  // Rating quality score: Higher average rating = harder to compete
  const avgRating = arithmeticMean(ratings);
  const ratingScore = clamp((avgRating / 5) * 100, 0, 100);

  // Saturation score: More results = more crowded market
  const saturationScore = clamp((totalResults / 200) * 100, 0, 100);

  // Maturity score: Older apps = more entrenched positions
  // ~30 days → 45, ~1 year → 80, ~3+ years → 100
  const avgAge = arithmeticMean(appAges);
  const maturityScore = clamp(Math.log10(avgAge + 1) * 30, 0, 100);

  // Weighted sum
  const total =
    titleScore * 0.3 +
    reviewScore * 0.35 +
    ratingScore * 0.1 +
    saturationScore * 0.1 +
    maturityScore * 0.15;

  return {
    title_score: Math.round(titleScore * 10) / 10,
    review_score: Math.round(reviewScore * 10) / 10,
    rating_score: Math.round(ratingScore * 10) / 10,
    saturation_score: Math.round(saturationScore * 10) / 10,
    maturity_score: Math.round(maturityScore * 10) / 10,
    total: Math.round(total * 10) / 10,
  };
}

// ============================================================================
// Opportunity Score Calculation
// ============================================================================

/**
 * Calculate opportunity score (0-100) - high volume + low difficulty
 *
 * Formula: Volume * (100 - Difficulty) / 100
 */
export function calculateOpportunityScore(
  volumeScore: number,
  difficultyScore: number
): number {
  const opportunity = (volumeScore * (100 - difficultyScore)) / 100;
  return Math.round(opportunity * 10) / 10;
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Score a keyword - fetches all data and calculates all scores
 */
export async function scoreKeyword(
  keyword: string,
  country: string = 'us'
): Promise<KeywordScoreResult> {
  const normalizedKeyword = keyword.toLowerCase().trim();

  // Fetch data in parallel
  const [autosuggestData, searchResults] = await Promise.all([
    getAutosuggestData(normalizedKeyword, country),
    searchiTunes(normalizedKeyword, country, 200),
  ]);

  const top10 = searchResults.apps.slice(0, 10);
  const totalResults = searchResults.total;

  // Extract metrics from top 10
  const reviewCounts = top10.map((app) => app.userRatingCount || 0);
  const ratings = top10.map((app) => app.averageUserRating || 0);
  const appAges = top10.map((app) =>
    daysSince(app.releaseDate || new Date().toISOString())
  );
  const titleMatches = top10.filter((app) =>
    app.trackName.toLowerCase().includes(normalizedKeyword)
  ).length;

  const totalReviews = reviewCounts.reduce((sum, r) => sum + r, 0);

  // Calculate scores
  const volumeComponents = calculateVolumeScore(
    autosuggestData.priority,
    autosuggestData.position,
    totalReviews,
    autosuggestData.trigger_chars,
    normalizedKeyword.length
  );

  const difficultyComponents = calculateDifficultyScore(
    titleMatches,
    reviewCounts,
    ratings,
    totalResults,
    appAges
  );

  const opportunityScore = calculateOpportunityScore(
    volumeComponents.total,
    difficultyComponents.total
  );

  // Build top 10 apps list
  const top10Apps: RankedApp[] = top10.map((app) => ({
    id: app.trackId.toString(),
    name: app.trackName,
    rating: Math.round((app.averageUserRating || 0) * 10) / 10,
    reviews: app.userRatingCount || 0,
    icon_url: app.artworkUrl100 || '',
    has_keyword_in_title: app.trackName
      .toLowerCase()
      .includes(normalizedKeyword),
  }));

  return {
    keyword: normalizedKeyword,
    country,
    volume_score: volumeComponents.total,
    difficulty_score: difficultyComponents.total,
    opportunity_score: opportunityScore,
    volume_components: volumeComponents,
    difficulty_components: difficultyComponents,
    raw: {
      autosuggest_priority: autosuggestData.priority,
      autosuggest_position: autosuggestData.position,
      trigger_chars: autosuggestData.trigger_chars,
      total_results: totalResults,
      top10_avg_reviews: Math.round(arithmeticMean(reviewCounts)),
      top10_avg_rating: Math.round(arithmeticMean(ratings) * 10) / 10,
      top10_title_matches: titleMatches,
    },
    top_10_apps: top10Apps,
  };
}

/**
 * Score multiple keywords (with rate limiting)
 */
export async function scoreKeywords(
  keywords: string[],
  country: string = 'us',
  onProgress?: (scored: number, total: number, result: KeywordScoreResult) => void
): Promise<KeywordScoreResult[]> {
  const results: KeywordScoreResult[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const result = await scoreKeyword(keywords[i], country);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, keywords.length, result);
    }

    // Rate limiting between keywords
    if (i < keywords.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}
