import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getOrCreateBlueprint,
  getBlueprint,
  updateBlueprintSection,
  deleteBlueprint,
  type BlueprintSection,
  type BlueprintSectionStatus,
} from '@/lib/supabase';

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
      const blueprint = await getBlueprint(blueprintId);
      if (!blueprint) {
        return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
      }
      return NextResponse.json({ blueprint });
    }

    if (projectId) {
      // Get or create blueprint for project
      const blueprint = await getOrCreateBlueprint(projectId);
      if (!blueprint) {
        return NextResponse.json({ error: 'Failed to get or create blueprint' }, { status: 500 });
      }
      return NextResponse.json({ blueprint });
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

    const validSections: BlueprintSection[] = ['pareto', 'wireframes', 'tech_stack', 'prd'];
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
