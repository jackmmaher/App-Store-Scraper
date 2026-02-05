import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getProject } from '@/lib/supabase';
import { generateFeatureMatrix } from '@/lib/pain-points/registry';
import type { MergedAnalysisResult } from '@/lib/analysis/chunk-merger';
import type { FeatureMatrix, FeatureMatrixEntry } from '@/lib/pain-points/types';

// ============================================================================
// Helpers
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse the project's ai_analysis field as a MergedAnalysisResult.
 */
function parseBatchAnalysis(
  aiAnalysis: string | null
): MergedAnalysisResult | null {
  if (!aiAnalysis) return null;
  try {
    return JSON.parse(aiAnalysis) as MergedAnalysisResult;
  } catch {
    return null;
  }
}

/**
 * Extract competitor names from linked_competitors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCompetitorNames(project: any): string[] {
  const competitors = project.linked_competitors || [];
  if (!Array.isArray(competitors)) return [];
  return competitors
    .map((c: { name?: string }) => c.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
}

// ============================================================================
// GET /api/projects/[id]/feature-matrix
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid project ID format' },
      { status: 400 }
    );
  }

  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const batchAnalysis = parseBatchAnalysis(project.ai_analysis);
    const competitorNames = getCompetitorNames(project);
    const matrix = generateFeatureMatrix(batchAnalysis, competitorNames);

    return NextResponse.json({ matrix });
  } catch (err) {
    console.error('[GET /api/projects/[id]/feature-matrix] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate feature matrix: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/projects/[id]/feature-matrix
// ============================================================================

/**
 * AI-enhanced feature matrix generation.
 * Uses Claude to analyze competitor features more deeply based on
 * pain points and feature requests from the batch analysis.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid project ID format' },
      { status: 400 }
    );
  }

  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const batchAnalysis = parseBatchAnalysis(project.ai_analysis);
    const competitorNames = getCompetitorNames(project);

    if (!batchAnalysis) {
      return NextResponse.json(
        { error: 'No analysis data available. Run review analysis first.' },
        { status: 400 }
      );
    }

    if (competitorNames.length === 0) {
      return NextResponse.json(
        { error: 'No linked competitors. Add competitors to the project first.' },
        { status: 400 }
      );
    }

    // Build context for Claude
    const baseMatrix = generateFeatureMatrix(batchAnalysis, competitorNames);
    const painPoints = batchAnalysis.painPoints || [];
    const featureRequests = batchAnalysis.featureRequests || [];

    const prompt = buildEnhancementPrompt(
      project.app_name,
      competitorNames,
      baseMatrix,
      painPoints,
      featureRequests
    );

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fall back to basic matrix if no API key
      return NextResponse.json({
        matrix: baseMatrix,
        enhanced: false,
        message: 'Claude API key not configured. Returning basic matrix.',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

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
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[feature-matrix] Claude API error:', errorText);
        // Fall back to basic matrix
        return NextResponse.json({
          matrix: baseMatrix,
          enhanced: false,
          message: 'AI enhancement failed. Returning basic matrix.',
        });
      }

      const result = await response.json();
      const content = result.content?.[0]?.text;

      if (!content) {
        return NextResponse.json({
          matrix: baseMatrix,
          enhanced: false,
          message: 'Empty AI response. Returning basic matrix.',
        });
      }

      // Parse the AI-enhanced matrix from the response
      const enhancedMatrix = parseEnhancedMatrix(
        content,
        competitorNames,
        baseMatrix
      );

      return NextResponse.json({
        matrix: enhancedMatrix,
        enhanced: true,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);

      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        console.error('[feature-matrix] Claude API timeout');
      } else {
        console.error('[feature-matrix] Claude API fetch error:', fetchErr);
      }

      // Fall back to basic matrix
      return NextResponse.json({
        matrix: baseMatrix,
        enhanced: false,
        message: 'AI enhancement timed out. Returning basic matrix.',
      });
    }
  } catch (err) {
    console.error('[POST /api/projects/[id]/feature-matrix] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to enhance feature matrix: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================================
// Prompt builder
// ============================================================================

function buildEnhancementPrompt(
  appName: string,
  competitors: string[],
  baseMatrix: FeatureMatrix,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  painPoints: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureRequests: any[]
): string {
  const existingFeatures = baseMatrix.features
    .map((f) => `- ${f.name} (demand: ${f.userDemand})`)
    .join('\n');

  const painPointSummary = painPoints
    .slice(0, 15)
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pp: any) =>
        `- ${pp.title || pp.issue}: ${pp.description || pp.details || ''}`
    )
    .join('\n');

  const featureRequestSummary = featureRequests
    .slice(0, 15)
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fr: any) =>
        `- ${fr.title || fr.feature || fr.name}: ${fr.description || fr.details || ''}`
    )
    .join('\n');

  return `Analyze the competitive feature landscape for "${appName}" against these competitors: ${competitors.join(', ')}.

Based on the following user pain points and feature requests from reviews, create an enhanced competitive feature matrix.

EXISTING FEATURES IDENTIFIED:
${existingFeatures || '(none identified yet)'}

USER PAIN POINTS:
${painPointSummary || '(none)'}

FEATURE REQUESTS:
${featureRequestSummary || '(none)'}

For each feature, determine which competitors likely have it ('has'), partially have it ('partial'), or are missing it ('missing'). Also assess user demand level ('high', 'medium', 'low') and whether it represents a competitive opportunity.

Respond ONLY with a JSON array of feature objects in this exact format:
[
  {
    "name": "Feature Name",
    "competitors": { "CompetitorA": "has", "CompetitorB": "missing" },
    "userDemand": "high",
    "opportunity": true
  }
]

Include 5-15 features. Be specific and actionable. Focus on features that represent real competitive differentiation opportunities.`;
}

// ============================================================================
// Parse AI response
// ============================================================================

function parseEnhancedMatrix(
  aiResponse: string,
  competitors: string[],
  fallback: FeatureMatrix
): FeatureMatrix {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = aiResponse;
    const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find a JSON array in the text
    const arrayStart = jsonStr.indexOf('[');
    const arrayEnd = jsonStr.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1) {
      jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback;
    }

    const features: FeatureMatrixEntry[] = parsed
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && 'name' in item
      )
      .map((item: Record<string, unknown>) => {
        const competitorStatus: Record<string, 'has' | 'partial' | 'missing'> = {};

        if (typeof item.competitors === 'object' && item.competitors !== null) {
          const compMap = item.competitors as Record<string, string>;
          for (const comp of competitors) {
            const status = compMap[comp];
            if (status === 'has' || status === 'partial' || status === 'missing') {
              competitorStatus[comp] = status;
            } else {
              competitorStatus[comp] = 'missing';
            }
          }
        }

        const userDemand =
          item.userDemand === 'high' || item.userDemand === 'medium' || item.userDemand === 'low'
            ? (item.userDemand as 'high' | 'medium' | 'low')
            : 'medium';

        return {
          name: String(item.name || 'Unknown'),
          competitors: competitorStatus,
          userDemand,
          opportunity: Boolean(item.opportunity),
        };
      });

    return {
      features,
      competitors,
    };
  } catch (err) {
    console.error('[feature-matrix] Failed to parse AI response:', err);
    return fallback;
  }
}
