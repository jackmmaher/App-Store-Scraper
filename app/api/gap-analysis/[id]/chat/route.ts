import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getGapSession,
  getGapChatMessages,
  saveGapChatMessage,
  clearGapChatMessages,
  type GapAnalysisApp,
} from '@/lib/supabase';
import { COUNTRY_CODES, CATEGORY_NAMES } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for chat

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/gap-analysis/[id]/chat - Get chat messages
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  try {
    const messages = await getGapChatMessages(sessionId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[GET /api/gap-analysis/[id]/chat] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/gap-analysis/[id]/chat - Send message and get response
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  const { id: sessionId } = await params;

  try {
    const body = await request.json();
    const { message } = body as { message: string };

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Get session with apps
    const result = await getGapSession(sessionId);
    if (!result) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, apps } = result;

    // Get recent chat history
    const chatHistory = await getGapChatMessages(sessionId);
    const recentHistory = chatHistory.slice(-20);

    // Build system prompt with gap analysis context
    const systemPrompt = buildSystemPrompt(session, apps);

    // Build conversation messages
    const conversationMessages = [
      ...recentHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Call Claude API with timeout to prevent hanging
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
        system: systemPrompt,
        messages: conversationMessages,
      }),
      signal: AbortSignal.timeout(90000), // 90 second timeout
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error:', error);
      return NextResponse.json({ error: 'Failed to get response' }, { status: 500 });
    }

    const data = await response.json();
    const assistantResponse = data.content[0]?.text || 'No response generated';

    // Save messages to DB
    const savedUserMessage = await saveGapChatMessage(sessionId, 'user', message);
    if (!savedUserMessage) {
      return NextResponse.json({ error: 'Failed to save user message' }, { status: 500 });
    }

    const savedAssistantMessage = await saveGapChatMessage(sessionId, 'assistant', assistantResponse);
    if (!savedAssistantMessage) {
      return NextResponse.json({ error: 'Failed to save assistant message' }, { status: 500 });
    }

    return NextResponse.json({
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });
  } catch (error) {
    console.error('[POST /api/gap-analysis/[id]/chat] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/gap-analysis/[id]/chat - Clear conversation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  try {
    const success = await clearGapChatMessages(sessionId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/gap-analysis/[id]/chat] Error:', error);
    return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
  }
}

// Build system prompt with gap analysis context
function buildSystemPrompt(
  session: {
    name: string | null;
    category: string;
    countries: string[];
    apps_per_country: number;
  },
  apps: GapAnalysisApp[]
): string {
  const categoryName = CATEGORY_NAMES[session.category] || session.category;
  const countryNames = session.countries.map((c) => COUNTRY_CODES[c] || c).join(', ');

  // Classify apps
  const globalLeaders = apps.filter((a) => a.classification === 'global_leader');
  const brands = apps.filter((a) => a.classification === 'brand');
  const localChampions = apps.filter((a) => a.classification === 'local_champion');
  const unclassified = apps.filter((a) => !a.classification);

  // Build summary sections
  const globalLeadersSummary = globalLeaders.length > 0
    ? globalLeaders.slice(0, 5).map((a) =>
        `- ${a.app_name} (${a.app_developer || 'Unknown'}) - Avg rank: ${a.average_rank?.toFixed(1)}, Present: ${a.presence_count}/${session.countries.length}`
      ).join('\n')
    : 'None identified';

  const brandsSummary = brands.length > 0
    ? brands.slice(0, 10).map((a) =>
        `- ${a.app_name} (${a.app_developer || 'Unknown'}) - ${a.classification_reason || ''}`
      ).join('\n')
    : 'None identified';

  const localChampionsSummary = localChampions.length > 0
    ? localChampions.slice(0, 10).map((a) => {
        const topCountries = Object.entries(a.country_ranks)
          .filter(([, rank]) => rank !== null && rank <= 10)
          .map(([country]) => country.toUpperCase())
          .join(', ');
        return `- ${a.app_name} (${a.app_developer || 'Unknown'}) - Top 10 in: ${topCountries}, Present: ${a.presence_count}/${session.countries.length}`;
      }).join('\n')
    : 'None identified';

  return `You are a market intelligence analyst helping analyze cross-country App Store data for the "${categoryName}" category.

## Gap Analysis Session
- **Session Name:** ${session.name || 'Unnamed'}
- **Category:** ${categoryName}
- **Countries Analyzed:** ${countryNames}
- **Apps Per Country:** ${session.apps_per_country}
- **Total Unique Apps:** ${apps.length}

## Classification Summary
- **Global Leaders:** ${globalLeaders.length} apps (top 3 rank in 80%+ of markets)
- **Recognized Brands:** ${brands.length} apps (offline consumer brands)
- **Local Champions:** ${localChampions.length} apps (top 10 in some markets, absent in others)
- **Unclassified:** ${unclassified.length} apps

## Global Leaders
${globalLeadersSummary}

## Recognized Brands
${brandsSummary}

## Local Champions (Market Opportunities)
${localChampionsSummary}

## Your Role
Help the user:
1. Understand market opportunities revealed by the gap analysis
2. Identify patterns in which apps succeed in which markets
3. Suggest market entry strategies based on local champion patterns
4. Compare and contrast apps across different countries
5. Provide actionable competitive intelligence

Be specific, cite data when relevant, and focus on actionable insights. If asked about something not covered in the data, say so clearly.`;
}
