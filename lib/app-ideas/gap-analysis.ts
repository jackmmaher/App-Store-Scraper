// Gap Analysis Module
// Uses Claude to analyze top apps and identify opportunities
// Enhanced with Crawl4AI for extended review and Reddit enrichment

import { GapAnalysis, GapAnalysisPromptResult, ClusterScore, AnalyzedApp } from './types';
import { getEnrichmentForPrompt } from '@/lib/crawl';

interface iTunesApp {
  trackId: number;
  trackName: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl100: string;
  price: number;
  description: string;
  formattedPrice: string;
}

interface iTunesSearchResult {
  resultCount: number;
  results: iTunesApp[];
}

/**
 * Search iTunes for apps matching a keyword
 */
async function searchiTunes(
  keyword: string,
  country: string = 'us',
  limit: number = 10
): Promise<iTunesApp[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${country}&entity=software&limit=${limit}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`iTunes search error: ${response.status}`);
      return [];
    }

    const data: iTunesSearchResult = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching iTunes:', error);
    return [];
  }
}

/**
 * Get top apps for a cluster's keywords
 */
async function getTopAppsForCluster(
  keywords: string[],
  country: string
): Promise<iTunesApp[]> {
  const allApps: iTunesApp[] = [];
  const seenIds = new Set<number>();

  // Search for top 3 keywords to get representative apps
  const searchKeywords = keywords.slice(0, 3);

  for (const keyword of searchKeywords) {
    const apps = await searchiTunes(keyword, country, 10);

    for (const app of apps) {
      if (!seenIds.has(app.trackId)) {
        seenIds.add(app.trackId);
        allApps.push(app);
      }
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Sort by review count (proxy for popularity) and take top 10
  return allApps
    .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
    .slice(0, 10);
}

/**
 * Convert iTunes app to AnalyzedApp format
 */
function toAnalyzedApp(app: iTunesApp): AnalyzedApp {
  const description = app.description?.toLowerCase() || '';
  const hasSubscription = [
    'subscription', 'subscribe', 'monthly', 'yearly', 'annual',
    'per month', 'per year', '/month', '/year', 'free trial', 'auto-renew'
  ].some(kw => description.includes(kw));

  return {
    id: app.trackId.toString(),
    name: app.trackName,
    rating: app.averageUserRating || 0,
    reviews: app.userRatingCount || 0,
    iconUrl: app.artworkUrl100 || '',
    price: app.price || 0,
    hasSubscription,
  };
}

/**
 * Perform gap analysis for a single cluster
 */
export async function analyzeClusterGap(
  clusterScore: ClusterScore,
  country: string,
  apiKey: string
): Promise<GapAnalysis> {
  // Get top apps for this cluster
  const topApps = await getTopAppsForCluster(clusterScore.keywords, country);

  if (topApps.length === 0) {
    // Return empty analysis if no apps found
    return {
      clusterId: clusterScore.clusterId,
      clusterName: clusterScore.clusterName,
      existingFeatures: [],
      userComplaints: ['No competing apps found in App Store'],
      gaps: ['Opportunity to be first mover in this space'],
      monetizationInsights: 'No existing monetization patterns to analyze',
      analyzedApps: [],
    };
  }

  // Build app summaries for Claude
  const appSummaries = topApps.map(app => ({
    name: app.trackName,
    rating: app.averageUserRating?.toFixed(1) || 'N/A',
    reviews: app.userRatingCount || 0,
    price: app.price === 0 ? 'Free' : `$${app.price.toFixed(2)}`,
    description: (app.description || '').substring(0, 500),
  }));

  // NEW: Get enriched data from Crawl4AI (extended reviews + Reddit discussions)
  const appStoreIds = topApps.slice(0, 3).map(a => a.trackId.toString());
  const enrichment = await getEnrichmentForPrompt({
    appStoreIds,
    keywords: clusterScore.keywords.slice(0, 5),
    country,
    options: {
      includeReviews: true,
      includeReddit: true,
      includeWebsites: false,
      maxReviewsPerApp: 100,
      maxRedditPosts: 20,
    },
  });

  const systemPrompt = `You are an app market analyst expert. Analyze competing apps to identify opportunities for a new app.

Your task:
1. Identify common features across these apps
2. Identify user complaints based on ratings, descriptions, and the REAL USER REVIEWS provided below
3. Identify gaps - what's missing that users want (use Reddit discussions for validation)
4. Summarize monetization patterns

Be specific and actionable. Focus on insights that would help a developer build a better app.
Use the enriched review and Reddit data to provide more accurate, evidence-based insights.

Return your response as valid JSON with this exact structure:
{
  "existing_features": ["feature1", "feature2", ...],
  "user_complaints": ["complaint1", "complaint2", ...],
  "gaps": ["gap1", "gap2", ...],
  "monetization_insights": "Summary of how these apps make money"
}`;

  const userPrompt = `Analyze these ${topApps.length} top apps in the "${clusterScore.clusterName}" category:

${JSON.stringify(appSummaries, null, 2)}

Keywords in this cluster: ${clusterScore.keywords.slice(0, 10).join(', ')}

${enrichment ? `
---
## ENRICHED DATA (Real User Reviews & Reddit Discussions)

${enrichment}
---
` : ''}

Identify features, pain points, gaps, and monetization patterns. Return valid JSON only.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error during gap analysis:', error);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0]?.text || '';

    // Parse the JSON response
    const result = parseGapAnalysisResponse(responseText);

    return {
      clusterId: clusterScore.clusterId,
      clusterName: clusterScore.clusterName,
      existingFeatures: result.existing_features,
      userComplaints: result.user_complaints,
      gaps: result.gaps,
      monetizationInsights: result.monetization_insights,
      analyzedApps: topApps.map(toAnalyzedApp),
    };
  } catch (error) {
    console.error('Error in gap analysis:', error);

    // Return partial analysis on error
    return {
      clusterId: clusterScore.clusterId,
      clusterName: clusterScore.clusterName,
      existingFeatures: [],
      userComplaints: ['Analysis failed - please retry'],
      gaps: [],
      monetizationInsights: 'Unable to analyze monetization patterns',
      analyzedApps: topApps.map(toAnalyzedApp),
    };
  }
}

/**
 * Parse Claude's gap analysis response
 */
function parseGapAnalysisResponse(responseText: string): GapAnalysisPromptResult {
  let jsonStr = responseText.trim();

  // Handle markdown code blocks
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    return {
      existing_features: parsed.existing_features || [],
      user_complaints: parsed.user_complaints || [],
      gaps: parsed.gaps || [],
      monetization_insights: parsed.monetization_insights || 'No insights available',
    };
  } catch (parseError) {
    console.error('Failed to parse gap analysis response:', parseError);
    console.error('Raw response:', responseText);
    throw new Error('Failed to parse Claude gap analysis response');
  }
}

/**
 * Perform gap analysis for top N clusters
 */
export async function analyzeTopClusters(
  clusterScores: ClusterScore[],
  country: string,
  apiKey: string,
  topN: number = 3
): Promise<GapAnalysis[]> {
  // Sort by opportunity score and take top N
  const sortedClusters = [...clusterScores]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, topN);

  const analyses: GapAnalysis[] = [];

  for (const clusterScore of sortedClusters) {
    const analysis = await analyzeClusterGap(clusterScore, country, apiKey);
    analyses.push(analysis);

    // Rate limiting between API calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return analyses;
}
