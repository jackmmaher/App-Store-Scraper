import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getOrCreateBlueprint,
  getBlueprint,
  getBlueprintAttachments,
  updateBlueprintSection,
  updateBlueprintSectionStatus,
  deleteBlueprint,
  getProject,
  type BlueprintSection,
  type BlueprintSectionStatus,
  type ProjectBlueprint,
} from '@/lib/supabase';

// Auto-recover stuck 'generating' statuses (older than 5 minutes)
async function recoverStuckGenerating(blueprint: ProjectBlueprint): Promise<ProjectBlueprint> {
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const updatedAt = new Date(blueprint.updated_at).getTime();

  // If updated recently, don't touch it
  if (now - updatedAt < STUCK_THRESHOLD_MS) {
    return blueprint;
  }

  // Check ALL 9 sections for stuck 'generating' status
  const sectionsToCheck: Array<{ key: keyof ProjectBlueprint; section: BlueprintSection }> = [
    { key: 'pareto_status', section: 'pareto' },
    { key: 'app_identity_status', section: 'identity' },
    { key: 'design_system_status', section: 'design_system' },
    { key: 'ui_wireframes_status', section: 'wireframes' },
    { key: 'tech_stack_status', section: 'tech_stack' },
    { key: 'xcode_setup_status', section: 'xcode_setup' },
    { key: 'prd_status', section: 'prd' },
    { key: 'aso_status', section: 'aso' },
    { key: 'build_manifest_status', section: 'manifest' },
  ];

  let needsRefresh = false;
  for (const { key, section } of sectionsToCheck) {
    if (blueprint[key] === 'generating') {
      console.log(`[Blueprint] Auto-recovering stuck '${section}' status`);
      await updateBlueprintSectionStatus(blueprint.id, section, 'error');
      needsRefresh = true;
    }
  }

  if (needsRefresh) {
    const refreshed = await getBlueprint(blueprint.id);
    return refreshed || blueprint;
  }

  return blueprint;
}

// GET /api/blueprint?projectId=xxx - Get or create blueprint for project
// GET /api/blueprint?id=xxx - Get blueprint by ID
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const blueprintId = searchParams.get('id');

  try {
    if (blueprintId) {
      // Fetch by blueprint ID
      let blueprint = await getBlueprint(blueprintId);
      if (!blueprint) {
        return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
      }
      // Auto-recover stuck 'generating' statuses
      blueprint = await recoverStuckGenerating(blueprint);
      // Fetch attachments
      const attachments = await getBlueprintAttachments(blueprintId);
      return NextResponse.json({ blueprint, attachments });
    }

    if (projectId) {
      // Get or create blueprint for project
      let blueprint = await getOrCreateBlueprint(projectId);
      if (!blueprint) {
        return NextResponse.json({ error: 'Failed to get or create blueprint' }, { status: 500 });
      }
      // Auto-recover stuck 'generating' statuses
      blueprint = await recoverStuckGenerating(blueprint);

      // Fetch project notes for the notes section
      const project = await getProject(projectId);
      const projectNotes = project?.notes || null;

      return NextResponse.json({ blueprint, projectNotes });
    }

    return NextResponse.json({ error: 'projectId or id required' }, { status: 400 });
  } catch (error) {
    console.error('[GET /api/blueprint] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch blueprint' }, { status: 500 });
  }
}

// PUT /api/blueprint?id=xxx - Update blueprint section
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const blueprintId = request.nextUrl.searchParams.get('id');
  if (!blueprintId) {
    return NextResponse.json({ error: 'Blueprint ID required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { section, content, status } = body as {
      section: BlueprintSection;
      content: string;
      status?: BlueprintSectionStatus;
    };

    if (!section || content === undefined) {
      return NextResponse.json({ error: 'section and content required' }, { status: 400 });
    }

    // All 9 blueprint sections
    const validSections: BlueprintSection[] = ['pareto', 'identity', 'design_system', 'wireframes', 'tech_stack', 'xcode_setup', 'prd', 'aso', 'manifest'];
    if (!validSections.includes(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    const blueprint = await updateBlueprintSection(blueprintId, section, content, status || 'completed');
    if (!blueprint) {
      return NextResponse.json({ error: 'Failed to update blueprint' }, { status: 500 });
    }

    return NextResponse.json({ blueprint, success: true });
  } catch (error) {
    console.error('[PUT /api/blueprint] Error:', error);
    return NextResponse.json({ error: 'Failed to update blueprint' }, { status: 500 });
  }
}

// PATCH /api/blueprint?id=xxx - Update notes snapshot
export async function PATCH(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const blueprintId = request.nextUrl.searchParams.get('id');
  if (!blueprintId) {
    return NextResponse.json({ error: 'Blueprint ID required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action, notes } = body as { action: 'sync_notes'; notes: string | null };

    if (action !== 'sync_notes') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update notes snapshot using raw supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: blueprint, error } = await supabaseAdmin
      .from('project_blueprints')
      .update({
        notes_snapshot: notes,
        notes_snapshot_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', blueprintId)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/blueprint] Error:', error);
      return NextResponse.json({ error: 'Failed to sync notes' }, { status: 500 });
    }

    return NextResponse.json({ blueprint, success: true });
  } catch (error) {
    console.error('[PATCH /api/blueprint] Error:', error);
    return NextResponse.json({ error: 'Failed to sync notes' }, { status: 500 });
  }
}

// DELETE /api/blueprint?id=xxx - Delete blueprint
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const blueprintId = request.nextUrl.searchParams.get('id');
  if (!blueprintId) {
    return NextResponse.json({ error: 'Blueprint ID required' }, { status: 400 });
  }

  try {
    const success = await deleteBlueprint(blueprintId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete blueprint' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/blueprint] Error:', error);
    return NextResponse.json({ error: 'Failed to delete blueprint' }, { status: 500 });
  }
}
