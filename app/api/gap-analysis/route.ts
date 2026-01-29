import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSessions,
  createGapSession,
  deleteGapSession,
} from '@/lib/supabase';

// GET /api/gap-analysis - Fetch all gap analysis sessions
export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessions = await getGapSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[GET /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/gap-analysis - Create a new gap analysis session
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, category, countries, appsPerCountry } = body as {
      name?: string;
      category: string;
      countries: string[];
      appsPerCountry?: number;
    };

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    if (!countries || countries.length < 2) {
      return NextResponse.json({ error: 'At least 2 countries are required' }, { status: 400 });
    }

    if (countries.length > 15) {
      return NextResponse.json({ error: 'Maximum 15 countries allowed' }, { status: 400 });
    }

    const session = await createGapSession(
      name || null,
      category,
      countries,
      appsPerCountry || 50
    );

    if (!session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ session, success: true }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

// DELETE /api/gap-analysis?id= - Delete a session via query param
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  try {
    const success = await deleteGapSession(sessionId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/gap-analysis] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
