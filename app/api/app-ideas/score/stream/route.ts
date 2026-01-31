import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { scoreOpportunity } from '@/lib/opportunity/scorer';
import { updateAppIdeaSession } from '@/lib/supabase';
import { Cluster, ClusterScore } from '@/lib/app-ideas/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT_MS = 300;

interface ScoreStreamRequest {
  clusters: Cluster[];
  sessionId?: string;
  category?: string;
  country?: string;
}

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

  if (scores.opportunityScore >= 70) {
    parts.push(`Strong opportunity in ${clusterName}.`);
  } else if (scores.opportunityScore >= 50) {
    parts.push(`Moderate opportunity in ${clusterName}.`);
  } else {
    parts.push(`Challenging market in ${clusterName}.`);
  }

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

  const weaknesses = dimensions.filter(d => d.score < 40);
  if (weaknesses.length > 0) {
    parts.push(`Watch: ${weaknesses.map(w => w.name).join(', ')}.`);
  }

  return parts.join(' ');
}

// POST /api/app-ideas/score/stream - Stream cluster scoring progress via SSE
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: ScoreStreamRequest = await request.json();
  const { clusters, sessionId, category = 'productivity', country = 'us' } = body;

  if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
    return new Response(JSON.stringify({ error: 'Clusters array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const clusterScores: ClusterScore[] = [];

  // Calculate total keywords to score (3 per cluster)
  const keywordsPerCluster = 3;
  const totalKeywords = clusters.length * keywordsPerCluster;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      try {
        // Send initial state
        sendEvent({
          type: 'start',
          totalClusters: clusters.length,
          totalKeywords,
        });

        let keywordIndex = 0;

        for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
          const cluster = clusters[clusterIdx];
          const keywordsToScore = cluster.keywords.slice(0, keywordsPerCluster);
          const scores = {
            opportunityScore: 0,
            competitionGap: 0,
            marketDemand: 0,
            revenuePotential: 0,
            trendMomentum: 0,
            executionFeasibility: 0,
          };

          let scoredCount = 0;
          const keywordScores: Array<{
            keyword: string;
            opportunityScore: number;
            competitionGap: number;
            marketDemand: number;
            revenuePotential: number;
            trendMomentum: number;
            executionFeasibility: number;
          }> = [];

          // Send cluster start event
          sendEvent({
            type: 'cluster_start',
            clusterIndex: clusterIdx,
            clusterName: cluster.name,
            keywordsToScore: keywordsToScore.length,
          });

          for (const keyword of keywordsToScore) {
            try {
              // Send keyword start event
              sendEvent({
                type: 'keyword_start',
                clusterIndex: clusterIdx,
                keywordIndex,
                keyword,
                totalKeywords,
              });

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

              keywordIndex++;

              // Send keyword complete event
              sendEvent({
                type: 'keyword_complete',
                clusterIndex: clusterIdx,
                keywordIndex,
                keyword,
                score: result.opportunity_score,
                totalKeywords,
                progress: keywordIndex / totalKeywords,
              });

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
            } catch (error) {
              console.error(`Error scoring keyword ${keyword}:`, error);
              keywordIndex++;
              sendEvent({
                type: 'keyword_error',
                clusterIndex: clusterIdx,
                keyword,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }

          // Calculate cluster averages
          if (scoredCount > 0) {
            scores.opportunityScore = Math.round(scores.opportunityScore / scoredCount);
            scores.competitionGap = Math.round(scores.competitionGap / scoredCount);
            scores.marketDemand = Math.round(scores.marketDemand / scoredCount);
            scores.revenuePotential = Math.round(scores.revenuePotential / scoredCount);
            scores.trendMomentum = Math.round(scores.trendMomentum / scoredCount);
            scores.executionFeasibility = Math.round(scores.executionFeasibility / scoredCount);
          }

          const reasoning = generateClusterReasoning(scores, cluster.name);

          const clusterScore: ClusterScore = {
            clusterId: cluster.id,
            clusterName: cluster.name,
            keywords: cluster.keywords,
            ...scores,
            reasoning,
            keywordScores,
          };

          clusterScores.push(clusterScore);

          // Send cluster complete event
          sendEvent({
            type: 'cluster_complete',
            clusterIndex: clusterIdx,
            clusterName: cluster.name,
            score: clusterScore,
            progress: (clusterIdx + 1) / clusters.length,
          });
        }

        // Sort by opportunity score
        clusterScores.sort((a, b) => b.opportunityScore - a.opportunityScore);

        // Persist to session if sessionId provided
        if (sessionId) {
          await updateAppIdeaSession(sessionId, {
            status: 'analyzing',
            cluster_scores: clusterScores,
          });
        }

        // Send complete event
        sendEvent({
          type: 'complete',
          clusterScores,
        });

        controller.close();
      } catch (error) {
        console.error('[POST /api/app-ideas/score/stream] Error:', error);
        sendEvent({
          type: 'error',
          message: error instanceof Error ? error.message : 'Scoring failed',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
