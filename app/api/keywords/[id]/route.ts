import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/keywords/[id] - Get keyword details with rankings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: keywordId } = await params;

  if (!keywordId) {
    return NextResponse.json({ error: 'Keyword ID is required' }, { status: 400 });
  }

  try {
    // Fetch keyword
    const { data: keyword, error: keywordError } = await supabase
      .from('keywords')
      .select('*')
      .eq('id', keywordId)
      .single();

    if (keywordError || !keyword) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
    }

    // Fetch rankings for this keyword
    const { data: rankings, error: rankingsError } = await supabase
      .from('keyword_rankings')
      .select('*')
      .eq('keyword_id', keywordId)
      .order('rank_position', { ascending: true });

    if (rankingsError) {
      console.error('Error fetching rankings:', rankingsError);
    }

    return NextResponse.json({
      success: true,
      data: {
        keyword,
        rankings: rankings || [],
      },
    });
  } catch (error) {
    console.error('Error getting keyword details:', error);
    return NextResponse.json(
      { error: 'Failed to get keyword details' },
      { status: 500 }
    );
  }
}
