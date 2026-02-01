import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getRedditAnalysisById, getUnmetNeedSolutions } from '@/lib/supabase';
import { RedditAnalysisResult } from '@/lib/reddit/types';

interface Review {
  title: string;
  content: string;
  rating: number;
  author: string;
  version: string;
}

interface AnalyzeRequest {
  reviews: Review[];
  appName: string;
  category?: string;
  rating?: number;
  totalReviews?: number;
  redditAnalysisId?: string;
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
    const { reviews, appName, category, rating, totalReviews, redditAnalysisId } = body as AnalyzeRequest;

    if (!reviews || reviews.length === 0) {
      return NextResponse.json(
        { error: 'No reviews provided' },
        { status: 400 }
      );
    }

    // Fetch Reddit analysis if ID provided
    let redditAnalysis: RedditAnalysisResult | null = null;
    let solutionNotes: Array<{ needId: string; notes: string }> = [];

    if (redditAnalysisId) {
      redditAnalysis = await getRedditAnalysisById(redditAnalysisId);
      if (redditAnalysis) {
        solutionNotes = await getUnmetNeedSolutions(redditAnalysisId);
      }
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

    // Build Reddit context section if available
    let redditContextSection = '';
    if (redditAnalysis) {
      // Merge solution notes into unmet needs
      const solutionsMap = new Map(solutionNotes.map(s => [s.needId, s.notes]));

      const unmetNeedsTable = redditAnalysis.unmetNeeds
        .map(need => {
          const solution = solutionsMap.get(need.id) || 'Not defined';
          return `| ${need.title} | ${need.severity} | ${need.evidence.postCount} posts, ${need.evidence.avgUpvotes} avg upvotes | ${solution} |`;
        })
        .join('\n');

      const topSubreddits = redditAnalysis.topSubreddits
        .slice(0, 5)
        .map(s => `- r/${s.name} (${s.postCount} posts, ${s.avgEngagement} avg engagement)`)
        .join('\n');

      redditContextSection = `

---

## Reddit Market Research

In addition to app reviews, we have analyzed broader market discussions from Reddit:

### Unmet Needs Discovered
| Need | Severity | Evidence | User's Proposed Solution |
|------|----------|----------|-------------------------|
${unmetNeedsTable}

### Market Trends
- Discussion Volume: ${redditAnalysis.trends.discussionVolume} posts/month
- Trend Direction: ${redditAnalysis.trends.trendDirection} (${redditAnalysis.trends.percentChange > 0 ? '+' : ''}${redditAnalysis.trends.percentChange}% change)

### User Sentiment
- Frustrated: ${redditAnalysis.sentiment.frustrated}%
- Seeking Help: ${redditAnalysis.sentiment.seekingHelp}%
- Success Stories: ${redditAnalysis.sentiment.successStories}%

### Language Patterns (how users describe this problem)
${redditAnalysis.languagePatterns.map(p => `- "${p}"`).join('\n')}

### Top Communities
${topSubreddits}

---

IMPORTANT: Your analysis must address BOTH:
1. App-specific issues (from reviews)
2. Broader market gaps (from Reddit research)
`;
    }

    const prompt = `You are a competitive intelligence analyst. Analyze these ${reviews.length} App Store reviews for "${appName}" to identify market opportunities for a competitor building an alternative.

## CONTEXT
- App: ${appName}
- Category: ${category || 'Unknown'}
- Current Rating: ${rating ? rating.toFixed(1) : 'N/A'}/5
- Total Reviews: ${totalReviews ? totalReviews.toLocaleString() : 'N/A'}
- Sample Size: ${reviews.length} reviews analyzed

REVIEW DISTRIBUTION:
- 1-2 stars (critical): ${negativeReviews.length} reviews
- 3 stars (neutral): ${neutralReviews.length} reviews
- 4-5 stars (positive): ${positiveReviews.length} reviews

Provide analysis in this EXACT structure:

---

## 1. Core Value Proposition Assessment

What job is this app hired to do? Summarize in 2-3 sentences what users fundamentally want from this app, based on both praise and complaints.

---

## 2. Failed Jobs (What Users Can't Accomplish)

| Job to be Done | Failure Mode | Frequency | Quote |
|---------------|--------------|-----------|-------|
| [What user wanted to do] | [How the app failed them] | ~X mentions | "[direct quote]" |

List 5-10 failed jobs, prioritized by frequency and severity.

---

## 3. User Segment Analysis

| Segment | Size Signal | Primary Need | Underserved? |
|---------|-------------|--------------|--------------|
| [e.g., "Power users", "Beginners", "Enterprise"] | [frequency indicators] | [their main job] | Yes/Partially/No |

Identify 3-5 distinct user segments from the reviews.

---

## 4. Switching Triggers

What specific moments cause users to actively seek alternatives? List the top 5 switching triggers:

1. **[Trigger]**: [description] — "[quote if available]"
2. **[Trigger]**: [description]
(etc.)

---

## 5. Competitor Intelligence

| Competitor Mentioned | Context | Sentiment | Opportunity Signal |
|---------------------|---------|-----------|-------------------|
| [App name] | [Why mentioned] | Positive/Negative/Neutral | [What this tells us] |

If no competitors mentioned, note "None mentioned in sample."

---

## 6. Technical Debt Map

Group technical issues by business impact:

**Revenue-Impacting** (causes refunds/churn):
- [Issue]: [description]

**Retention-Impacting** (causes frustration but users stay):
- [Issue]: [description]

**Perception-Impacting** (makes app feel low-quality):
- [Issue]: [description]

---

${redditAnalysis ? `## 7. Problem-Domain Opportunities (from Reddit Market Research)

Based on unmet needs discovered in broader market discussions, identify strategic opportunities:

| Unmet Need | App Gap Connection | Strategic Opportunity | Differentiation Potential |
|------------|-------------------|----------------------|--------------------------|
| [Need from Reddit] | [How this connects to app-level issues] | [Specific opportunity] | [High/Medium/Low] |

For each high-severity unmet need from Reddit, explain how a competitor could:
1. Address this gap that the current app ignores
2. Build features the market is asking for
3. Position against both app weaknesses AND market gaps

---

## 8. Opportunity Brief` : `## 7. Opportunity Brief`}

If you were building a competitor, what would you do differently? Provide:

**Positioning Statement**: One sentence describing how a competitor should position against this app${redditAnalysis ? ' and address broader market needs' : ''}.

**Must-Have Features** (table stakes):
1. [Feature]
2. [Feature]
3. [Feature]

**Differentiators** (opportunities to win):
1. [Differentiator]: [why this matters based on reviews${redditAnalysis ? ' and Reddit insights' : ''}]
2. [Differentiator]: [why this matters]
3. [Differentiator]: [why this matters]

**Who to Target First**: [Specific segment] because [reason from review data${redditAnalysis ? ' and market research' : ''}].
${redditAnalysis ? `
**Market Gap to Exploit**: Based on Reddit research, the biggest underserved need is [specific gap] which current apps fail to address because [reason].` : ''}

---

## ${redditAnalysis ? '9' : '8'}. Raw Signal Log

Notable quotes that don't fit above but reveal user psychology:
- "[Quote]" — reveals [insight]
- "[Quote]" — reveals [insight]
(Include 5-10 insightful quotes)

---

Be direct and analytical. Focus on actionable competitive intelligence, not just problem identification.
${redditContextSection}
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
        max_tokens: 6000,
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
