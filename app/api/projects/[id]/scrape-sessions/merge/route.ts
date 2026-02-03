import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { getProject, updateProjectReviews, type Review, type ReviewStats, type MergeStrategy } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Generate content-based hash for deduplication
async function generateReviewHash(review: Review): Promise<string> {
  const content = `${review.author}:${review.content.slice(0, 100)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// POST /api/projects/[id]/scrape-sessions/merge - Merge multiple sessions
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    const body = await request.json();
    const { session_ids, strategy = 'keep_newest', update_project_reviews = true } = body as {
      session_ids: string[];
      strategy?: MergeStrategy;
      update_project_reviews?: boolean;
    };

    if (!session_ids || session_ids.length < 1) {
      return NextResponse.json({ error: 'At least one session_id required' }, { status: 400 });
    }

    // Verify project exists
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch all sessions
    const { data: sessions, error: fetchError } = await supabase
      .from('review_scrape_sessions')
      .select('*')
      .in('id', session_ids)
      .eq('project_id', projectId);

    if (fetchError || !sessions) {
      console.error('[Merge] Error fetching sessions:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No sessions found' }, { status: 404 });
    }

    // Collect all reviews from sessions
    const allReviews: Review[] = [];
    for (const session of sessions) {
      if (session.reviews && Array.isArray(session.reviews)) {
        allReviews.push(...(session.reviews as Review[]));
      }
    }

    // Deduplicate reviews based on content hash
    const reviewsByHash = new Map<string, Review[]>();

    for (const review of allReviews) {
      const hash = await generateReviewHash(review);
      if (!reviewsByHash.has(hash)) {
        reviewsByHash.set(hash, []);
      }
      reviewsByHash.get(hash)!.push(review);
    }

    // Apply merge strategy to select which review to keep from duplicates
    const mergedReviews: Review[] = [];

    for (const [, duplicates] of reviewsByHash) {
      if (duplicates.length === 1) {
        mergedReviews.push(duplicates[0]);
        continue;
      }

      let selected: Review;
      switch (strategy) {
        case 'keep_newest':
          // Sort by date descending, pick first
          selected = duplicates.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
          })[0];
          break;

        case 'keep_oldest':
          // Sort by date ascending, pick first
          selected = duplicates.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : Infinity;
            const dateB = b.date ? new Date(b.date).getTime() : Infinity;
            return dateA - dateB;
          })[0];
          break;

        case 'keep_highest_rating':
          // Sort by rating descending, pick first
          selected = duplicates.sort((a, b) => {
            const ratingA = a.rating ?? 0;
            const ratingB = b.rating ?? 0;
            return ratingB - ratingA;
          })[0];
          break;

        case 'keep_all':
        default:
          // Keep all (no deduplication - just use first)
          selected = duplicates[0];
          break;
      }

      mergedReviews.push(selected);
    }

    // Calculate merged stats
    const validRatings = mergedReviews
      .map(r => r.rating)
      .filter((r): r is number => r !== null);
    const avgRating = validRatings.length > 0
      ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length
      : 0;

    const ratingDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const review of mergedReviews) {
      if (review.rating !== null) {
        ratingDistribution[String(review.rating)] = (ratingDistribution[String(review.rating)] || 0) + 1;
      }
    }

    // Get unique countries
    const countries = [...new Set(mergedReviews.map(r => r.country).filter(Boolean))] as string[];

    const mergedStats: ReviewStats = {
      total: mergedReviews.length,
      average_rating: Math.round(avgRating * 10) / 10,
      rating_distribution: ratingDistribution,
      countries_scraped: countries,
    };

    // Update project reviews if requested
    if (update_project_reviews) {
      const success = await updateProjectReviews(projectId, mergedReviews, mergedStats);
      if (!success) {
        return NextResponse.json({ error: 'Failed to update project reviews' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      merged: {
        total_before: allReviews.length,
        total_after: mergedReviews.length,
        duplicates_removed: allReviews.length - mergedReviews.length,
        stats: mergedStats,
      },
      project_updated: update_project_reviews,
    });
  } catch (error) {
    console.error('[Merge] Error:', error);
    return NextResponse.json({ error: 'Failed to merge sessions' }, { status: 500 });
  }
}
