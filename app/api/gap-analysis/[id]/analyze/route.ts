import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getGapSession, type GapAnalysisApp } from '@/lib/supabase';
import { COUNTRY_CODES } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/gap-analysis/[id]/analyze - Market gap AI analysis for selected apps
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  const { id: sessionId } = await params;

  try {
    const body = await request.json();
    const { appStoreId } = body as { appStoreId: string };

    if (!appStoreId) {
      return NextResponse.json({ error: 'App store ID required' }, { status: 400 });
    }

    // Get session with apps
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;

    // Find the app to analyze
    const app = apps.find((a) => a.app_store_id === appStoreId);
    if (!app) {
      return NextResponse.json({ error: 'App not found in session' }, { status: 404 });
    }

    // Build context
    const topCountries = Object.entries(app.country_ranks)
      .filter(([, rank]) => rank !== null && rank <= 10)
      .sort(([, a], [, b]) => (a || 999) - (b || 999))
      .map(([country, rank]) => `${COUNTRY_CODES[country] || country} (#${rank})`)
      .join(', ');

    const missingCountries = session.countries
      .filter((c) => !app.countries_present.includes(c))
      .map((c) => COUNTRY_CODES[c] || c)
      .join(', ');

    const lowRankCountries = Object.entries(app.country_ranks)
      .filter(([, rank]) => rank !== null && rank > 20)
      .map(([country, rank]) => `${COUNTRY_CODES[country] || country} (#${rank})`)
      .join(', ');

    const prompt = buildAnalysisPrompt(app, session.countries, topCountries, missingCountries, lowRankCountries);

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
        { error: 'Failed to analyze app' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const analysis = data.content[0]?.text || 'No analysis generated';

    return NextResponse.json({
      analysis,
      app: {
        app_store_id: app.app_store_id,
        app_name: app.app_name,
        app_developer: app.app_developer,
        classification: app.classification,
      },
    });
  } catch (error) {
    console.error('[POST /api/gap-analysis/[id]/analyze] Error:', error);
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    );
  }
}

function buildAnalysisPrompt(
  app: GapAnalysisApp,
  allCountries: string[],
  topCountries: string,
  missingCountries: string,
  lowRankCountries: string
): string {
  return `You are a market intelligence analyst specializing in mobile app competitive strategy.

## APP BEING ANALYZED
- **App:** ${app.app_name}
- **Developer:** ${app.app_developer || 'Unknown'}
- **Category:** ${app.app_primary_genre || 'Unknown'}
- **Rating:** ${app.app_rating?.toFixed(1) || 'N/A'} stars
- **Reviews:** ${app.app_review_count?.toLocaleString() || 'N/A'}
- **Classification:** ${app.classification || 'Unclassified'}

## MARKET PRESENCE
- **Countries where it ranks well:** ${topCountries || 'None in top 10'}
- **Countries where it's absent:** ${missingCountries || 'Present everywhere'}
- **Countries where it ranks poorly (20+):** ${lowRankCountries || 'None'}
- **Total presence:** ${app.presence_count} of ${allCountries.length} markets (${((app.presence_count / allCountries.length) * 100).toFixed(0)}%)
- **Average rank:** ${app.average_rank?.toFixed(1) || 'N/A'}

---

Provide a comprehensive market gap analysis:

## 1. Replicability Assessment

### What's Likely Localized
Analyze what aspects of this app's success might be tied to specific markets:
- Language/cultural elements
- Local content or partnerships
- Market-specific features
- Regulatory adaptations

### What's Likely Universal
Identify core value propositions that should work across markets:
- Universal UX patterns
- Core functionality
- General problem-solving approach

### Replicability Score: [1-10]
How easily could a competitor replicate this app's success in new markets?

---

## 2. Market Entry Opportunity

| Market | Gap Type | Opportunity Level | Key Barrier |
|--------|----------|-------------------|-------------|
| [Country] | [Absent/Low Rank/Niche] | [High/Medium/Low] | [What's blocking success] |

Analyze the top 3-5 most promising markets for entry or improvement.

### Recommended Entry Markets
Rank the best markets to target and explain why based on:
1. Market size and app adoption
2. Current competition level
3. Cultural fit
4. Regulatory environment

---

## 3. Feature & Positioning Playbook

### Core Value Proposition
Summarize in one sentence what makes this app succeed in its strong markets.

### Must-Have Features
Essential features any competitor must replicate:
1. [Feature]
2. [Feature]
3. [Feature]

### Differentiators to Consider
Opportunities to outperform this app:
1. [Opportunity]: [Why this could win users]
2. [Opportunity]: [Why this could win users]
3. [Opportunity]: [Why this could win users]

### Positioning Angle
How should a competitor position against this app in new markets?

---

## 4. Competitive Intelligence

### Why This App Succeeds in Its Strong Markets
Analyze the factors driving success (first-mover advantage, brand recognition, feature set, etc.)

### Vulnerabilities
Where is this app weak? What complaints might users have?

### Moat Assessment: [Low/Medium/High]
How defensible is this app's position?

---

## 5. Strategic Recommendation

Provide a clear recommendation:
- **Build** (create a competing product)
- **Acquire** (target for acquisition if possible)
- **Partner** (collaborate for market entry)
- **Avoid** (too entrenched or not worth competing)

Explain your reasoning based on the analysis above.`;
}
