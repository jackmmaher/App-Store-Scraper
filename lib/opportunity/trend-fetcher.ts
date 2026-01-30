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
}

/**
 * Fetch Google Trends data for a keyword
 * Uses a simple approach that works without the full pytrends library
 */
export async function fetchGoogleTrends(
  keyword: string,
  _timeframe: string = DEFAULT_CONFIG.GOOGLE_TRENDS_TIMEFRAME
): Promise<GoogleTrendsResult | null> {
  try {
    // Google Trends embed endpoint for basic data
    // This is a lightweight approach that doesn't require authentication
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=US&ns=15`;

    // Note: Full Google Trends integration requires either:
    // 1. pytrends Python library via a microservice
    // 2. SerpAPI or similar paid service
    // 3. Manual scraping (unreliable)

    // For now, we'll use a simulated/cached approach for MVP
    // and mark this as requiring enhancement

    // Simulate trends data based on keyword characteristics
    // This will be replaced with real API integration
    const simulatedData = simulateGoogleTrends(keyword);

    return simulatedData;
  } catch (error) {
    console.error('Error fetching Google Trends:', error);
    return null;
  }
}

/**
 * Simulate Google Trends data for MVP
 * TODO: Replace with real API integration (pytrends microservice or SerpAPI)
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
 * Search a single subreddit for keyword mentions
 */
async function searchRedditSubreddit(
  subreddit: string,
  keyword: string
): Promise<RedditPost[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=on&sort=new&limit=100&t=month`;

    const response = await fetch(url, {
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
 * Check if Google Trends integration is available
 * For now, returns false until real integration is set up
 */
export function isGoogleTrendsAvailable(): boolean {
  // TODO: Check for pytrends microservice or SerpAPI key
  return false; // Using simulation
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
