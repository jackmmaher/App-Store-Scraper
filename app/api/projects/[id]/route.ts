import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getProject, updateProject, deleteProject } from '@/lib/supabase';

// GET /api/projects/[id] - Fetch a single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  console.log('[API] GET /api/projects/[id] called with id:', id);

  try {
    const result = await getProject(id);

    if (result.error) {
      console.error('[API] Supabase error:', result.error);
      return NextResponse.json({ error: `Database error: ${result.error}` }, { status: 500 });
    }

    if (!result.data) {
      console.log('[API] No data returned, returning 404');
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    console.log('[API] Returning project:', result.data.app_name);
    return NextResponse.json({ project: result.data });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json({ error: `Failed to fetch project: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}

// PUT /api/projects/[id] - Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const updates: Parameters<typeof updateProject>[1] = {};

    if (body.reviews !== undefined) {
      updates.reviews = body.reviews;
    }
    if (body.review_stats !== undefined) {
      updates.review_stats = body.review_stats;
    }
    if (body.ai_analysis !== undefined) {
      updates.ai_analysis = body.ai_analysis;
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    const project = await updateProject(id, updates);

    if (!project) {
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({ project, success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const success = await deleteProject(id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
