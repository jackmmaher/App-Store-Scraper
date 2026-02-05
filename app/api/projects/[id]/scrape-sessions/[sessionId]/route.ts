import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import type { ReviewScrapeSession } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const CRAWL_SERVICE_URL = process.env.CRAWL_SERVICE_URL || 'http://localhost:8000';

export const maxDuration = 60; // Reduced for Vercel Free tier - scraping runs async in Python

interface RouteParams {
  params: Promise<{ id: string; sessionId: string }>;
}

// GET /api/projects/[id]/scrape-sessions/[sessionId] - Get session details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const { data: session, error } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      console.error('[GET session] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[GET session] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

// POST /api/projects/[id]/scrape-sessions/[sessionId] - Start scraping or cancel
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const body = await request.json();
    const { action } = body as { action: 'start' | 'cancel' };

    // Get current session with project ownership check
    const { data: session, error: fetchError } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      // Cancel the session
      const { error } = await supabase
        .from('review_scrape_sessions')
        .update({
          status: 'cancelled',
          progress: { message: 'Cancelled by user' },
        })
        .eq('id', sessionId);

      if (error) {
        return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (action === 'start') {
      if (session.status !== 'pending') {
        return NextResponse.json({ error: 'Session already started or completed' }, { status: 400 });
      }

      // Check crawler availability before firing
      try {
        const healthCheck = await fetch(`${CRAWL_SERVICE_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!healthCheck.ok) {
          throw new Error('Crawler not responding');
        }
      } catch {
        return NextResponse.json(
          { error: 'Crawler service not available. Make sure you started the app with: npm run dev:full' },
          { status: 503 }
        );
      }

      // Trigger async scrape - Python crawler updates Supabase directly when done
      try {
        const crawlResponse = await fetch(`${CRAWL_SERVICE_URL}/crawl/app-store/reviews-async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.CRAWL_API_KEY || '',
          },
          body: JSON.stringify({
            session_id: session.id,
            app_id: session.app_store_id,
            country: session.country,
            max_reviews: session.target_reviews,
          }),
        });
        if (!crawlResponse.ok) {
          console.error('[Async scrape trigger] Crawl service error:', crawlResponse.status);
        }
      } catch (err) {
        console.error('[Async scrape trigger] Error:', err);
      }

      return NextResponse.json({ success: true, status: 'in_progress' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[POST session action] Error:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/scrape-sessions/[sessionId] - Delete session
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, sessionId } = await params;

  try {
    const { data, error } = await supabase
      .from('review_scrape_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .select();

    if (error) {
      console.error('[DELETE session] Error:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE session] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
