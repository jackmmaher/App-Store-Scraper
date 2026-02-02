import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getLinkedCompetitors, updateLinkedCompetitor, Review } from '@/lib/supabase';
import { getCrawlOrchestrator } from '@/lib/crawl';

// Allow up to 10 minutes for scraping large apps
export const maxDuration = 600;

// POST /api/projects/[id]/competitors/[appId]/scrape - Scrape reviews for a linked competitor
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: projectId, appId } = await params;

    // Verify competitor is linked
    const competitors = await getLinkedCompetitors(projectId);
    const competitor = competitors.find(c => c.app_store_id === appId);

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not linked to project' }, { status: 404 });
    }

    // Check if crawl service is available first
    const orchestrator = getCrawlOrchestrator();
    const isAvailable = await orchestrator.isAvailable();

    if (!isAvailable) {
      return NextResponse.json({
        error: 'Crawl service not available. This feature requires running the app locally with the crawler enabled. Run: npm run dev:full'
      }, { status: 503 });
    }

    // Use orchestrator directly instead of fetching via HTTP
    const scrapeData = await orchestrator.crawlAppReviews({
      app_id: appId,
      country: 'us',
      max_reviews: 500,
    });

    if (!scrapeData) {
      return NextResponse.json({
        error: 'Crawl service returned no data. Make sure the Python crawl service is running.'
      }, { status: 503 });
    }

    // Map ExtendedReview to Review, adding missing fields
    // Note: Missing/invalid ratings are stored as 0 (we can't use null in the Review type)
    // but we validate to avoid storing invalid data
    const reviews: Review[] = (scrapeData.reviews || []).map((r) => {
      // Validate rating - only accept 1-5, default to 0 if invalid
      const rawRating = r.rating;
      let rating = 0;
      if (rawRating !== null && rawRating !== undefined) {
        const numRating = Number(rawRating);
        if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
          rating = numRating;
        }
      }

      return {
        id: r.id,
        title: r.title,
        content: r.content,
        rating,
        author: r.author,
        version: r.version || 'Unknown',
        vote_count: r.helpful_count || 0,
        vote_sum: 0, // vote_sum not available from crawler, don't duplicate vote_count
        country: r.country,
        date: r.date || '',
      };
    });

    if (reviews.length === 0) {
      return NextResponse.json({ error: 'No reviews found' }, { status: 404 });
    }

    // Update the competitor with scraped reviews
    const result = await updateLinkedCompetitor(projectId, appId, {
      scraped_reviews: reviews,
      scraped_at: new Date().toISOString(),
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to save scraped reviews' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reviews_count: reviews.length,
      competitors: result,
    });
  } catch (err) {
    console.error('Error scraping competitor reviews:', err);
    return NextResponse.json({ error: 'Failed to scrape reviews' }, { status: 500 });
  }
}
