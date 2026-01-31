import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getLinkedCompetitors, updateLinkedCompetitor, Review } from '@/lib/supabase';

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

    // Call the py-reviews API to scrape reviews
    const scrapeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/py-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: appId,
        country: 'us',
        streaming: false, // Non-streaming for simpler handling
        filters: [
          { sort: 'mostRecent', target: 200 },
          { sort: 'mostCritical', target: 300 },
        ],
        stealth: {
          baseDelay: 2.0,
          randomization: 50,
          filterCooldown: 3.0,
          autoThrottle: true,
        },
      }),
    });

    if (!scrapeResponse.ok) {
      // Try a simpler approach - collect from streaming endpoint
      console.log('py-reviews non-streaming failed, trying streaming approach...');
      return await handleStreamingScrape(projectId, appId, competitor.name);
    }

    const scrapeData = await scrapeResponse.json();
    const reviews: Review[] = scrapeData.reviews || [];

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

// Handle streaming scrape as fallback
async function handleStreamingScrape(projectId: string, appId: string, appName: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/py-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: appId,
        country: 'us',
        streaming: true,
        filters: [
          { sort: 'mostRecent', target: 100 },
          { sort: 'mostCritical', target: 150 },
        ],
        stealth: {
          baseDelay: 2.0,
          randomization: 50,
          filterCooldown: 3.0,
          autoThrottle: true,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Streaming request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const allReviews: Review[] = [];
    const seenIds = new Set<string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'reviews' && event.reviews) {
              for (const review of event.reviews) {
                if (!seenIds.has(review.id)) {
                  seenIds.add(review.id);
                  allReviews.push(review);
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    if (allReviews.length === 0) {
      return NextResponse.json({ error: 'No reviews found via streaming' }, { status: 404 });
    }

    // Update the competitor with scraped reviews
    const result = await updateLinkedCompetitor(projectId, appId, {
      scraped_reviews: allReviews,
      scraped_at: new Date().toISOString(),
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to save scraped reviews' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reviews_count: allReviews.length,
      competitors: result,
    });
  } catch (err) {
    console.error('Streaming scrape error:', err);
    return NextResponse.json({ error: 'Failed to scrape reviews' }, { status: 500 });
  }
}
