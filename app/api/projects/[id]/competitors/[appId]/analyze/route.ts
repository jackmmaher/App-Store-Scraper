import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getLinkedCompetitors, updateLinkedCompetitor, Review } from '@/lib/supabase';

// POST /api/projects/[id]/competitors/[appId]/analyze - Analyze reviews for a linked competitor
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const { id: projectId, appId } = await params;

    // Get competitor with scraped reviews
    const competitors = await getLinkedCompetitors(projectId);
    const competitor = competitors.find(c => c.app_store_id === appId);

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not linked to project' }, { status: 404 });
    }

    if (!competitor.scraped_reviews || competitor.scraped_reviews.length === 0) {
      return NextResponse.json({ error: 'No reviews to analyze. Scrape reviews first.' }, { status: 400 });
    }

    const reviews = competitor.scraped_reviews as Review[];

    // Separate reviews by rating
    const negativeReviews = reviews.filter(r => r.rating <= 2);
    const neutralReviews = reviews.filter(r => r.rating === 3);
    const positiveReviews = reviews.filter(r => r.rating >= 4);

    // Sample reviews for analysis
    const sampledNegative = negativeReviews.slice(0, 40);
    const sampledNeutral = neutralReviews.slice(0, 15);
    const sampledPositive = positiveReviews.slice(0, 25);

    const formatReviews = (revs: Review[], label: string) => {
      if (revs.length === 0) return '';
      return `\n### ${label} (${revs.length} sampled)\n` +
        revs.map((r, i) => `[${i + 1}] ★${r.rating} "${r.title}"\n${r.content}`).join('\n\n');
    };

    const reviewsText =
      formatReviews(sampledNegative, '1-2 Star Reviews - CRITICAL ISSUES') +
      formatReviews(sampledNeutral, '3 Star Reviews - MIXED FEELINGS') +
      formatReviews(sampledPositive, '4-5 Star Reviews - WHAT WORKS');

    const prompt = `You are analyzing competitor app reviews to inform the development of a new app. Analyze these ${reviews.length} App Store reviews for "${competitor.name}" (${competitor.rating?.toFixed(1) || 'N/A'}★) to extract competitive intelligence.

## REVIEW DISTRIBUTION:
- 1-2 stars (critical): ${negativeReviews.length} reviews
- 3 stars (neutral): ${neutralReviews.length} reviews
- 4-5 stars (positive): ${positiveReviews.length} reviews

Provide a CONCISE analysis focused on actionable competitive insights:

## Key Strengths (What to Learn From)
- Top 3-5 things users love about this app

## Critical Weaknesses (Opportunities for Us)
- Top 5-7 pain points and unmet needs

## Feature Gaps
- Features users request that the app lacks

## User Segments
- Who uses this app and what do they need?

## Competitive Positioning
- How should we differentiate against this competitor?

Be direct and focus on actionable intelligence for building a competing app.

${reviewsText}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error:', error);
      return NextResponse.json({ error: 'Failed to analyze reviews' }, { status: 500 });
    }

    const data = await response.json();
    const analysis = data.content[0]?.text || 'No analysis generated';

    // Update competitor with analysis
    const result = await updateLinkedCompetitor(projectId, appId, {
      ai_analysis: analysis,
      analyzed_at: new Date().toISOString(),
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analysis,
      competitors: result,
    });
  } catch (err) {
    console.error('Error analyzing competitor reviews:', err);
    return NextResponse.json({ error: 'Failed to analyze reviews' }, { status: 500 });
  }
}
