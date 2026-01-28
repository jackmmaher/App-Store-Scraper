import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getProjects,
  getProjectsByCategory,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  CreateProjectInput,
} from '@/lib/supabase';

// GET /api/projects - Fetch all projects OR single project via ?id= query param
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('id');
  const groupByCategory = searchParams.get('groupByCategory') === 'true';

  try {
    // If ?id= is provided, fetch single project (fallback for dynamic route issues)
    if (projectId) {
      console.log('[GET /api/projects] Fetching single project via query param:', projectId);
      const project = await getProject(projectId);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      return NextResponse.json({ project });
    }

    // Otherwise fetch all projects
    if (groupByCategory) {
      const grouped = await getProjectsByCategory();
      return NextResponse.json({ projects: grouped, grouped: true });
    } else {
      const projects = await getProjects();
      return NextResponse.json({ projects, grouped: false });
    }
  } catch (err) {
    console.error('[GET /api/projects] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
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
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

// PUT /api/projects?id= - Update a project (query param fallback for Vercel)
export async function PUT(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('id');
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updates: Parameters<typeof updateProject>[1] = {};

    if (body.reviews !== undefined) updates.reviews = body.reviews;
    if (body.review_stats !== undefined) updates.review_stats = body.review_stats;
    if (body.ai_analysis !== undefined) updates.ai_analysis = body.ai_analysis;
    if (body.notes !== undefined) updates.notes = body.notes;

    const project = await updateProject(projectId, updates);

    if (!project) {
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({ project, success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects?id= - Delete a project (query param fallback for Vercel)
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('id');
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    const success = await deleteProject(projectId);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
