import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { saveSearch, getSavedSearches, type SearchParams, type AppResult } from '@/lib/supabase';

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searches = await getSavedSearches();
  return NextResponse.json(searches);
}

export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, params, results } = body as {
      name: string | null;
      params: SearchParams;
      results: AppResult[];
    };

    if (!params || !results) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const saved = await saveSearch(name, params, results);
    if (!saved) {
      return NextResponse.json(
        { error: 'Failed to save search' },
        { status: 500 }
      );
    }

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    console.error('Save search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
