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

    // Prepare reviews text (limit to ~100 reviews for token efficiency)
    const reviewsToAnalyze = reviews.slice(0, 100);
    const reviewsText = reviewsToAnalyze
      .map((r, i) => `[${i + 1}] Rating: ${r.rating}/5 | "${r.title}"\n${r.content}`)
      .join('\n\n');

    const prompt = `Analyze these ${reviewsToAnalyze.length} App Store reviews for "${appName}". Provide a structured analysis with:

1. **Overall Sentiment**: Brief summary of user sentiment (positive/negative/mixed)

2. **Key Strengths**: What users love about the app (bullet points)

3. **Pain Points**: Main complaints and frustrations (bullet points)

4. **Feature Requests**: Features users are asking for (bullet points)

5. **Common Bugs/Issues**: Technical problems mentioned (bullet points)

6. **Actionable Recommendations**: Top 3-5 specific improvements the developers should prioritize

Be concise and data-driven. Focus on patterns that appear in multiple reviews.

Reviews:
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
        max_tokens: 2000,
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

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
