// Opportunity Scorer - Core Scoring Engine
// Combines all dimensions to produce final opportunity scores

import {
  OpportunityScoreResult,
  OpportunityRawData,
  TopAppData,
  CompetitionGapBreakdown,
  MarketDemandBreakdown,
  RevenuePotentialBreakdown,
  TrendMomentumBreakdown,
  ExecutionFeasibilityBreakdown,
} from './types';
import { DIMENSION_WEIGHTS, DEFAULT_CONFIG } from './constants';
import {
  calculateCompetitionGap,
  extractFeatureCount,
  explainCompetitionGap,
  calculateMarketDemand,
  explainMarketDemand,
  calculateRevenuePotential,
  suggestMonetization,
  explainRevenuePotential,
  calculateTrendMomentum,
  getTrendDirection,
  explainTrendMomentum,
  calculateExecutionFeasibility,
  detectHardwareRequirements,
  explainExecutionFeasibility,
  estimateDevelopmentEffort,
} from './dimension-calculators';
import { fetchTrendData, fetchPainPointSignals } from './trend-fetcher';
import { analyzeCompetitorReviews, shouldAnalyzeReviews } from './review-analyzer';
import { getAutosuggestData } from '../keywords/autosuggest';
import { upsertApps, AppResult } from '../supabase';

// ============================================================================
// iTunes Search API
// ============================================================================

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

interface iTunesApp {
  trackId: number;
  trackName: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl100: string;
  releaseDate: string;
  price: number;
  currency: string;
  description: string;
  formattedPrice: string;
  // Additional fields for full app data
  bundleId?: string;
  artistName?: string;
  artistId?: number;
  averageUserRatingForCurrentVersion?: number;
  userRatingCountForCurrentVersion?: number;
  version?: string;
  currentVersionReleaseDate?: string;
  minimumOsVersion?: string;
  fileSizeBytes?: string;
  contentAdvisoryRating?: string;
  genres?: string[];
  primaryGenreName?: string;
  primaryGenreId?: number;
  trackViewUrl?: string;
  // IAP detection from app metadata
  isGameCenterEnabled?: boolean;
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
// App Data Extraction
// ============================================================================

/**
 * Convert iTunes app data to our TopAppData format
 */
function extractTopAppData(
  app: iTunesApp,
  keyword: string
): TopAppData {
  const normalizedKeyword = keyword.toLowerCase();
  const description = app.description || '';

  // Extract feature count from description
  const featureCount = extractFeatureCount(description);

  // Detect hardware requirements
  const hardwareRequirements = detectHardwareRequirements(description);

  // Detect IAP/subscription from price and description
  const hasIAP = detectHasIAP(app, description);
  const hasSubscription = detectHasSubscription(description);

  // Calculate days since last update
  const lastUpdated = app.currentVersionReleaseDate || app.releaseDate || '';
  const daysSinceUpdate = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Estimate downloads (industry rule: reviews × 50-100, we use 70 as middle ground)
  const reviewCount = app.userRatingCount || 0;
  const downloadEstimate = reviewCount * 70;

  // Estimate revenue based on monetization model
  const revenueEstimate = estimateRevenue(
    app.price || 0,
    hasIAP,
    hasSubscription,
    downloadEstimate
  );

  return {
    id: app.trackId.toString(),
    name: app.trackName,
    rating: app.averageUserRating || 0,
    reviews: app.userRatingCount || 0,
    price: app.price || 0,
    currency: app.currency || 'USD',
    has_keyword_in_title: app.trackName.toLowerCase().includes(normalizedKeyword),
    has_iap: hasIAP,
    has_subscription: hasSubscription,
    icon_url: app.artworkUrl100 || '',
    release_date: app.releaseDate || '',
    description_length: description.length,
    feature_count: featureCount,
    requires_hardware: hardwareRequirements,
    // Enriched KPIs
    last_updated: lastUpdated,
    developer_name: app.artistName || 'Unknown',
    developer_id: app.artistId?.toString() || '',
    days_since_update: daysSinceUpdate,
    download_estimate: downloadEstimate,
    revenue_estimate: revenueEstimate,
  };
}

/**
 * Estimate monthly revenue based on monetization model
 */
function estimateRevenue(
  price: number,
  hasIAP: boolean,
  hasSubscription: boolean,
  downloads: number
): TopAppData['revenue_estimate'] {
  // Estimate monthly new downloads (assume 10% of total are monthly)
  const monthlyDownloads = Math.round(downloads * 0.1);

  if (hasSubscription) {
    // Subscription: assume $5-10/month, 2-5% conversion
    return {
      monthly_low: Math.round(monthlyDownloads * 0.02 * 5),
      monthly_high: Math.round(monthlyDownloads * 0.05 * 10),
      model: 'subscription',
    };
  } else if (price > 0) {
    // Paid app: direct revenue from sales
    return {
      monthly_low: Math.round(monthlyDownloads * price * 0.7), // 70% after Apple cut
      monthly_high: Math.round(monthlyDownloads * price * 0.85), // 85% for small dev
      model: 'paid',
    };
  } else if (hasIAP) {
    // Freemium: assume $2-5 ARPU, 3-8% conversion
    return {
      monthly_low: Math.round(monthlyDownloads * 0.03 * 2),
      monthly_high: Math.round(monthlyDownloads * 0.08 * 5),
      model: 'freemium',
    };
  } else {
    // Free with no monetization signals
    return {
      monthly_low: 0,
      monthly_high: Math.round(monthlyDownloads * 0.01 * 1), // Minimal ad revenue
      model: 'free',
    };
  }
}

/**
 * Detect if app likely has in-app purchases
 */
function detectHasIAP(app: iTunesApp, description: string): boolean {
  // Free apps often have IAP
  if (app.price === 0) {
    // Check for IAP keywords in description
    const iapKeywords = ['in-app purchase', 'upgrade', 'premium', 'pro version', 'unlock'];
    const lowerDesc = description.toLowerCase();
    return iapKeywords.some(kw => lowerDesc.includes(kw));
  }
  return false;
}

/**
 * Detect if app likely has subscription
 */
function detectHasSubscription(description: string): boolean {
  const subKeywords = [
    'subscription',
    'subscribe',
    'monthly',
    'yearly',
    'annual',
    'per month',
    'per year',
    '/month',
    '/year',
    'free trial',
    'auto-renew',
  ];
  const lowerDesc = description.toLowerCase();
  return subKeywords.some(kw => lowerDesc.includes(kw));
}

// ============================================================================
// Apps Database Integration
// ============================================================================

/**
 * Convert iTunes app to AppResult format for database storage
 */
function convertToAppResult(app: iTunesApp): AppResult {
  return {
    id: app.trackId.toString(),
    name: app.trackName,
    bundle_id: app.bundleId || '',
    developer: app.artistName || '',
    developer_id: app.artistId?.toString() || '',
    price: app.price || 0,
    currency: app.currency || 'USD',
    rating: app.averageUserRating || 0,
    rating_current_version: app.averageUserRatingForCurrentVersion || 0,
    review_count: app.userRatingCount || 0,
    review_count_current_version: app.userRatingCountForCurrentVersion || 0,
    version: app.version || '',
    release_date: app.releaseDate || '',
    current_version_release_date: app.currentVersionReleaseDate || '',
    min_os_version: app.minimumOsVersion || '',
    file_size_bytes: app.fileSizeBytes || '0',
    content_rating: app.contentAdvisoryRating || '',
    genres: app.genres || [],
    primary_genre: app.primaryGenreName || '',
    primary_genre_id: app.primaryGenreId?.toString() || '',
    url: app.trackViewUrl || '',
    icon_url: app.artworkUrl100 || '',
    description: app.description || '',
  };
}

/**
 * Save top apps to the apps database
 */
async function saveAppsToDatabase(
  apps: iTunesApp[],
  country: string,
  category: string
): Promise<void> {
  if (apps.length === 0) return;

  try {
    const appResults = apps.map(convertToAppResult);
    await upsertApps(appResults, country, category);
    console.log(`Saved ${apps.length} apps to database for category: ${category}`);
  } catch (error) {
    console.error('Error saving apps to database:', error);
    // Don't throw - this is a non-critical operation
  }
}

// ============================================================================
// Market Estimates Calculation
// ============================================================================

/**
 * Calculate market size estimates from top apps data
 */
function calculateMarketEstimates(
  topApps: TopAppData[]
): OpportunityRawData['market_estimates'] {
  // Sum up download estimates from all top apps
  const totalDownloads = topApps.reduce(
    (sum, app) => sum + (app.download_estimate || 0),
    0
  );

  // Sum up revenue estimates
  const monthlyRevenueLow = topApps.reduce(
    (sum, app) => sum + (app.revenue_estimate?.monthly_low || 0),
    0
  );
  const monthlyRevenueHigh = topApps.reduce(
    (sum, app) => sum + (app.revenue_estimate?.monthly_high || 0),
    0
  );

  // Determine market size tier
  let marketSizeTier: 'tiny' | 'small' | 'medium' | 'large' | 'massive';
  if (monthlyRevenueHigh < 1000) {
    marketSizeTier = 'tiny';
  } else if (monthlyRevenueHigh < 10000) {
    marketSizeTier = 'small';
  } else if (monthlyRevenueHigh < 100000) {
    marketSizeTier = 'medium';
  } else if (monthlyRevenueHigh < 1000000) {
    marketSizeTier = 'large';
  } else {
    marketSizeTier = 'massive';
  }

  return {
    total_downloads_estimate: totalDownloads,
    monthly_revenue_low: monthlyRevenueLow,
    monthly_revenue_high: monthlyRevenueHigh,
    market_size_tier: marketSizeTier,
  };
}

// ============================================================================
// Category Data Extraction
// ============================================================================

/**
 * Extract category-level data from top apps
 */
function extractCategoryData(
  topApps: TopAppData[]
): OpportunityRawData['category_data'] {
  const paidApps = topApps.filter(app => app.price > 0);
  const avgPrice = paidApps.length > 0
    ? paidApps.reduce((sum, app) => sum + app.price, 0) / paidApps.length
    : 0;

  const iapApps = topApps.filter(app => app.has_iap);
  const subApps = topApps.filter(app => app.has_subscription);

  // Estimate new apps (released in last 90 days)
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const newApps = topApps.filter(app => {
    if (!app.release_date) return false;
    return new Date(app.release_date) > ninetyDaysAgo;
  });

  return {
    avg_price: Math.round(avgPrice * 100) / 100,
    paid_app_count: paidApps.length,
    iap_app_count: iapApps.length,
    subscription_app_count: subApps.length,
    new_apps_90d: newApps.length,
  };
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Score an opportunity - fetches all data and calculates all dimensions
 */
export async function scoreOpportunity(
  keyword: string,
  category: string,
  country: string = 'us'
): Promise<OpportunityScoreResult> {
  const normalizedKeyword = keyword.toLowerCase().trim();

  // Fetch all data in parallel
  const [autosuggestData, searchResults, trendData, painPointData] = await Promise.all([
    getAutosuggestData(normalizedKeyword, country),
    searchiTunes(normalizedKeyword, country, 200),
    fetchTrendData(normalizedKeyword, category),
    fetchPainPointSignals(normalizedKeyword, category),
  ]);

  // Extract top 10 apps data
  const top10iTunes = searchResults.apps.slice(0, 10);
  const top10Apps: TopAppData[] = top10iTunes.map(app =>
    extractTopAppData(app, normalizedKeyword)
  );

  // Save top 10 apps to the apps database for cross-referencing
  await saveAppsToDatabase(top10iTunes, country, category);

  // Extract category data
  const categoryData = extractCategoryData(top10Apps);

  // Calculate market estimates from top apps
  const marketEstimates = calculateMarketEstimates(top10Apps);

  // Analyze competitor reviews for sentiment (only if apps have enough reviews)
  // DISABLED: Review analysis adds ~30s per keyword, causing timeouts on daily run
  // TODO: Re-enable once we have a background job queue for this
  const reviewSentiment = null;
  // if (shouldAnalyzeReviews(top10Apps)) {
  //   try {
  //     const sentimentResult = await analyzeCompetitorReviews(top10Apps, country, 3);
  //     reviewSentiment = { ... };
  //   } catch (error) {
  //     console.error('Error analyzing competitor reviews:', error);
  //   }
  // }

  // Build raw data object
  const rawData: OpportunityRawData = {
    itunes: {
      total_results: searchResults.total,
      top_10_apps: top10Apps,
      autosuggest_priority: autosuggestData.priority,
      autosuggest_position: autosuggestData.position,
    },
    google_trends: trendData.google_trends,
    reddit: trendData.reddit,
    pain_points: painPointData.signals.length > 0 ? {
      signals: painPointData.signals.map(s => ({
        title: s.title,
        body: s.body,
        subreddit: s.subreddit,
        url: s.url,
        score: s.score,
        num_comments: s.num_comments,
        signal_type: s.signal_type,
      })),
      total_signals: painPointData.total_signals,
      signal_strength: painPointData.signal_strength,
      top_pain_points: painPointData.top_pain_points,
    } : null,
    category_data: categoryData,
    market_estimates: marketEstimates,
    review_sentiment: reviewSentiment,
  };

  // Calculate all dimension scores
  const competitionGap = calculateCompetitionGap(top10Apps);
  const marketDemand = calculateMarketDemand(
    autosuggestData.priority,
    searchResults.total,
    trendData.google_trends,
    trendData.reddit
  );
  const revenuePotential = calculateRevenuePotential(top10Apps, categoryData);
  const trendMomentum = calculateTrendMomentum(
    trendData.google_trends,
    categoryData,
    trendData.reddit
  );
  const executionFeasibility = calculateExecutionFeasibility(top10Apps);

  // Calculate weighted final score
  const opportunityScore = calculateFinalScore({
    competition_gap: competitionGap.total,
    market_demand: marketDemand.total,
    revenue_potential: revenuePotential.total,
    trend_momentum: trendMomentum.total,
    execution_feasibility: executionFeasibility.total,
  });

  // Generate insights
  const reasoning = generateReasoning(
    competitionGap,
    marketDemand,
    revenuePotential,
    trendMomentum,
    executionFeasibility
  );

  const competitorWeaknesses = identifyCompetitorWeaknesses(top10Apps, competitionGap);
  const differentiator = suggestDifferentiator(
    top10Apps,
    competitionGap,
    executionFeasibility
  );

  return {
    keyword: normalizedKeyword,
    category,
    country,
    opportunity_score: opportunityScore,
    dimensions: {
      competition_gap: competitionGap.total,
      market_demand: marketDemand.total,
      revenue_potential: revenuePotential.total,
      trend_momentum: trendMomentum.total,
      execution_feasibility: executionFeasibility.total,
    },
    breakdowns: {
      competition_gap: competitionGap,
      market_demand: marketDemand,
      revenue_potential: revenuePotential,
      trend_momentum: trendMomentum,
      execution_feasibility: executionFeasibility,
    },
    reasoning,
    top_competitor_weaknesses: competitorWeaknesses,
    suggested_differentiator: differentiator,
    raw_data: rawData,
  };
}

// ============================================================================
// Final Score Calculation
// ============================================================================

/**
 * Calculate weighted final opportunity score
 */
function calculateFinalScore(dimensions: {
  competition_gap: number;
  market_demand: number;
  revenue_potential: number;
  trend_momentum: number;
  execution_feasibility: number;
}): number {
  const score =
    dimensions.competition_gap * DIMENSION_WEIGHTS.competition_gap +
    dimensions.market_demand * DIMENSION_WEIGHTS.market_demand +
    dimensions.revenue_potential * DIMENSION_WEIGHTS.revenue_potential +
    dimensions.trend_momentum * DIMENSION_WEIGHTS.trend_momentum +
    dimensions.execution_feasibility * DIMENSION_WEIGHTS.execution_feasibility;

  return Math.round(score * 10) / 10;
}

// ============================================================================
// Insight Generation
// ============================================================================

/**
 * Generate human-readable reasoning for the score
 */
function generateReasoning(
  competitionGap: CompetitionGapBreakdown,
  marketDemand: MarketDemandBreakdown,
  revenuePotential: RevenuePotentialBreakdown,
  trendMomentum: TrendMomentumBreakdown,
  executionFeasibility: ExecutionFeasibilityBreakdown
): string {
  const parts: string[] = [];

  // Lead with the strongest signals
  const dimensions = [
    { name: 'Competition gap', score: competitionGap.total, explain: explainCompetitionGap(competitionGap) },
    { name: 'Market demand', score: marketDemand.total, explain: explainMarketDemand(marketDemand) },
    { name: 'Revenue potential', score: revenuePotential.total, explain: explainRevenuePotential(revenuePotential) },
    { name: 'Trend momentum', score: trendMomentum.total, explain: explainTrendMomentum(trendMomentum) },
    { name: 'Execution feasibility', score: executionFeasibility.total, explain: explainExecutionFeasibility(executionFeasibility) },
  ].sort((a, b) => b.score - a.score);

  // Highlight top 2 strengths
  const strengths = dimensions.filter(d => d.score >= 60).slice(0, 2);
  for (const s of strengths) {
    parts.push(`${s.name} (${s.score}): ${s.explain}`);
  }

  // Note any major weaknesses
  const weaknesses = dimensions.filter(d => d.score < 40);
  if (weaknesses.length > 0) {
    parts.push(`Watch out: ${weaknesses.map(w => `${w.name} at ${w.score}`).join(', ')}.`);
  }

  // Add monetization suggestion
  const monetization = suggestMonetization(revenuePotential);
  parts.push(`Recommended monetization: ${monetization.primary}.`);

  // Add trend direction
  const trend = getTrendDirection(trendMomentum);
  if (trend.direction !== 'stable') {
    parts.push(`Market is ${trend.direction}: ${trend.recommendation}`);
  }

  return parts.join(' ');
}

/**
 * Identify weaknesses in top competitors
 */
function identifyCompetitorWeaknesses(
  topApps: TopAppData[],
  competitionGap: CompetitionGapBreakdown
): string[] {
  const weaknesses: string[] = [];

  // Low average rating = quality opportunity
  const avgRating = topApps.reduce((sum, app) => sum + app.rating, 0) / topApps.length;
  if (avgRating < 4.5) {
    weaknesses.push(`Average competitor rating is ${avgRating.toFixed(1)} - room for quality improvement`);
  }

  // Check for apps without certain features
  const appsWithWatch = topApps.filter(app =>
    app.requires_hardware.includes('watch') ||
    app.feature_count > 10 // Proxy for more complete apps
  );
  if (appsWithWatch.length < 3) {
    weaknesses.push('Few competitors have Apple Watch support');
  }

  // Check for subscription-only apps
  const subOnly = topApps.filter(app => app.has_subscription && !app.has_iap);
  if (subOnly.length > 3) {
    weaknesses.push('Subscription-only competitors - lifetime option could differentiate');
  }

  // Check feature density
  if (competitionGap.feature_density > 60) {
    weaknesses.push('Complex competitors - simpler UX could win users');
  }

  // Low review counts = beatable
  if (competitionGap.avg_review_count_normalized < 50) {
    weaknesses.push('Moderate review counts suggest beatable competition');
  }

  return weaknesses.slice(0, 5); // Limit to top 5
}

/**
 * Suggest a differentiator based on analysis
 */
function suggestDifferentiator(
  topApps: TopAppData[],
  competitionGap: CompetitionGapBreakdown,
  executionFeasibility: ExecutionFeasibilityBreakdown
): string {
  const suggestions: string[] = [];

  // Based on complexity
  if (competitionGap.feature_density > 60) {
    suggestions.push('simpler, focused experience');
  }

  // Based on execution difficulty
  const effort = estimateDevelopmentEffort(executionFeasibility);
  if (effort.difficulty === 'easy' || effort.difficulty === 'medium') {
    suggestions.push('native-only performance');
  }

  // Check monetization gaps
  const hasFreeOption = topApps.some(app => app.price === 0 && !app.has_subscription);
  if (!hasFreeOption) {
    suggestions.push('generous free tier');
  }

  // Check for missing platforms
  const avgFeatures = topApps.reduce((sum, app) => sum + app.feature_count, 0) / topApps.length;
  if (avgFeatures > 10) {
    suggestions.push('Apple Watch widget');
  }

  if (suggestions.length === 0) {
    suggestions.push('superior design and UX');
  }

  return `Differentiate with: ${suggestions.join(', ')}`;
}

// ============================================================================
// Batch Scoring
// ============================================================================

/**
 * Score multiple keywords with rate limiting
 */
export async function scoreOpportunities(
  keywords: Array<{ keyword: string; category: string }>,
  country: string = 'us',
  onProgress?: (scored: number, total: number, result: OpportunityScoreResult) => void
): Promise<OpportunityScoreResult[]> {
  const results: OpportunityScoreResult[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, category } = keywords[i];

    try {
      const result = await scoreOpportunity(keyword, category, country);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, keywords.length, result);
      }
    } catch (error) {
      console.error(`Error scoring ${keyword}:`, error);
      // Continue with other keywords
    }

    // Rate limiting between keywords
    if (i < keywords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DEFAULT_CONFIG.RATE_LIMIT_MS));
    }
  }

  return results;
}

/**
 * Rank opportunities by final score
 */
export function rankOpportunities(
  results: OpportunityScoreResult[]
): OpportunityScoreResult[] {
  return [...results].sort((a, b) => b.opportunity_score - a.opportunity_score);
}

/**
 * Select the top opportunity
 */
export function selectWinner(
  results: OpportunityScoreResult[]
): OpportunityScoreResult | null {
  if (results.length === 0) return null;
  const ranked = rankOpportunities(results);
  return ranked[0];
}
