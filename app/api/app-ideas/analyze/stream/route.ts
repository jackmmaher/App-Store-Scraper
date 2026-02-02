import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { updateAppIdeaSession } from '@/lib/supabase';
import { ClusterScore, GapAnalysis, Recommendation } from '@/lib/app-ideas/types';
import { analyzeClusterGap } from '@/lib/app-ideas/gap-analysis';
import { generateRecommendation } from '@/lib/app-ideas/recommendation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnalyzeStreamRequest {
  clusterScores: ClusterScore[];
  sessionId?: string;
  country?: string;
  topN?: number;
}

// POST /api/app-ideas/analyze/stream - Stream gap analysis and recommendations via SSE
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: AnalyzeStreamRequest = await request.json();
  const { clusterScores, sessionId, country = 'us', topN = 3 } = body;

  if (!clusterScores || !Array.isArray(clusterScores) || clusterScores.length === 0) {
    return new Response(JSON.stringify({ error: 'Cluster scores array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  // Sort and take top N
  const sortedClusters = [...clusterScores]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, topN);

  // Total phases: gap analysis (1 per cluster) + recommendation (1 per cluster)
  const totalPhases = sortedClusters.length * 2;

  const stream = new ReadableStream({
    async start(controller) {
      // Track if stream has been closed to prevent double-close errors
      let streamClosed = false;

      const sendEvent = (data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch {
          // Controller might be closed
        }
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      try {
        const gapAnalyses: GapAnalysis[] = [];
        const recommendations: Recommendation[] = [];

        // Send initial state
        sendEvent({
          type: 'start',
          totalClusters: sortedClusters.length,
          totalPhases,
          phases: [
            ...sortedClusters.map((c, i) => ({
              id: `gap-${i}`,
              label: `Analyze: ${c.clusterName}`,
              type: 'gap_analysis',
            })),
            ...sortedClusters.map((c, i) => ({
              id: `rec-${i}`,
              label: `Recommend: ${c.clusterName}`,
              type: 'recommendation',
            })),
          ],
        });

        let phaseIndex = 0;

        // Phase 1: Gap Analysis for each cluster
        for (let i = 0; i < sortedClusters.length; i++) {
          const cluster = sortedClusters[i];

          sendEvent({
            type: 'phase_start',
            phaseIndex,
            phaseId: `gap-${i}`,
            phaseType: 'gap_analysis',
            clusterName: cluster.clusterName,
            progress: phaseIndex / totalPhases,
          });

          try {
            const gapAnalysis = await analyzeClusterGap(cluster, country, apiKey);
            gapAnalyses.push(gapAnalysis);

            phaseIndex++;

            sendEvent({
              type: 'phase_complete',
              phaseIndex,
              phaseId: `gap-${i}`,
              phaseType: 'gap_analysis',
              clusterName: cluster.clusterName,
              appsAnalyzed: gapAnalysis.analyzedApps.length,
              gapsFound: gapAnalysis.gaps.length,
              progress: phaseIndex / totalPhases,
            });
          } catch (error) {
            console.error(`Gap analysis failed for ${cluster.clusterName}:`, error);
            phaseIndex++;

            sendEvent({
              type: 'phase_error',
              phaseIndex,
              phaseId: `gap-${i}`,
              phaseType: 'gap_analysis',
              clusterName: cluster.clusterName,
              error: error instanceof Error ? error.message : 'Unknown error',
              progress: phaseIndex / totalPhases,
            });

            // Add empty gap analysis to continue
            gapAnalyses.push({
              clusterId: cluster.clusterId,
              clusterName: cluster.clusterName,
              existingFeatures: [],
              userComplaints: ['Analysis failed'],
              gaps: [],
              monetizationInsights: 'Unable to analyze',
              analyzedApps: [],
            });
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Phase 2: Generate recommendations
        for (let i = 0; i < sortedClusters.length; i++) {
          const cluster = sortedClusters[i];
          const gapAnalysis = gapAnalyses[i];

          sendEvent({
            type: 'phase_start',
            phaseIndex,
            phaseId: `rec-${i}`,
            phaseType: 'recommendation',
            clusterName: cluster.clusterName,
            progress: phaseIndex / totalPhases,
          });

          try {
            const recommendation = await generateRecommendation(cluster, gapAnalysis, apiKey);
            recommendations.push(recommendation);

            phaseIndex++;

            sendEvent({
              type: 'phase_complete',
              phaseIndex,
              phaseId: `rec-${i}`,
              phaseType: 'recommendation',
              clusterName: cluster.clusterName,
              headline: recommendation.headline,
              progress: phaseIndex / totalPhases,
            });
          } catch (error) {
            console.error(`Recommendation failed for ${cluster.clusterName}:`, error);
            phaseIndex++;

            sendEvent({
              type: 'phase_error',
              phaseIndex,
              phaseId: `rec-${i}`,
              phaseType: 'recommendation',
              clusterName: cluster.clusterName,
              error: error instanceof Error ? error.message : 'Unknown error',
              progress: phaseIndex / totalPhases,
            });

            // Add fallback recommendation
            recommendations.push({
              clusterId: cluster.clusterId,
              clusterName: cluster.clusterName,
              headline: `Build an app for ${cluster.clusterName}`,
              reasoning: ['Recommendation generation failed - please retry'],
              combinedSearchVolume: 'Unknown',
              competitionSummary: `Score: ${cluster.opportunityScore}`,
              primaryGap: 'Analysis needed',
              suggestedMonetization: 'Standard freemium',
              mvpScope: 'Core features first',
              differentiator: 'Focus on user experience',
              opportunityScore: cluster.opportunityScore,
            });
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Sort recommendations by score
        recommendations.sort((a, b) => b.opportunityScore - a.opportunityScore);

        // Persist to session if sessionId provided
        if (sessionId) {
          await updateAppIdeaSession(sessionId, {
            status: 'complete',
            gap_analyses: gapAnalyses,
            recommendations: recommendations,
            completed_at: new Date().toISOString(),
          });
        }

        // Send complete event
        sendEvent({
          type: 'complete',
          gapAnalyses,
          recommendations,
        });

        closeStream();
      } catch (error) {
        console.error('[POST /api/app-ideas/analyze/stream] Error:', error);
        sendEvent({
          type: 'error',
          message: error instanceof Error ? error.message : 'Analysis failed',
        });
        closeStream();
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
