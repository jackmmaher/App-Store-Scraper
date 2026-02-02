import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getLinkedCompetitors, updateLinkedCompetitor, Review, getRedditAnalysisById, getUnmetNeedSolutions } from '@/lib/supabase';
import { RedditAnalysisResult, UnmetNeed } from '@/lib/reddit/types';

// Allow up to 5 minutes for AI analysis
export const maxDuration = 300;

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

    // Fetch Reddit analysis if available
    let redditAnalysis: RedditAnalysisResult | null = null;
    if (competitor.reddit_analysis_id) {
      redditAnalysis = await getRedditAnalysisById(competitor.reddit_analysis_id);
      if (redditAnalysis) {
        // Merge solution annotations into unmet needs
        const solutions = await getUnmetNeedSolutions(redditAnalysis.id);
        const solutionMap = new Map(solutions.map(s => [s.needId, s.notes]));
        redditAnalysis.unmetNeeds = redditAnalysis.unmetNeeds.map(need => ({
          ...need,
          solutionNotes: solutionMap.get(need.id) || need.solutionNotes,
        }));
      }
    }

    // Separate reviews by rating (skip reviews with null ratings)
    const negativeReviews = reviews.filter(r => r.rating !== null && r.rating <= 2);
    const neutralReviews = reviews.filter(r => r.rating !== null && r.rating === 3);
    const positiveReviews = reviews.filter(r => r.rating !== null && r.rating >= 4);

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

    // Build Reddit insights section if available
    const redditSection = redditAnalysis ? `

=== REDDIT MARKET INSIGHTS ===
(What the BROADER market needs - beyond this app's users)

Unmet Needs Identified from Reddit:
${redditAnalysis.unmetNeeds.map((need: UnmetNeed) => `
- ${need.title} [Severity: ${need.severity}]
  Problem: ${need.description}
  Evidence: ${need.evidence.postCount} posts, ${need.evidence.avgUpvotes} avg upvotes
  User's Solution Approach: ${need.solutionNotes || "Not yet defined"}
`).join('')}

Market Signals:
- Discussion volume: ${redditAnalysis.trends.discussionVolume} posts/month
- Trend: ${redditAnalysis.trends.trendDirection} (${redditAnalysis.trends.percentChange}% change)
- Sentiment: ${redditAnalysis.sentiment.frustrated}% frustrated, ${redditAnalysis.sentiment.seekingHelp}% seeking help
- Top communities: ${redditAnalysis.topSubreddits.slice(0, 3).map(s => `r/${s.name}`).join(', ')}
` : '';

    // Build analysis instructions based on data availability
    const analysisInstructions = redditAnalysis
      ? `Generate competitive intelligence that:
1. Identifies what this app does well (to learn from)
2. Identifies app-level weaknesses (from reviews)
3. Identifies problem-domain gaps (from Reddit) with user's proposed solutions
4. Creates strategic positioning based on solving what competitors miss

For problem-domain gaps, output a section:

## Problem-Domain Gaps
For each unmet need from Reddit:
| Need | How Competitors Fail | Proposed Solution | Strategic Value |
|------|---------------------|-------------------|-----------------|
| ... | ... | ... | ... |`
      : `Generate competitive intelligence that:
1. Identifies what this app does well (to learn from)
2. Identifies app-level weaknesses (from reviews)
3. Creates strategic positioning`;

    const prompt = `You are analyzing competitor app reviews${redditAnalysis ? ' and Reddit market data' : ''} to inform the development of a new app. Analyze these ${reviews.length} App Store reviews for "${competitor.name}" (${competitor.rating?.toFixed(1) || 'N/A'}★) to extract competitive intelligence.

## REVIEW DISTRIBUTION:
- 1-2 stars (critical): ${negativeReviews.length} reviews
- 3 stars (neutral): ${neutralReviews.length} reviews
- 4-5 stars (positive): ${positiveReviews.length} reviews
${redditSection}

${analysisInstructions}

Provide a CONCISE analysis focused on actionable competitive insights:

## Key Strengths (What to Learn From)
- Top 3-5 things users love about this app

## Critical Weaknesses (Opportunities for Us)
- Top 5-7 pain points and unmet needs

## Feature Gaps
- Features users request that the app lacks

## User Segments
- Who uses this app and what do they need?
${redditAnalysis ? `
## Problem-Domain Gaps
(Table showing unmet needs from Reddit, how competitors fail, and your proposed solutions)
` : ''}
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

    // Handle timeout-specific errors
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Analysis timed out. The AI service may be slow or the review set may be too large. Try again or reduce the number of reviews.' },
          { status: 504 }
        );
      }
      // Handle fetch errors that might indicate network timeout
      if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
        return NextResponse.json(
          { error: 'Request timed out while connecting to AI service. Please try again.' },
          { status: 504 }
        );
      }
    }

    return NextResponse.json({ error: 'Failed to analyze reviews' }, { status: 500 });
  }
}
