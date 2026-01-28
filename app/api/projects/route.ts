import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getProjects,
  getProjectsByCategory,
  createProject,
  CreateProjectInput,
} from '@/lib/supabase';

// GET /api/projects - Fetch all projects
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const groupByCategory = searchParams.get('groupByCategory') === 'true';

  try {
    if (groupByCategory) {
      const grouped = await getProjectsByCategory();
      return NextResponse.json({ projects: grouped, grouped: true });
    } else {
      const projects = await getProjects();
      return NextResponse.json({ projects, grouped: false });
    }
  } catch {
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
