// Trend Fetcher - Google Trends and Reddit Integration
// Fetches external trend data for opportunity scoring

import { OpportunityRawData } from './types';
import { CATEGORY_SUBREDDITS, DEFAULT_CONFIG } from './constants';
import { calculateSlope } from './dimension-calculators/trend-momentum';

// ============================================================================
// Google Trends Integration
// ============================================================================

interface GoogleTrendsResult {
  interest_over_time: number[];
  average_interest: number;
  slope: number;
  related_queries: string[];
  source: 'serpapi' | 'simulated';
}

/**
 * Fetch Google Trends data for a keyword
 * Uses SerpAPI if SERPAPI_KEY is available, otherwise falls back to simulation
 */
export async function fetchGoogleTrends(
  keyword: string,
  _timeframe: string = DEFAULT_CONFIG.GOOGLE_TRENDS_TIMEFRAME
): Promise<GoogleTrendsResult | null> {
  const serpApiKey = process.env.SERPAPI_KEY;

  // Try SerpAPI first if key is available
  if (serpApiKey) {
    try {
      const realData = await fetchGoogleTrendsSerpAPI(keyword, serpApiKey);
      if (realData) {
        return realData;
      }
    } catch (error) {
      console.error('SerpAPI Google Trends error, falling back to simulation:', error);
    }
  }

  // Fall back to simulation
  try {
    const simulatedData = simulateGoogleTrends(keyword);
    return simulatedData;
  } catch (error) {
    console.error('Error fetching Google Trends:', error);
    return null;
  }
}

/**
 * Fetch real Google Trends data via SerpAPI
 */
async function fetchGoogleTrendsSerpAPI(
  keyword: string,
  apiKey: string
): Promise<GoogleTrendsResult | null> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_trends');
  url.searchParams.set('q', keyword);
  url.searchParams.set('data_type', 'TIMESERIES');
  url.searchParams.set('date', 'today 12-m');
  url.searchParams.set('geo', 'US');
  url.searchParams.set('api_key', apiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.error(`SerpAPI error: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = await response.json();

  // Parse interest over time
  const timelineData = data.interest_over_time?.timeline_data || [];
  const interestOverTime: number[] = timelineData.map((point: { values?: Array<{ extracted_value?: number }> }) => {
    return point.values?.[0]?.extracted_value || 0;
  });

  // Calculate average interest
  const avgInterest = interestOverTime.length > 0
    ? interestOverTime.reduce((a, b) => a + b, 0) / interestOverTime.length
    : 50;

  // Calculate slope
  const slope = calculateSlope(interestOverTime);

  // Extract related queries
  const relatedQueries: string[] = [];
  const risingQueries = data.related_queries?.rising || [];
  const topQueries = data.related_queries?.top || [];

  risingQueries.slice(0, 3).forEach((q: { query?: string }) => {
    if (q.query) relatedQueries.push(q.query);
  });
  topQueries.slice(0, 2).forEach((q: { query?: string }) => {
    if (q.query && !relatedQueries.includes(q.query)) relatedQueries.push(q.query);
  });

  return {
    interest_over_time: interestOverTime,
    average_interest: Math.round(avgInterest),
    slope: Math.round(slope * 100) / 100,
    related_queries: relatedQueries,
    source: 'serpapi',
  };
}

/**
 * Simulate Google Trends data as fallback
 * Used when SerpAPI is not configured
 */
function simulateGoogleTrends(keyword: string): GoogleTrendsResult {
  // Generate pseudo-random but consistent data based on keyword
  const hash = simpleHash(keyword);
  const baseInterest = 30 + (hash % 50);

  // Generate 12 months of data with some variation
  const interest_over_time: number[] = [];
  let currentInterest = baseInterest;

  for (let i = 0; i < 12; i++) {
    // Add some variation but keep it bounded
    const variation = ((hash >> (i % 8)) % 20) - 10;
    currentInterest = Math.max(10, Math.min(100, currentInterest + variation));
    interest_over_time.push(Math.round(currentInterest));
  }

  const average_interest = interest_over_time.reduce((a, b) => a + b, 0) / interest_over_time.length;
  const slope = calculateSlope(interest_over_time);

  // Generate related queries
  const related_queries = generateRelatedQueries(keyword);

  return {
    interest_over_time,
    average_interest: Math.round(average_interest),
    slope: Math.round(slope * 100) / 100,
    related_queries,
    source: 'simulated',
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function generateRelatedQueries(keyword: string): string[] {
  const words = keyword.split(' ');
  const queries: string[] = [];

  // Add variations
  queries.push(`best ${keyword}`);
  queries.push(`${keyword} app`);
  queries.push(`free ${keyword}`);

  if (words.length > 1) {
    queries.push(words[0]);
  }

  return queries.slice(0, 5);
}

// ============================================================================
// Reddit Integration
// ============================================================================

interface RedditResult {
  posts_per_week: number;
  total_posts_30d: number;
  avg_upvotes: number;
  avg_comments: number;
  top_subreddits: string[];
  sentiment_score: number;
}

interface RedditPost {
  title: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
}

/**
 * Fetch Reddit data for a keyword
 * Uses Reddit's public JSON API (no auth required for public data)
 */
export async function fetchRedditData(
  keyword: string,
  category: string
): Promise<RedditResult | null> {
  try {
    const subreddits = CATEGORY_SUBREDDITS[category] || ['all'];
    const posts: RedditPost[] = [];

    // Search relevant subreddits
    for (const subreddit of subreddits.slice(0, 3)) { // Limit to 3 subreddits
      const subredditPosts = await searchRedditSubreddit(subreddit, keyword);
      posts.push(...subredditPosts);

      // Rate limit between requests
      await delay(DEFAULT_CONFIG.RATE_LIMIT_MS);
    }

    if (posts.length === 0) {
      return simulateRedditData(keyword);
    }

    // Calculate metrics
    const now = Date.now() / 1000;
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);

    const recentPosts = posts.filter(p => p.created_utc > thirtyDaysAgo);
    const weekPosts = posts.filter(p => p.created_utc > sevenDaysAgo);

    const avgUpvotes = recentPosts.length > 0
      ? recentPosts.reduce((sum, p) => sum + p.score, 0) / recentPosts.length
      : 0;

    const avgComments = recentPosts.length > 0
      ? recentPosts.reduce((sum, p) => sum + p.num_comments, 0) / recentPosts.length
      : 0;

    // Count unique subreddits
    const subredditCounts = new Map<string, number>();
    for (const post of recentPosts) {
      subredditCounts.set(post.subreddit, (subredditCounts.get(post.subreddit) || 0) + 1);
    }
    const topSubreddits = Array.from(subredditCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sub]) => sub);

    // Simple sentiment analysis based on upvote ratio
    const sentimentScore = avgUpvotes > 50 ? 0.5 : avgUpvotes > 10 ? 0.2 : 0;

    return {
      posts_per_week: weekPosts.length,
      total_posts_30d: recentPosts.length,
      avg_upvotes: Math.round(avgUpvotes),
      avg_comments: Math.round(avgComments),
      top_subreddits: topSubreddits,
      sentiment_score: sentimentScore,
    };
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
    return simulateRedditData(keyword);
  }
}

/**
 * Validate subreddit name to prevent URL injection
 * Reddit subreddit names: 2-21 alphanumeric characters or underscores
 */
function isValidSubreddit(subreddit: string): boolean {
  return /^[a-zA-Z0-9_]{2,21}$/.test(subreddit);
}

/**
 * Search a single subreddit for keyword mentions
 */
async function searchRedditSubreddit(
  subreddit: string,
  keyword: string
): Promise<RedditPost[]> {
  // SECURITY FIX: Validate subreddit name to prevent URL injection
  if (!isValidSubreddit(subreddit)) {
    console.error(`Invalid subreddit name rejected: ${subreddit.slice(0, 50)}`);
    return [];
  }

  try {
    // Use URL constructor for safe URL building
    const url = new URL(`https://www.reddit.com/r/${subreddit}/search.json`);
    url.searchParams.set('q', keyword);
    url.searchParams.set('restrict_sr', 'on');
    url.searchParams.set('sort', 'new');
    url.searchParams.set('limit', '100');
    url.searchParams.set('t', 'month');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AppStoreScraper/1.0',
      },
    });

    if (!response.ok) {
      console.error(`Reddit API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const children = data?.data?.children || [];

    return children.map((child: { data: RedditPost }) => ({
      title: child.data.title,
      score: child.data.score,
      num_comments: child.data.num_comments,
      created_utc: child.data.created_utc,
      subreddit: child.data.subreddit,
    }));
  } catch (error) {
    console.error(`Error searching r/${subreddit}:`, error);
    return [];
  }
}

/**
 * Simulate Reddit data when API fails or for development
 */
function simulateRedditData(keyword: string): RedditResult {
  const hash = simpleHash(keyword);

  return {
    posts_per_week: 5 + (hash % 30),
    total_posts_30d: 20 + (hash % 100),
    avg_upvotes: 10 + (hash % 50),
    avg_comments: 3 + (hash % 15),
    top_subreddits: ['productivity', 'apple', 'iphone'],
    sentiment_score: 0.3,
  };
}

// ============================================================================
// Combined Trend Fetcher
// ============================================================================

/**
 * Fetch all external trend data for an opportunity
 */
export async function fetchTrendData(
  keyword: string,
  category: string
): Promise<{
  google_trends: OpportunityRawData['google_trends'];
  reddit: OpportunityRawData['reddit'];
}> {
  // Fetch in parallel
  const [googleTrends, redditData] = await Promise.all([
    fetchGoogleTrends(keyword),
    fetchRedditData(keyword, category),
  ]);

  return {
    google_trends: googleTrends,
    reddit: redditData,
  };
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if Google Trends integration is available (via SerpAPI)
 */
export function isGoogleTrendsAvailable(): boolean {
  return !!process.env.SERPAPI_KEY;
}

/**
 * Check if Reddit API is available
 */
export async function isRedditAvailable(): Promise<boolean> {
  try {
    const response = await fetch('https://www.reddit.com/api/v1/me.json', {
      headers: { 'User-Agent': 'AppStoreScraper/1.0' },
    });
    return response.status !== 403;
  } catch {
    return false;
  }
}

// ============================================================================
// Pain Point Scanner - Reddit "I wish there was an app" Detection
// ============================================================================

export interface PainPointSignal {
  title: string;
  body: string;
  subreddit: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  signal_type: 'wish' | 'looking_for' | 'frustration' | 'recommendation_request';
}

export interface PainPointResult {
  signals: PainPointSignal[];
  total_signals: number;
  signal_strength: number; // 0-100 based on quality/quantity of signals
  top_pain_points: string[]; // Extracted pain point summaries
}

/**
 * Search Reddit for pain point signals related to a keyword/category
 * Looks for posts like "I wish there was an app...", "looking for an app that...", etc.
 */
export async function fetchPainPointSignals(
  keyword: string,
  category: string
): Promise<PainPointResult> {
  const signals: PainPointSignal[] = [];
  const subreddits = CATEGORY_SUBREDDITS[category] || ['all'];

  // Pain point search patterns
  const painPointQueries = [
    `"wish there was" ${keyword}`,
    `"looking for" app ${keyword}`,
    `"need an app" ${keyword}`,
    `"anyone know" app ${keyword}`,
    `"recommend" app ${keyword}`,
    `"frustrated" ${keyword} app`,
    `"alternative to" ${keyword}`,
  ];

  // Search for pain points across subreddits
  for (const subreddit of subreddits.slice(0, 2)) { // Limit to 2 subreddits to avoid rate limits
    for (const query of painPointQueries.slice(0, 3)) { // Limit queries
      try {
        const posts = await searchRedditPainPoints(subreddit, query);
        signals.push(...posts);
        await delay(DEFAULT_CONFIG.RATE_LIMIT_MS);
      } catch (error) {
        console.error(`Error searching pain points in r/${subreddit}:`, error);
      }
    }
  }

  // Also search in app-related subreddits
  const appSubreddits = ['iosapps', 'AppHookup', 'iphone'];
  for (const subreddit of appSubreddits) {
    try {
      const posts = await searchRedditPainPoints(subreddit, keyword);
      signals.push(...posts);
      await delay(DEFAULT_CONFIG.RATE_LIMIT_MS);
    } catch (error) {
      console.error(`Error searching pain points in r/${subreddit}:`, error);
    }
  }

  // Deduplicate signals
  const uniqueSignals = deduplicateSignals(signals);

  // Calculate signal strength
  const signalStrength = calculateSignalStrength(uniqueSignals);

  // Extract top pain points
  const topPainPoints = extractTopPainPoints(uniqueSignals);

  return {
    signals: uniqueSignals.slice(0, 20), // Limit to top 20
    total_signals: uniqueSignals.length,
    signal_strength: signalStrength,
    top_pain_points: topPainPoints,
  };
}

/**
 * Search a subreddit for pain point posts
 */
async function searchRedditPainPoints(
  subreddit: string,
  query: string
): Promise<PainPointSignal[]> {
  // SECURITY FIX: Validate subreddit name to prevent URL injection
  if (!isValidSubreddit(subreddit)) {
    console.error(`Invalid subreddit name rejected: ${subreddit.slice(0, 50)}`);
    return [];
  }

  try {
    // Use URL constructor for safe URL building
    const url = new URL(`https://www.reddit.com/r/${subreddit}/search.json`);
    url.searchParams.set('q', query);
    url.searchParams.set('restrict_sr', 'on');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('limit', '25');
    url.searchParams.set('t', 'year');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AppStoreScraper/1.0',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const children = data?.data?.children || [];

    return children
      .map((child: { data: {
        title: string;
        selftext?: string;
        subreddit: string;
        permalink: string;
        score: number;
        num_comments: number;
        created_utc: number;
      }}) => {
        const post = child.data;
        const signalType = detectSignalType(post.title, post.selftext || '');

        if (!signalType) return null;

        return {
          title: post.title,
          body: (post.selftext || '').slice(0, 500), // Limit body length
          subreddit: post.subreddit,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          num_comments: post.num_comments,
          created_utc: post.created_utc,
          signal_type: signalType,
        };
      })
      .filter((signal: PainPointSignal | null): signal is PainPointSignal => signal !== null);
  } catch (error) {
    console.error(`Error searching r/${subreddit} for pain points:`, error);
    return [];
  }
}

/**
 * Detect the type of pain point signal from post content
 */
function detectSignalType(
  title: string,
  body: string
): PainPointSignal['signal_type'] | null {
  const content = `${title} ${body}`.toLowerCase();

  if (
    content.includes('wish there was') ||
    content.includes('wish i had') ||
    content.includes('would love an app') ||
    content.includes('someone should make')
  ) {
    return 'wish';
  }

  if (
    content.includes('looking for') ||
    content.includes('searching for') ||
    content.includes('need an app') ||
    content.includes('need a') ||
    content.includes('any app')
  ) {
    return 'looking_for';
  }

  if (
    content.includes('frustrated') ||
    content.includes('annoying') ||
    content.includes('hate') ||
    content.includes('terrible') ||
    content.includes('worst')
  ) {
    return 'frustration';
  }

  if (
    content.includes('recommend') ||
    content.includes('alternative') ||
    content.includes('anyone know') ||
    content.includes('any suggestions')
  ) {
    return 'recommendation_request';
  }

  return null;
}

/**
 * Deduplicate signals by URL
 */
function deduplicateSignals(signals: PainPointSignal[]): PainPointSignal[] {
  const seen = new Set<string>();
  return signals.filter(signal => {
    if (seen.has(signal.url)) return false;
    seen.add(signal.url);
    return true;
  }).sort((a, b) => b.score - a.score); // Sort by score
}

/**
 * Calculate signal strength (0-100) based on quantity and quality
 */
function calculateSignalStrength(signals: PainPointSignal[]): number {
  if (signals.length === 0) return 0;

  // Quantity score (more signals = higher score, up to 50 points)
  const quantityScore = Math.min(signals.length * 5, 50);

  // Quality score (based on engagement, up to 50 points)
  const avgScore = signals.reduce((sum, s) => sum + s.score, 0) / signals.length;
  const avgComments = signals.reduce((sum, s) => sum + s.num_comments, 0) / signals.length;
  const qualityScore = Math.min(
    (Math.log10(avgScore + 1) * 15) + (Math.log10(avgComments + 1) * 15),
    50
  );

  // Bonus for "wish" and "looking_for" signals (strongest buying intent)
  const strongSignals = signals.filter(s =>
    s.signal_type === 'wish' || s.signal_type === 'looking_for'
  );
  const intentBonus = Math.min(strongSignals.length * 3, 15);

  return Math.min(Math.round(quantityScore + qualityScore + intentBonus), 100);
}

/**
 * Extract top pain point summaries from signals
 */
function extractTopPainPoints(signals: PainPointSignal[]): string[] {
  // Group by signal type and extract key themes
  const painPoints: string[] = [];

  const wishSignals = signals.filter(s => s.signal_type === 'wish');
  const lookingForSignals = signals.filter(s => s.signal_type === 'looking_for');
  const frustrationSignals = signals.filter(s => s.signal_type === 'frustration');

  if (wishSignals.length > 0) {
    painPoints.push(`${wishSignals.length} users actively wishing for a solution`);
  }

  if (lookingForSignals.length > 0) {
    painPoints.push(`${lookingForSignals.length} users actively searching for apps`);
  }

  if (frustrationSignals.length > 0) {
    painPoints.push(`${frustrationSignals.length} users frustrated with existing options`);
  }

  // Add specific examples from highest-scored posts
  const topPosts = signals.slice(0, 3);
  for (const post of topPosts) {
    if (post.score >= 10) {
      const snippet = post.title.length > 80
        ? post.title.slice(0, 80) + '...'
        : post.title;
      painPoints.push(`"${snippet}" (${post.score} upvotes)`);
    }
  }

  return painPoints.slice(0, 5);
}
