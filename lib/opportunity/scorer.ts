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
import { fetchTrendData } from './trend-fetcher';
import { getAutosuggestData } from '../keywords/autosuggest';

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
  };
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
  const [autosuggestData, searchResults, trendData] = await Promise.all([
    getAutosuggestData(normalizedKeyword, country),
    searchiTunes(normalizedKeyword, country, 200),
    fetchTrendData(normalizedKeyword, category),
  ]);

  // Extract top 10 apps data
  const top10iTunes = searchResults.apps.slice(0, 10);
  const top10Apps: TopAppData[] = top10iTunes.map(app =>
    extractTopAppData(app, normalizedKeyword)
  );

  // Extract category data
  const categoryData = extractCategoryData(top10Apps);

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
    category_data: categoryData,
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
