import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getLinkedCompetitors,
  addLinkedCompetitor,
  addLinkedCompetitors,
  LinkedCompetitor,
} from '@/lib/supabase';

// GET /api/projects/[id]/competitors - Get linked competitors
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    const competitors = await getLinkedCompetitors(projectId);
    return NextResponse.json({ competitors });
  } catch (err) {
    console.error('Error fetching competitors:', err);
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500 });
  }
}

// POST /api/projects/[id]/competitors - Add competitor(s)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: projectId } = await params;
    console.log('[POST /api/projects/[id]/competitors] projectId:', projectId);

    const body = await request.json();
    console.log('[POST /api/projects/[id]/competitors] body:', JSON.stringify(body, null, 2));

    // Check if adding multiple competitors
    if (body.competitors && Array.isArray(body.competitors)) {
      const competitors: LinkedCompetitor[] = body.competitors.map((c: {
        app_store_id: string;
        name: string;
        icon_url?: string;
        rating?: number;
        reviews?: number;
      }) => ({
        app_store_id: c.app_store_id,
        name: c.name,
        icon_url: c.icon_url,
        rating: c.rating,
        reviews: c.reviews,
      }));

      console.log('[POST /api/projects/[id]/competitors] Adding multiple competitors:', competitors.length);
      const result = await addLinkedCompetitors(projectId, competitors);

      if (!result) {
        console.error('[POST /api/projects/[id]/competitors] addLinkedCompetitors returned null');
        return NextResponse.json({
          error: 'Failed to add competitors. The linked_competitors column may not exist - run the database migration.'
        }, { status: 500 });
      }

      return NextResponse.json({ competitors: result, success: true });
    }

    // Single competitor
    if (!body.app_store_id || !body.name) {
      console.error('[POST /api/projects/[id]/competitors] Missing required fields:', { app_store_id: body.app_store_id, name: body.name });
      return NextResponse.json({ error: 'app_store_id and name are required' }, { status: 400 });
    }

    const competitor: LinkedCompetitor = {
      app_store_id: body.app_store_id,
      name: body.name,
      icon_url: body.icon_url,
      rating: body.rating,
      reviews: body.reviews,
    };

    console.log('[POST /api/projects/[id]/competitors] Adding single competitor:', competitor.name);
    const result = await addLinkedCompetitor(projectId, competitor);

    if (!result) {
      console.error('[POST /api/projects/[id]/competitors] addLinkedCompetitor returned null for project:', projectId);
      return NextResponse.json({
        error: 'Failed to add competitor. The linked_competitors column may not exist - run the database migration.'
      }, { status: 500 });
    }

    console.log('[POST /api/projects/[id]/competitors] Successfully added competitor, total:', result.length);
    return NextResponse.json({ competitors: result, success: true });
  } catch (err) {
    console.error('[POST /api/projects/[id]/competitors] Exception:', err);
    return NextResponse.json({ error: `Failed to add competitor: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 500 });
  }
}
