/**
 * Batch Review Processor
 *
 * Splits large review sets into chunks and processes each chunk through
 * Claude to extract structured analysis data (pain points, feature requests,
 * competitor mentions, user segments).
 *
 * Designed to process all 5,000 reviews instead of sampling 120 (97% data loss).
 */

import type { Review } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface ChunkAnalysisResult {
  painPoints: Array<{
    title: string;
    category: 'bug' | 'missing_feature' | 'ux_issue' | 'pricing' | 'performance';
    severity: 'critical' | 'high' | 'medium' | 'low';
    mentions: number;
    quotes: string[];
  }>;
  featureRequests: Array<{
    feature: string;
    mentions: number;
    quotes: string[];
  }>;
  competitorMentions: Array<{
    app: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    context: string;
  }>;
  userSegments: Array<{
    segment: string;
    needs: string[];
    painPoints: string[];
  }>;
}

// ============================================
// Chunk Splitting
// ============================================

/**
 * Splits an array of reviews into chunks of a given size.
 */
export function chunkReviews(reviews: Review[], chunkSize: number = 200): Review[][] {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const chunks: Review[][] = [];
  for (let i = 0; i < reviews.length; i += chunkSize) {
    chunks.push(reviews.slice(i, i + chunkSize));
  }
  return chunks;
}

// ============================================
// Chunk Processing
// ============================================

/**
 * Processes a single chunk of reviews through the Anthropic API to extract
 * structured analysis data.
 *
 * @param reviews - The chunk of reviews to analyze
 * @param appName - Name of the app being analyzed
 * @param chunkIndex - Zero-based index of this chunk
 * @param totalChunks - Total number of chunks being processed
 * @param apiKey - Anthropic API key
 * @returns Structured analysis result for this chunk
 */
export async function processReviewChunk(
  reviews: Review[],
  appName: string,
  chunkIndex: number,
  totalChunks: number,
  apiKey: string,
): Promise<ChunkAnalysisResult> {
  const formattedReviews = reviews
    .map((r, i) => {
      const rating = r.rating !== null ? `${r.rating}/5` : 'N/A';
      const title = r.title ? `"${r.title}"` : '(no title)';
      const version = r.version ? ` [v${r.version}]` : '';
      return `[${i + 1}] ${rating} ${title}${version}\n${r.content || '(no content)'}`;
    })
    .join('\n\n');

  const prompt = `You are a structured data extraction engine. Analyze these ${reviews.length} App Store reviews for "${appName}" (chunk ${chunkIndex + 1} of ${totalChunks}).

Extract the following data and return ONLY valid JSON matching the exact schema below. No prose, no explanation, no markdown — just the JSON object.

Schema:
{
  "painPoints": [
    {
      "title": "short descriptive title of the pain point",
      "category": "bug" | "missing_feature" | "ux_issue" | "pricing" | "performance",
      "severity": "critical" | "high" | "medium" | "low",
      "mentions": <number of reviews in this chunk mentioning this>,
      "quotes": ["exact quote from review 1", "exact quote from review 2"]
    }
  ],
  "featureRequests": [
    {
      "feature": "description of the requested feature",
      "mentions": <number of reviews requesting this>,
      "quotes": ["exact quote 1", "exact quote 2"]
    }
  ],
  "competitorMentions": [
    {
      "app": "competitor app name",
      "sentiment": "positive" | "negative" | "neutral",
      "context": "brief context of why competitor was mentioned"
    }
  ],
  "userSegments": [
    {
      "segment": "segment name (e.g. Power Users, Beginners, Enterprise)",
      "needs": ["need 1", "need 2"],
      "painPoints": ["pain point 1", "pain point 2"]
    }
  ]
}

Rules:
- Return ONLY the JSON object. No markdown code fences, no commentary.
- Keep quotes short (under 150 characters each). Use the most representative quotes.
- Include up to 5 quotes per pain point or feature request.
- Deduplicate within this chunk: group similar complaints into one pain point.
- If a category has no entries, use an empty array.
- Severity guide: critical = app-breaking/data loss, high = major workflow blocker, medium = annoying but workaround exists, low = minor inconvenience.

Reviews:
${formattedReviews}`;

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
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
    } catch {
      // If we can't parse the error body, use the status text
      errorDetail = `HTTP ${response.status} ${response.statusText}`;
    }
    throw new Error(
      `Anthropic API error on chunk ${chunkIndex + 1}/${totalChunks}: ${errorDetail}`
    );
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text || '';

  if (!rawText) {
    throw new Error(
      `Empty response from Anthropic API on chunk ${chunkIndex + 1}/${totalChunks}`
    );
  }

  return parseChunkResponse(rawText, chunkIndex, totalChunks);
}

// ============================================
// Response Parsing
// ============================================

/**
 * Parses the raw text response from Claude into a ChunkAnalysisResult.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 */
function parseChunkResponse(
  rawText: string,
  chunkIndex: number,
  totalChunks: number,
): ChunkAnalysisResult {
  // First, try to parse the text directly as JSON
  const trimmed = rawText.trim();

  // Attempt 1: Direct JSON parse
  try {
    return validateChunkResult(JSON.parse(trimmed));
  } catch {
    // Fall through to extraction attempts
  }

  // Attempt 2: Extract JSON from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return validateChunkResult(JSON.parse(codeBlockMatch[1].trim()));
    } catch {
      // Fall through
    }
  }

  // Attempt 3: Find first { ... } block in the text
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return validateChunkResult(
        JSON.parse(trimmed.substring(firstBrace, lastBrace + 1))
      );
    } catch {
      // Fall through
    }
  }

  // All parsing attempts failed
  throw new Error(
    `Failed to parse JSON from chunk ${chunkIndex + 1}/${totalChunks}. ` +
    `Raw text starts with: "${trimmed.substring(0, 200)}..."`
  );
}

/**
 * Validates and normalizes a parsed chunk result, ensuring all required
 * fields exist with correct types.
 */
function validateChunkResult(parsed: unknown): ChunkAnalysisResult {
  const obj = parsed as Record<string, unknown>;

  const result: ChunkAnalysisResult = {
    painPoints: [],
    featureRequests: [],
    competitorMentions: [],
    userSegments: [],
  };

  // Validate painPoints
  if (Array.isArray(obj.painPoints)) {
    result.painPoints = obj.painPoints
      .filter((p): p is Record<string, unknown> => p !== null && typeof p === 'object')
      .map((p) => ({
        title: typeof p.title === 'string' ? p.title : 'Unknown',
        category: isValidCategory(p.category) ? p.category : 'bug',
        severity: isValidSeverity(p.severity) ? p.severity : 'medium',
        mentions: typeof p.mentions === 'number' ? p.mentions : 1,
        quotes: Array.isArray(p.quotes)
          ? p.quotes.filter((q): q is string => typeof q === 'string').slice(0, 5)
          : [],
      }));
  }

  // Validate featureRequests
  if (Array.isArray(obj.featureRequests)) {
    result.featureRequests = obj.featureRequests
      .filter((f): f is Record<string, unknown> => f !== null && typeof f === 'object')
      .map((f) => ({
        feature: typeof f.feature === 'string' ? f.feature : 'Unknown',
        mentions: typeof f.mentions === 'number' ? f.mentions : 1,
        quotes: Array.isArray(f.quotes)
          ? f.quotes.filter((q): q is string => typeof q === 'string').slice(0, 5)
          : [],
      }));
  }

  // Validate competitorMentions
  if (Array.isArray(obj.competitorMentions)) {
    result.competitorMentions = obj.competitorMentions
      .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
      .map((c) => ({
        app: typeof c.app === 'string' ? c.app : 'Unknown',
        sentiment: isValidSentiment(c.sentiment) ? c.sentiment : 'neutral',
        context: typeof c.context === 'string' ? c.context : '',
      }));
  }

  // Validate userSegments
  if (Array.isArray(obj.userSegments)) {
    result.userSegments = obj.userSegments
      .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
      .map((s) => ({
        segment: typeof s.segment === 'string' ? s.segment : 'Unknown',
        needs: Array.isArray(s.needs)
          ? s.needs.filter((n): n is string => typeof n === 'string')
          : [],
        painPoints: Array.isArray(s.painPoints)
          ? s.painPoints.filter((p): p is string => typeof p === 'string')
          : [],
      }));
  }

  return result;
}

// ============================================
// Type Guards
// ============================================

function isValidCategory(
  val: unknown,
): val is 'bug' | 'missing_feature' | 'ux_issue' | 'pricing' | 'performance' {
  return (
    typeof val === 'string' &&
    ['bug', 'missing_feature', 'ux_issue', 'pricing', 'performance'].includes(val)
  );
}

function isValidSeverity(
  val: unknown,
): val is 'critical' | 'high' | 'medium' | 'low' {
  return (
    typeof val === 'string' &&
    ['critical', 'high', 'medium', 'low'].includes(val)
  );
}

function isValidSentiment(
  val: unknown,
): val is 'positive' | 'negative' | 'neutral' {
  return (
    typeof val === 'string' &&
    ['positive', 'negative', 'neutral'].includes(val)
  );
}
