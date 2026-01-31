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
    const body = await request.json();

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

      const result = await addLinkedCompetitors(projectId, competitors);

      if (!result) {
        return NextResponse.json({ error: 'Failed to add competitors' }, { status: 500 });
      }

      return NextResponse.json({ competitors: result, success: true });
    }

    // Single competitor
    if (!body.app_store_id || !body.name) {
      return NextResponse.json({ error: 'app_store_id and name are required' }, { status: 400 });
    }

    const competitor: LinkedCompetitor = {
      app_store_id: body.app_store_id,
      name: body.name,
      icon_url: body.icon_url,
      rating: body.rating,
      reviews: body.reviews,
    };

    const result = await addLinkedCompetitor(projectId, competitor);

    if (!result) {
      console.error('[POST /api/projects/[id]/competitors] Failed to add competitor for project:', projectId);
      return NextResponse.json({ error: 'Failed to add competitor. Check if database migration was run.' }, { status: 500 });
    }

    return NextResponse.json({ competitors: result, success: true });
  } catch (err) {
    console.error('Error adding competitor:', err);
    return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 });
  }
}
