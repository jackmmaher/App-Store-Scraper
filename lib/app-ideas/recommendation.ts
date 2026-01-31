// Recommendation Generation Module
// Uses Claude to generate actionable "build this app" recommendations
// Enhanced with Crawl4AI for enriched review and Reddit data

import {
  Recommendation,
  RecommendationPromptResult,
  ClusterScore,
  GapAnalysis,
} from './types';
import { getEnrichmentForPrompt } from '@/lib/crawl';

/**
 * Generate a recommendation for a single cluster
 */
export async function generateRecommendation(
  clusterScore: ClusterScore,
  gapAnalysis: GapAnalysis,
  apiKey: string
): Promise<Recommendation> {
  const systemPrompt = `You are a seasoned app entrepreneur and product strategist. Based on market analysis data, generate a compelling and actionable app idea recommendation.

Your recommendation should be:
1. Specific and actionable - tell them exactly what to build
2. Grounded in the data - reference the gaps and opportunities
3. Realistic - consider the feasibility and competition
4. Commercial - address monetization directly

Return your response as valid JSON with this exact structure:
{
  "headline": "Build a [Type] App focused on [Key Differentiator]",
  "reasoning": ["reason1", "reason2", "reason3"],
  "combined_search_volume": "Estimate like '40K monthly searches across cluster'",
  "competition_summary": "Brief assessment of competition beatable-ness",
  "primary_gap": "The main opportunity to exploit",
  "suggested_monetization": "Specific pricing strategy",
  "mvp_scope": "What to build first and rough timeline",
  "differentiator": "The key thing that makes this app stand out"
}`;

  const userPrompt = `Generate an app recommendation based on this market analysis:

## Cluster: ${clusterScore.clusterName}
**Keywords:** ${clusterScore.keywords.slice(0, 15).join(', ')}

## Scores (0-100)
- Overall Opportunity: ${clusterScore.opportunityScore}
- Competition Gap: ${clusterScore.competitionGap} (higher = less competition)
- Market Demand: ${clusterScore.marketDemand}
- Revenue Potential: ${clusterScore.revenuePotential}
- Trend Momentum: ${clusterScore.trendMomentum}
- Execution Feasibility: ${clusterScore.executionFeasibility}

## Gap Analysis
**Existing Features in Competitors:**
${gapAnalysis.existingFeatures.map(f => `- ${f}`).join('\n')}

**User Pain Points:**
${gapAnalysis.userComplaints.map(c => `- ${c}`).join('\n')}

**Market Gaps (Opportunities):**
${gapAnalysis.gaps.map(g => `- ${g}`).join('\n')}

**Monetization Patterns:**
${gapAnalysis.monetizationInsights}

**Top Competitors Analyzed:** ${gapAnalysis.analyzedApps.length} apps
- Avg Rating: ${(gapAnalysis.analyzedApps.reduce((sum, app) => sum + app.rating, 0) / gapAnalysis.analyzedApps.length).toFixed(1)}
- Avg Reviews: ${Math.round(gapAnalysis.analyzedApps.reduce((sum, app) => sum + app.reviews, 0) / gapAnalysis.analyzedApps.length).toLocaleString()}

Generate a compelling, actionable app recommendation. Return valid JSON only.`;

  // NEW: Fetch enrichment data from Crawl4AI (extended reviews + Reddit)
  let enrichment = '';
  try {
    const appIds = gapAnalysis.analyzedApps.slice(0, 3).map(a => a.id);
    enrichment = await getEnrichmentForPrompt({
      appStoreIds: appIds,
      keywords: clusterScore.keywords.slice(0, 5),
      options: {
        includeReviews: true,
        includeReddit: true,
        includeWebsites: false,
        maxReviewsPerApp: 50,
        maxRedditPosts: 15,
      },
    });
  } catch (error) {
    console.log('Enrichment unavailable, proceeding without');
  }

  // Append enrichment to user prompt if available
  const enrichedUserPrompt = enrichment
    ? `${userPrompt}

---
## ENRICHED DATA (Real User Reviews & Reddit Discussions)

${enrichment}

Use this data to make your recommendation more specific and grounded in real user feedback.
---`
    : userPrompt;

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
        messages: [{ role: 'user', content: enrichedUserPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error during recommendation:', error);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0]?.text || '';

    // Parse the JSON response
    const result = parseRecommendationResponse(responseText);

    return {
      clusterId: clusterScore.clusterId,
      clusterName: clusterScore.clusterName,
      headline: result.headline,
      reasoning: result.reasoning,
      combinedSearchVolume: result.combined_search_volume,
      competitionSummary: result.competition_summary,
      primaryGap: result.primary_gap,
      suggestedMonetization: result.suggested_monetization,
      mvpScope: result.mvp_scope,
      differentiator: result.differentiator,
      opportunityScore: clusterScore.opportunityScore,
    };
  } catch (error) {
    console.error('Error generating recommendation:', error);

    // Return fallback recommendation on error
    return {
      clusterId: clusterScore.clusterId,
      clusterName: clusterScore.clusterName,
      headline: `Build an app for ${clusterScore.clusterName}`,
      reasoning: ['Analysis in progress - please retry for detailed insights'],
      combinedSearchVolume: 'Unable to estimate',
      competitionSummary: `Opportunity score: ${clusterScore.opportunityScore}`,
      primaryGap: gapAnalysis.gaps[0] || 'Further analysis needed',
      suggestedMonetization: gapAnalysis.monetizationInsights,
      mvpScope: 'Requires detailed analysis',
      differentiator: 'Focus on user experience and simplicity',
      opportunityScore: clusterScore.opportunityScore,
    };
  }
}

/**
 * Parse Claude's recommendation response
 */
function parseRecommendationResponse(responseText: string): RecommendationPromptResult {
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
      headline: parsed.headline || 'Build an innovative app',
      reasoning: parsed.reasoning || [],
      combined_search_volume: parsed.combined_search_volume || 'Unknown',
      competition_summary: parsed.competition_summary || 'Competition analysis unavailable',
      primary_gap: parsed.primary_gap || 'Market gap analysis pending',
      suggested_monetization: parsed.suggested_monetization || 'Standard freemium model',
      mvp_scope: parsed.mvp_scope || 'Start with core features',
      differentiator: parsed.differentiator || 'Superior user experience',
    };
  } catch (parseError) {
    console.error('Failed to parse recommendation response:', parseError);
    console.error('Raw response:', responseText);
    throw new Error('Failed to parse Claude recommendation response');
  }
}

/**
 * Generate recommendations for multiple clusters
 */
export async function generateRecommendations(
  clusterScores: ClusterScore[],
  gapAnalyses: GapAnalysis[],
  apiKey: string
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Create a map of gap analyses by cluster ID for quick lookup
  const gapMap = new Map(gapAnalyses.map(g => [g.clusterId, g]));

  for (const clusterScore of clusterScores) {
    const gapAnalysis = gapMap.get(clusterScore.clusterId);

    if (!gapAnalysis) {
      console.warn(`No gap analysis found for cluster ${clusterScore.clusterId}`);
      continue;
    }

    const recommendation = await generateRecommendation(
      clusterScore,
      gapAnalysis,
      apiKey
    );
    recommendations.push(recommendation);

    // Rate limiting between API calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Sort by opportunity score
  return recommendations.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
