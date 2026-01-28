import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  supabase,
  getProjects,
  getProjectsByCategory,
  createProject,
  CreateProjectInput,
} from '@/lib/supabase';

// GET /api/projects - Fetch all projects or single project by id query param
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('id');
  const groupByCategory = searchParams.get('groupByCategory') === 'true';

  try {
    // If id is provided, fetch single project (workaround for dynamic route issue)
    if (projectId) {
      const { data, error } = await supabase
        .from('app_projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) {
        console.error('Error fetching project:', error);
        return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      return NextResponse.json({ project: data });
    }

    // Otherwise fetch all projects
    if (groupByCategory) {
      const grouped = await getProjectsByCategory();
      return NextResponse.json({ projects: grouped, grouped: true });
    } else {
      const projects = await getProjects();
      return NextResponse.json({ projects, grouped: false });
    }
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// PUT /api/projects?id=xxx - Update a project
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('id');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.reviews !== undefined) {
      updates.reviews = body.reviews;
      updates.review_count = body.reviews.length;
    }
    if (body.review_stats !== undefined) {
      updates.review_stats = body.review_stats;
    }
    if (body.ai_analysis !== undefined) {
      updates.ai_analysis = body.ai_analysis;
      updates.analysis_date = new Date().toISOString();
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    const { data, error } = await supabase
      .from('app_projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({ project: data, success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects?id=xxx - Delete a project
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('id');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from('app_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input: CreateProjectInput = {
      app: body.app,
      reviews: body.reviews || [],
      reviewStats: body.reviewStats || null,
      scrapeSettings: body.scrapeSettings,
      aiAnalysis: body.aiAnalysis,
      country: body.country || 'us',
      notes: body.notes,
    };

    if (!input.app || !input.app.id) {
      return NextResponse.json({ error: 'App data is required' }, { status: 400 });
    }

    const project = await createProject(input);

    if (!project) {
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return NextResponse.json({ project, success: true });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
