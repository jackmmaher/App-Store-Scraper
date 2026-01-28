import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

interface Review {
  title: string;
  content: string;
  rating: number;
  author: string;
  version: string;
}

export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Claude API key not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { reviews, appName } = body as { reviews: Review[]; appName: string };

    if (!reviews || reviews.length === 0) {
      return NextResponse.json(
        { error: 'No reviews provided' },
        { status: 400 }
      );
    }

    // Separate reviews by rating for better analysis
    const negativeReviews = reviews.filter(r => r.rating <= 2);
    const neutralReviews = reviews.filter(r => r.rating === 3);
    const positiveReviews = reviews.filter(r => r.rating >= 4);

    // Prioritize negative reviews (where issues are) but include positive for contrast
    // Sample more negative reviews since that's where actionable insights are
    const sampledNegative = negativeReviews.slice(0, 60);
    const sampledNeutral = neutralReviews.slice(0, 20);
    const sampledPositive = positiveReviews.slice(0, 40);

    const formatReviews = (revs: Review[], label: string) => {
      if (revs.length === 0) return '';
      return `\n### ${label} (${revs.length} sampled)\n` +
        revs.map((r, i) => `[${i + 1}] ★${r.rating} "${r.title}"\n${r.content}`).join('\n\n');
    };

    const reviewsText =
      formatReviews(sampledNegative, '1-2 Star Reviews - CRITICAL ISSUES') +
      formatReviews(sampledNeutral, '3 Star Reviews - MIXED FEELINGS') +
      formatReviews(sampledPositive, '4-5 Star Reviews - WHAT WORKS');

    const prompt = `You are a product analyst. Analyze these ${reviews.length} App Store reviews for "${appName}" to extract actionable product insights.

REVIEW DISTRIBUTION:
- 1-2 stars (critical): ${negativeReviews.length} reviews
- 3 stars (neutral): ${neutralReviews.length} reviews
- 4-5 stars (positive): ${positiveReviews.length} reviews

Focus heavily on the negative reviews - that's where the problems are. Be specific and quote users when possible.

Provide analysis in this EXACT structure:

## 🔴 CRITICAL ISSUES (Causing Users to Quit/Uninstall)
List the most severe problems that make users abandon the app. These are dealbreakers.
- Issue 1: [description] — mentioned by ~X users
- Issue 2: [description] — mentioned by ~X users
(etc.)

## 🟠 FRUSTRATIONS (Things That Annoy Users)
Problems that don't break the app but create friction and dissatisfaction.
- Frustration 1: [description]
- Frustration 2: [description]
(etc.)

## 🐛 BUGS & TECHNICAL ISSUES
Specific technical problems users report (crashes, glitches, errors).
- Bug 1: [description] — affects [which versions/devices if mentioned]
- Bug 2: [description]
(etc.)

## 🟢 WHAT'S WORKING (Users Love This)
Features and aspects users praise. Important to know what NOT to break.
- Strength 1: [description]
- Strength 2: [description]
(etc.)

## 💡 FEATURE REQUESTS
What users wish the app had.
- Request 1: [description] — requested by ~X users
- Request 2: [description]
(etc.)

## 🆚 COMPETITOR MENTIONS
Any competing apps users mention (switching to/from, comparisons).
- [Competitor name]: [what users say about it]
(etc., or "None mentioned" if none)

## 📋 TOP 5 PRIORITIES FOR DEVELOPERS
Based on frequency and severity, the top 5 things to fix/improve:
1. [Most critical]
2. [Second priority]
3. [Third priority]
4. [Fourth priority]
5. [Fifth priority]

Be direct and specific. Don't sugarcoat problems. Quote actual user phrases when impactful.

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
        max_tokens: 4000,
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
      return NextResponse.json(
        { error: 'Failed to analyze reviews' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const analysis = data.content[0]?.text || 'No analysis generated';

    return NextResponse.json({
      analysis,
      stats: {
        total: reviews.length,
        analyzed: sampledNegative.length + sampledNeutral.length + sampledPositive.length,
        negative: negativeReviews.length,
        neutral: neutralReviews.length,
        positive: positiveReviews.length,
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
