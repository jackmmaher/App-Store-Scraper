import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getProject } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { buildPainPointRegistry } from '@/lib/pain-points/registry';
import type { PainPoint, PainPointRegistry } from '@/lib/pain-points/types';
import type { MergedAnalysisResult } from '@/lib/analysis/chunk-merger';
import type { RedditAnalysisResult } from '@/lib/reddit/types';

// ============================================================================
// Helpers
// ============================================================================

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables for admin client');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse the project's ai_analysis field as a MergedAnalysisResult.
 * The ai_analysis is stored as a JSON string.
 */
function parseBatchAnalysis(
  aiAnalysis: string | null
): MergedAnalysisResult | null {
  if (!aiAnalysis) return null;

  try {
    const parsed = JSON.parse(aiAnalysis);
    return parsed as MergedAnalysisResult;
  } catch {
    return null;
  }
}

/**
 * Collect Reddit analyses from linked competitors.
 * Returns the first available analysis result.
 */
async function getRedditAnalysisForProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any
): Promise<RedditAnalysisResult | null> {
  const competitors = project.linked_competitors || [];
  if (!Array.isArray(competitors) || competitors.length === 0) return null;

  // Find the first competitor with a reddit_analysis_id
  for (const comp of competitors) {
    if (comp.reddit_analysis_id) {
      try {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin
          .from('reddit_analyses')
          .select('*')
          .eq('id', comp.reddit_analysis_id)
          .single();

        if (!error && data) {
          return {
            id: data.id,
            competitorId: data.competitor_id,
            searchConfig: data.search_config,
            unmetNeeds: data.unmet_needs || [],
            trends: data.trends,
            sentiment: data.sentiment,
            languagePatterns: data.language_patterns || [],
            topSubreddits: data.top_subreddits || [],
            rawData: data.raw_data,
            createdAt: data.created_at,
          } as RedditAnalysisResult;
        }
      } catch (err) {
        console.error('[pain-points] Error fetching Reddit analysis:', err);
      }
    }
  }

  return null;
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
// GET /api/projects/[id]/pain-points
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

    // Check if we have a stored pain_point_registry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storedRegistry = (project as any).pain_point_registry as PainPointRegistry | null;

    if (storedRegistry && storedRegistry.painPoints) {
      return NextResponse.json({ registry: storedRegistry });
    }

    // Build on-the-fly from batch analysis and Reddit data
    const batchAnalysis = parseBatchAnalysis(project.ai_analysis);
    const redditAnalysis = await getRedditAnalysisForProject(project);
    const competitorNames = getCompetitorNames(project);

    const registry = buildPainPointRegistry(
      id,
      batchAnalysis,
      redditAnalysis,
      competitorNames
    );

    // Store the generated registry for future use
    try {
      const admin = getSupabaseAdmin();
      await admin
        .from('app_projects')
        .update({ pain_point_registry: registry })
        .eq('id', id);
    } catch (storeErr) {
      // Non-fatal: column may not exist yet
      console.warn('[pain-points] Could not store registry:', storeErr);
    }

    return NextResponse.json({ registry });
  } catch (err) {
    console.error('[GET /api/projects/[id]/pain-points] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch pain points: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/projects/[id]/pain-points
// ============================================================================

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
    const body = await request.json();
    const { action } = body;

    if (!action || (action !== 'update' && action !== 'rebuild')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "update" or "rebuild".' },
        { status: 400 }
      );
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const admin = getSupabaseAdmin();

    if (action === 'rebuild') {
      // Regenerate the registry from scratch
      const batchAnalysis = parseBatchAnalysis(project.ai_analysis);
      const redditAnalysis = await getRedditAnalysisForProject(project);
      const competitorNames = getCompetitorNames(project);

      const registry = buildPainPointRegistry(
        id,
        batchAnalysis,
        redditAnalysis,
        competitorNames
      );

      const { error } = await admin
        .from('app_projects')
        .update({ pain_point_registry: registry })
        .eq('id', id);

      if (error) {
        console.error('[pain-points] Rebuild store error:', error);
        return NextResponse.json(
          { error: `Failed to store rebuilt registry: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ registry, rebuilt: true });
    }

    if (action === 'update') {
      const { painPointId, updates } = body as {
        painPointId?: string;
        updates?: Partial<PainPoint>;
        action: string;
      };

      if (!painPointId || typeof painPointId !== 'string') {
        return NextResponse.json(
          { error: 'painPointId is required for update action' },
          { status: 400 }
        );
      }

      if (!updates || typeof updates !== 'object') {
        return NextResponse.json(
          { error: 'updates object is required for update action' },
          { status: 400 }
        );
      }

      // Validate allowed update fields
      const allowedFields = new Set([
        'title',
        'description',
        'category',
        'severity',
        'targetFeature',
        'competitorsAffected',
      ]);
      const updateKeys = Object.keys(updates);
      const invalidKeys = updateKeys.filter((k) => !allowedFields.has(k));
      if (invalidKeys.length > 0) {
        return NextResponse.json(
          { error: `Invalid update fields: ${invalidKeys.join(', ')}` },
          { status: 400 }
        );
      }

      // Get current registry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let registry = (project as any).pain_point_registry as PainPointRegistry | null;

      if (!registry || !registry.painPoints) {
        // Build it first
        const batchAnalysis = parseBatchAnalysis(project.ai_analysis);
        const redditAnalysis = await getRedditAnalysisForProject(project);
        const competitorNames = getCompetitorNames(project);
        registry = buildPainPointRegistry(
          id,
          batchAnalysis,
          redditAnalysis,
          competitorNames
        );
      }

      // Find and update the pain point
      const ppIndex = registry.painPoints.findIndex(
        (pp) => pp.id === painPointId
      );
      if (ppIndex === -1) {
        return NextResponse.json(
          { error: `Pain point not found: ${painPointId}` },
          { status: 404 }
        );
      }

      // Apply updates
      registry.painPoints[ppIndex] = {
        ...registry.painPoints[ppIndex],
        ...updates,
        id: painPointId, // Prevent ID from being changed
      };
      registry.lastUpdated = new Date().toISOString();

      // Store updated registry
      const { error } = await admin
        .from('app_projects')
        .update({ pain_point_registry: registry })
        .eq('id', id);

      if (error) {
        console.error('[pain-points] Update store error:', error);
        return NextResponse.json(
          { error: `Failed to store updated registry: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        registry,
        updated: painPointId,
      });
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/projects/[id]/pain-points] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to update pain points: ${message}` },
      { status: 500 }
    );
  }
}
