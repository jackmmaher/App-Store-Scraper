import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { getProject, type ReviewScrapeSession, type ReviewScrapeSessionFilter } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/scrape-sessions - List all sessions for a project
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    const { data: sessions, error } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/projects/[id]/scrape-sessions] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('[GET /api/projects/[id]/scrape-sessions] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/projects/[id]/scrape-sessions - Create a new scrape session
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    const body = await request.json();
    const { target_reviews, filters, country = 'us' } = body as {
      target_reviews?: number;
      filters?: ReviewScrapeSessionFilter[];
      country?: string;
    };

    // Get project to verify it exists and get app_store_id
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.app_store_id) {
      return NextResponse.json({ error: 'Project has no app_store_id' }, { status: 400 });
    }

    // Default filters if not provided
    const sessionFilters: ReviewScrapeSessionFilter[] = filters || [
      { sort: 'mostRecent', target: target_reviews || 500 }
    ];

    // Calculate total target
    const totalTarget = sessionFilters.reduce((sum, f) => sum + f.target, 0);

    // Create session
    const { data: session, error } = await supabase
      .from('review_scrape_sessions')
      .insert({
        project_id: projectId,
        app_store_id: project.app_store_id,
        target_reviews: totalTarget,
        filters: sessionFilters,
        country,
        status: 'pending',
        progress: null,
        reviews_collected: 0,
        reviews: [],
        stats: null,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/projects/[id]/scrape-sessions] Error:', error);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects/[id]/scrape-sessions] Error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
