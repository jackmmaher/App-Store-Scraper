import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getProject,
  getChatMessages,
  saveChatMessage,
  clearChatMessages,
  type Review,
} from '@/lib/supabase';

// GET /api/chat?projectId=xxx - Fetch all messages for a project
export async function GET(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    const messages = await getChatMessages(projectId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[GET /api/chat] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/chat - Send message, get Claude response, save both
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { projectId, message } = body as { projectId: string; message: string };

    if (!projectId || !message) {
      return NextResponse.json({ error: 'Project ID and message required' }, { status: 400 });
    }

    // Fetch project data for context
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch recent chat history (last 20 messages)
    const chatHistory = await getChatMessages(projectId);
    const recentHistory = chatHistory.slice(-20);

    // Build system prompt with app context
    const systemPrompt = buildSystemPrompt(project);

    // Build conversation messages
    const conversationMessages = [
      ...recentHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Call Claude API
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
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error:', error);
      return NextResponse.json({ error: 'Failed to get response from Claude' }, { status: 500 });
    }

    const data = await response.json();
    const assistantResponse = data.content[0]?.text || 'No response generated';

    // Save user message to DB
    const savedUserMessage = await saveChatMessage(projectId, 'user', message);
    if (!savedUserMessage) {
      return NextResponse.json({ error: 'Failed to save user message' }, { status: 500 });
    }

    // Save assistant response to DB
    const savedAssistantMessage = await saveChatMessage(projectId, 'assistant', assistantResponse);
    if (!savedAssistantMessage) {
      return NextResponse.json({ error: 'Failed to save assistant message' }, { status: 500 });
    }

    return NextResponse.json({
      userMessage: savedUserMessage,
      assistantMessage: savedAssistantMessage,
    });
  } catch (error) {
    console.error('[POST /api/chat] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/chat?projectId=xxx - Clear conversation
export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    const success = await clearChatMessages(projectId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/chat] Error:', error);
    return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
  }
}

// Build system prompt with project context
function buildSystemPrompt(project: {
  app_name: string;
  app_developer: string | null;
  app_rating: number | null;
  app_review_count: number | null;
  app_primary_genre: string | null;
  reviews: Review[];
  ai_analysis: string | null;
}): string {
  const appName = project.app_name;
  const developer = project.app_developer || 'Unknown';
  const rating = project.app_rating?.toFixed(1) || 'N/A';
  const reviewCount = project.app_review_count || 0;
  const category = project.app_primary_genre || 'Unknown';

  // Include AI analysis if available (truncate if too long)
  let analysisSection = '';
  if (project.ai_analysis) {
    const analysis = project.ai_analysis.length > 3000
      ? project.ai_analysis.substring(0, 3000) + '\n\n[Analysis truncated...]'
      : project.ai_analysis;
    analysisSection = `\n\n## AI Analysis Summary\n${analysis}`;
  }

  // Sample reviews (prioritize variety of ratings)
  const reviews = project.reviews || [];
  const sampleReviews = getSampleReviews(reviews, 25);

  let reviewsSection = '';
  if (sampleReviews.length > 0) {
    reviewsSection = '\n\n## Sample Reviews\n' + sampleReviews.map((r, i) =>
      `[${i + 1}] ${r.rating}★ "${r.title}"\n${r.content}`
    ).join('\n\n');
  }

  return `You are a product analyst assistant helping analyze App Store reviews for "${appName}".

## App Information
- **App Name:** ${appName}
- **Developer:** ${developer}
- **Category:** ${category}
- **Rating:** ${rating} stars
- **Total Reviews:** ${reviewCount.toLocaleString()}
- **Saved Reviews for Analysis:** ${reviews.length}
${analysisSection}
${reviewsSection}

## Your Role
Help the user:
1. Answer questions about review feedback and user sentiment
2. Provide deeper insights on specific topics mentioned in reviews
3. Brainstorm solutions to user complaints and issues
4. Suggest feature improvements based on user feedback
5. Generate actionable recommendations for the product team

Be specific, cite reviews when relevant, and be direct. If asked about something not covered in the available data, say so clearly.`;
}

// Get a diverse sample of reviews (prioritize variety of ratings)
function getSampleReviews(reviews: Review[], count: number): Review[] {
  if (reviews.length <= count) return reviews;

  const byRating: Record<number, Review[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  reviews.forEach((r) => {
    if (byRating[r.rating]) {
      byRating[r.rating].push(r);
    }
  });

  const sampled: Review[] = [];
  const perRating = Math.ceil(count / 5);

  // Take from each rating category
  [1, 2, 3, 4, 5].forEach((rating) => {
    const ratingReviews = byRating[rating];
    sampled.push(...ratingReviews.slice(0, perRating));
  });

  return sampled.slice(0, count);
}
