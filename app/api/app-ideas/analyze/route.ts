import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { scoreOpportunity } from '@/lib/opportunity/scorer';
import { analyzeTopClusters } from '@/lib/app-ideas/gap-analysis';
import { generateRecommendations } from '@/lib/app-ideas/recommendation';
import {
  Cluster,
  ClusterScore,
  GapAnalysis,
  Recommendation,
  ScoreClustersRequest,
  AnalyzeRequest,
} from '@/lib/app-ideas/types';

// Rate limiting delay
const RATE_LIMIT_MS = 300;

/**
 * Score a single cluster by scoring representative keywords
 */
async function scoreCluster(
  cluster: Cluster,
  category: string,
  country: string
): Promise<ClusterScore> {
  // Score the top 3 keywords from the cluster
  const keywordsToScore = cluster.keywords.slice(0, 3);
  const scores = {
    opportunityScore: 0,
    competitionGap: 0,
    marketDemand: 0,
    revenuePotential: 0,
    trendMomentum: 0,
    executionFeasibility: 0,
  };

  let scoredCount = 0;
  const keywordScores = [];

  for (const keyword of keywordsToScore) {
    try {
      const result = await scoreOpportunity(keyword, category, country);

      scores.opportunityScore += result.opportunity_score;
      scores.competitionGap += result.dimensions.competition_gap;
      scores.marketDemand += result.dimensions.market_demand;
      scores.revenuePotential += result.dimensions.revenue_potential;
      scores.trendMomentum += result.dimensions.trend_momentum;
      scores.executionFeasibility += result.dimensions.execution_feasibility;
      scoredCount++;

      keywordScores.push({
        keyword,
        opportunityScore: result.opportunity_score,
        competitionGap: result.dimensions.competition_gap,
        marketDemand: result.dimensions.market_demand,
        revenuePotential: result.dimensions.revenue_potential,
        trendMomentum: result.dimensions.trend_momentum,
        executionFeasibility: result.dimensions.execution_feasibility,
      });

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    } catch (error) {
      console.error(`Error scoring keyword ${keyword}:`, error);
    }
  }

  // Calculate averages
  if (scoredCount > 0) {
    scores.opportunityScore = Math.round(scores.opportunityScore / scoredCount);
    scores.competitionGap = Math.round(scores.competitionGap / scoredCount);
    scores.marketDemand = Math.round(scores.marketDemand / scoredCount);
    scores.revenuePotential = Math.round(scores.revenuePotential / scoredCount);
    scores.trendMomentum = Math.round(scores.trendMomentum / scoredCount);
    scores.executionFeasibility = Math.round(scores.executionFeasibility / scoredCount);
  }

  // Generate reasoning summary
  const reasoning = generateClusterReasoning(scores, cluster.name);

  return {
    clusterId: cluster.id,
    clusterName: cluster.name,
    keywords: cluster.keywords,
    ...scores,
    reasoning,
    keywordScores,
  };
}

/**
 * Generate human-readable reasoning for cluster score
 */
function generateClusterReasoning(
  scores: {
    opportunityScore: number;
    competitionGap: number;
    marketDemand: number;
    revenuePotential: number;
    trendMomentum: number;
    executionFeasibility: number;
  },
  clusterName: string
): string {
  const parts: string[] = [];

  // Lead with overall assessment
  if (scores.opportunityScore >= 70) {
    parts.push(`Strong opportunity in ${clusterName}.`);
  } else if (scores.opportunityScore >= 50) {
    parts.push(`Moderate opportunity in ${clusterName}.`);
  } else {
    parts.push(`Challenging market in ${clusterName}.`);
  }

  // Highlight top strengths
  const dimensions = [
    { name: 'Competition gap', score: scores.competitionGap },
    { name: 'Market demand', score: scores.marketDemand },
    { name: 'Revenue potential', score: scores.revenuePotential },
    { name: 'Trend momentum', score: scores.trendMomentum },
    { name: 'Execution feasibility', score: scores.executionFeasibility },
  ].sort((a, b) => b.score - a.score);

  const strengths = dimensions.filter(d => d.score >= 60).slice(0, 2);
  if (strengths.length > 0) {
    parts.push(`Strengths: ${strengths.map(s => `${s.name} (${s.score})`).join(', ')}.`);
  }

  // Note weaknesses
  const weaknesses = dimensions.filter(d => d.score < 40);
  if (weaknesses.length > 0) {
    parts.push(`Watch: ${weaknesses.map(w => w.name).join(', ')}.`);
  }

  return parts.join(' ');
}

// POST /api/app-ideas/analyze/score - Score clusters
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    // Route to appropriate handler based on action
    switch (action) {
      case 'score':
        return handleScoreClusters(body, apiKey);
      case 'analyze':
        return handleAnalyze(body, apiKey);
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "score" or "analyze".' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[POST /api/app-ideas/analyze] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle cluster scoring request
 */
async function handleScoreClusters(
  body: ScoreClustersRequest & { action: string; category?: string; country?: string },
  apiKey: string
) {
  const { clusters, category = 'productivity', country = 'us' } = body;

  if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
    return NextResponse.json(
      { error: 'Clusters array required' },
      { status: 400 }
    );
  }

  const clusterScores: ClusterScore[] = [];

  for (const cluster of clusters) {
    try {
      const score = await scoreCluster(cluster, category, country);
      clusterScores.push(score);
    } catch (error) {
      console.error(`Error scoring cluster ${cluster.name}:`, error);
      // Add a partial score on error
      clusterScores.push({
        clusterId: cluster.id,
        clusterName: cluster.name,
        keywords: cluster.keywords,
        opportunityScore: 0,
        competitionGap: 0,
        marketDemand: 0,
        revenuePotential: 0,
        trendMomentum: 0,
        executionFeasibility: 0,
        reasoning: 'Scoring failed - please retry',
      });
    }
  }

  // Sort by opportunity score
  clusterScores.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return NextResponse.json({
    success: true,
    data: {
      clusterScores,
    },
  });
}

/**
 * Handle gap analysis and recommendation request
 */
async function handleAnalyze(
  body: AnalyzeRequest & { action: string; country?: string },
  apiKey: string
) {
  const { clusterScores, topN = 3, country = 'us' } = body;

  if (!clusterScores || !Array.isArray(clusterScores) || clusterScores.length === 0) {
    return NextResponse.json(
      { error: 'Cluster scores array required' },
      { status: 400 }
    );
  }

  // Step 1: Gap analysis for top clusters
  let gapAnalyses: GapAnalysis[];
  try {
    gapAnalyses = await analyzeTopClusters(clusterScores, country, apiKey, topN);
  } catch (error) {
    console.error('Gap analysis failed:', error);
    return NextResponse.json(
      { error: 'Gap analysis failed. Please try again.' },
      { status: 500 }
    );
  }

  // Step 2: Generate recommendations
  let recommendations: Recommendation[];
  try {
    // Get the cluster scores that have gap analyses
    const analyzedClusterIds = new Set(gapAnalyses.map(g => g.clusterId));
    const scoredClustersWithGaps = clusterScores.filter(c =>
      analyzedClusterIds.has(c.clusterId)
    );

    recommendations = await generateRecommendations(
      scoredClustersWithGaps,
      gapAnalyses,
      apiKey
    );
  } catch (error) {
    console.error('Recommendation generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      gapAnalyses,
      recommendations,
    },
  });
}
