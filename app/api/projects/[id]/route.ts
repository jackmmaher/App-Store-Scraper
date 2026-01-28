import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabase, updateProject, deleteProject } from '@/lib/supabase';

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

  try {
    console.log('[GET /api/projects/[id]] Fetching project with id:', id);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.error('[GET /api/projects/[id]] Invalid UUID format:', id);
      return NextResponse.json(
        { error: `Invalid project ID format: ${id}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('app_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[GET /api/projects/[id]] Supabase error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Project not found', code: error.code },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Database error: ${error.message}`, code: error.code },
        { status: 500 }
      );
    }

    if (!data) {
      console.log('[GET /api/projects/[id]] No data returned for id:', id);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    console.log('[GET /api/projects/[id]] Successfully fetched project:', data.app_name);
    return NextResponse.json({ project: data });
  } catch (err) {
    console.error('[GET /api/projects/[id]] Exception:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch project: ${message}` },
      { status: 500 }
    );
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
  } catch {
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
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
