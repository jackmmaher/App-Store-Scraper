// Reddit AI Analyzer
// Performs semantic extraction on Reddit data using Claude AI

import {
  UnmetNeed,
  TrendAnalysis,
  SentimentBreakdown,
  SubredditSummary,
  ConfidenceScore,
  AttributedQuote,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  author: string;
  upvote_ratio: number;
  comments: RedditComment[];
  search_topic?: string;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  depth?: number;
  is_submitter?: boolean;
  parent_id?: string;
  replies?: RedditComment[];
}

export interface RedditStats {
  total_posts: number;
  total_comments: number;
  subreddits_searched: string[];
  topics_searched: string[];
  date_range: {
    start: string | null;
    end: string | null;
  };
}

export interface RedditAnalysisOutput {
  unmetNeeds: UnmetNeed[];
  trends: TrendAnalysis;
  sentiment: SentimentBreakdown;
  languagePatterns: string[];
  topSubreddits: SubredditSummary[];
}

interface ClaudeAnalysisResult {
  unmetNeeds: {
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    postCount: number;
    avgUpvotes: number;
    topSubreddits: string[];
    representativeQuotes: string[];
    // New: Confidence scoring
    confidence?: {
      score: number;
      reasoning: string;
      postVolumeFactor: number;
      crossSubredditFactor: number;
      sentimentConsistencyFactor: number;
    };
    // New: Attributed quotes
    attributedQuotes?: {
      text: string;
      postIndex: number;  // References the post number in the input
      isFromComment: boolean;
      subreddit: string;
    }[];
    // New: Solution extraction (Phase 3.2)
    workarounds?: string[];
    competitorsMentioned?: string[];
    idealSolutionQuotes?: string[];
  }[];
  sentiment: {
    frustrated: number;
    seekingHelp: number;
    successStories: number;
  };
  languagePatterns: string[];
}

// ============================================================================
// Main Analyzer Function
// ============================================================================

/**
 * Analyze Reddit data using Claude AI for semantic extraction.
 *
 * @param posts - Reddit posts with comments from the crawler
 * @param stats - Aggregated statistics from the crawl
 * @param problemDomain - Context about the problem domain being analyzed
 * @returns Structured analysis including unmet needs, trends, sentiment, and patterns
 */
export async function analyzeRedditData(
  posts: RedditPost[],
  stats: RedditStats,
  problemDomain: string
): Promise<RedditAnalysisOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Weight comments by quality before formatting
  const weightedPosts = posts.map(post => ({
    ...post,
    comments: weightAndSortComments(post.comments),
  }));

  // Format posts for the prompt (limit to ~50 posts, prioritize by engagement)
  const { formatted: formattedPosts, postMetadata } = formatPostsForPromptWithMetadata(weightedPosts);

  // Build the analysis prompt
  const prompt = buildAnalysisPrompt(formattedPosts, problemDomain);

  // Call Claude API
  const claudeResult = await callClaudeAPI(apiKey, prompt);

  // Calculate trend metrics from timestamps
  const trends = calculateTrendMetrics(posts);

  // Aggregate subreddit stats
  const topSubreddits = aggregateSubredditStats(posts);

  // Format unmet needs with IDs, confidence, and attributed quotes
  const unmetNeeds: UnmetNeed[] = claudeResult.unmetNeeds.map((need, index) => {
    // Build confidence score
    const confidence = buildConfidenceScore(need, posts.length);

    // Build attributed quotes from Claude's references
    const attributedQuotes: AttributedQuote[] = (need.attributedQuotes || [])
      .map(aq => {
        const postMeta = postMetadata[aq.postIndex - 1]; // Convert 1-indexed to 0-indexed
        if (!postMeta) return null;

        const quote: AttributedQuote = {
          text: aq.text,
          postId: postMeta.id,
          postTitle: postMeta.title,
          subreddit: aq.subreddit || postMeta.subreddit,
          score: postMeta.score,
          permalink: postMeta.permalink,
          isFromComment: aq.isFromComment,
          author: postMeta.author,
        };
        return quote;
      })
      .filter((q): q is AttributedQuote => q !== null);

    return {
      id: `need-${index + 1}`,
      title: need.title,
      description: need.description,
      severity: need.severity,
      evidence: {
        postCount: need.postCount,
        avgUpvotes: need.avgUpvotes,
        topSubreddits: need.topSubreddits,
        representativeQuotes: need.representativeQuotes,
        attributedQuotes: attributedQuotes.length > 0 ? attributedQuotes : undefined,
      },
      confidence,
      workarounds: need.workarounds,
      competitorsMentioned: need.competitorsMentioned,
      idealSolutionQuotes: need.idealSolutionQuotes,
      solutionNotes: null,
    };
  });

  return {
    unmetNeeds,
    trends,
    sentiment: claudeResult.sentiment,
    languagePatterns: claudeResult.languagePatterns,
    topSubreddits,
  };
}

/**
 * Build confidence score from Claude's analysis
 */
function buildConfidenceScore(
  need: ClaudeAnalysisResult['unmetNeeds'][0],
  totalPosts: number
): ConfidenceScore {
  // Use Claude's confidence if provided, otherwise calculate
  if (need.confidence) {
    const score = need.confidence.score;
    return {
      score,
      factors: {
        postVolume: need.confidence.postVolumeFactor,
        crossSubreddit: need.confidence.crossSubredditFactor,
        quoteVerified: (need.attributedQuotes?.length || 0) > 0,
        sentimentConsistency: need.confidence.sentimentConsistencyFactor,
      },
      label: getConfidenceLabel(score),
    };
  }

  // Fallback: calculate from available data
  const postVolume = Math.min(need.postCount / 20, 1); // 20+ posts = 1.0
  const crossSubreddit = Math.min(need.topSubreddits.length / 3, 1); // 3+ subs = 1.0
  const quoteVerified = need.representativeQuotes.length > 0;

  // Simple weighted average
  const score = (postVolume * 0.4) + (crossSubreddit * 0.3) + (quoteVerified ? 0.3 : 0);

  return {
    score,
    factors: {
      postVolume,
      crossSubreddit,
      quoteVerified,
      sentimentConsistency: 0.5, // Default to medium if not calculated
    },
    label: getConfidenceLabel(score),
  };
}

function getConfidenceLabel(score: number): 'high' | 'medium' | 'low' | 'speculative' {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  if (score >= 0.3) return 'low';
  return 'speculative';
}

/**
 * Weight comments by quality signals
 */
function weightAndSortComments(comments: RedditComment[]): RedditComment[] {
  if (!comments || comments.length === 0) return [];

  const weighted = comments.map(comment => ({
    ...comment,
    _weight: weightComment(comment),
  }));

  // Sort by weight descending
  weighted.sort((a, b) => b._weight - a._weight);

  // Flatten nested replies while preserving high-quality ones
  const flattened = flattenCommentsWithWeight(weighted);

  return flattened.slice(0, 10); // Return top 10 weighted comments
}

/**
 * Calculate weight for a single comment based on quality signals
 */
function weightComment(comment: RedditComment): number {
  let weight = 1.0;

  // High upvotes = community validated
  if (comment.score > 50) weight *= 2.0;
  else if (comment.score > 20) weight *= 1.5;
  else if (comment.score > 10) weight *= 1.2;

  // OP responses are high signal
  if (comment.is_submitter) weight *= 1.5;

  // Longer thoughtful comments (but not too long)
  const bodyLength = comment.body?.length || 0;
  if (bodyLength > 200 && bodyLength < 2000) weight *= 1.2;

  // Contains actionable language
  if (/I (use|tried|switched|recommend|found|started|stopped)/i.test(comment.body)) {
    weight *= 1.3;
  }

  // Contains struggle language (high signal for unmet needs)
  if (/I('m| am) (so )?(tired|sick|frustrated|annoyed|fed up|done)/i.test(comment.body)) {
    weight *= 1.4;
  }

  // Contains solution-seeking language
  if (/is there (a|any)|has anyone|does anyone|looking for/i.test(comment.body)) {
    weight *= 1.3;
  }

  return weight;
}

/**
 * Flatten nested comments while preserving structure
 */
function flattenCommentsWithWeight(comments: (RedditComment & { _weight: number })[]): RedditComment[] {
  const result: RedditComment[] = [];

  for (const comment of comments) {
    // Remove internal weight before returning
    const { _weight, replies, ...cleanComment } = comment;
    result.push(cleanComment);

    // Recursively add high-quality replies
    if (replies && replies.length > 0) {
      const weightedReplies = replies
        .map(r => ({ ...r, _weight: weightComment(r) }))
        .sort((a, b) => b._weight - a._weight)
        .slice(0, 3); // Top 3 replies per comment

      result.push(...flattenCommentsWithWeight(weightedReplies));
    }
  }

  return result;
}

// ============================================================================
// Post Formatting
// ============================================================================

interface PostMetadata {
  index: number;
  id: string;
  subreddit: string;
  title: string;
  score: number;
  permalink: string;
  author: string;
}

function formatPostsForPromptWithMetadata(posts: RedditPost[]): {
  formatted: string;
  postMetadata: PostMetadata[];
} {
  // Sort by engagement (score + comments * 2)
  const sortedPosts = [...posts].sort(
    (a, b) => (b.score + b.num_comments * 2) - (a.score + a.num_comments * 2)
  );

  // Limit to top 50 posts
  const limitedPosts = sortedPosts.slice(0, 50);

  const postMetadata: PostMetadata[] = [];

  const formatted = limitedPosts.map((post, index) => {
    // Store metadata for attribution
    postMetadata.push({
      index: index + 1,
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      score: post.score,
      permalink: post.permalink || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
      author: post.author,
    });

    const comments = post.comments
      .slice(0, 5)
      .map((c) => {
        const opTag = c.is_submitter ? ' [OP]' : '';
        return `  - "${truncate(c.body, 200)}" (score: ${c.score}${opTag})`;
      })
      .join('\n');

    return `
[Post ${index + 1}] r/${post.subreddit} | ID: ${post.id}
Title: ${post.title}
Score: ${post.score} | Comments: ${post.num_comments}
Content: ${truncate(post.selftext, 300)}
${comments ? `Top Comments:\n${comments}` : ''}
---`;
  });

  return {
    formatted: formatted.join('\n'),
    postMetadata,
  };
}

// Keep the old function for backwards compatibility
function formatPostsForPrompt(posts: RedditPost[]): string {
  const { formatted } = formatPostsForPromptWithMetadata(posts);
  return formatted;
}

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// ============================================================================
// Claude API Call
// ============================================================================

function buildAnalysisPrompt(formattedPosts: string, problemDomain: string): string {
  return `You are a Jobs-to-be-Done (JTBD) researcher analyzing real Reddit discussions. Your task is to extract the UNDERLYING HUMAN STRUGGLES that represent genuine product opportunities—not surface-level complaints or feature requests.

## Problem Domain Context
${problemDomain}

## Reddit Posts and Comments
${formattedPosts}

## JTBD Analysis Framework

### Step 1: Apply the 5 Whys to Each Discussion
For each pain point you identify, ask "why?" until you reach the ROOT emotional or functional struggle:
- Surface: "I can't find what I need in this app"
- Why? "The search is terrible"
- Why? "It doesn't understand what I actually want"
- Why? "I have to know the exact terms"
- ROOT: "I need to discover solutions I don't know how to describe yet"

### Step 2: Categorize by Job Type
For each unmet need, identify which type of job it represents:
| Job Type | Focus | Example |
|----------|-------|---------|
| **Functional** | Task completion | "I need to track my progress without manual entry" |
| **Emotional** | Feeling state | "I need to feel in control, not overwhelmed" |
| **Social** | How others perceive them | "I need to appear competent to my team" |
| **Aspirational** | Identity transformation | "I want to become someone who has healthy habits" |

### Step 3: Severity Scoring Rubric
Rate each need using this evidence-based criteria:
- **High Severity**:
  - Strong emotional language (frustrated, exhausted, desperate)
  - Multiple people confirming the same struggle
  - Users mention abandoning solutions or giving up
  - High engagement (upvotes, comments agreeing)
- **Medium Severity**:
  - Moderate frustration expressed
  - Some community agreement
  - Workarounds mentioned but inconvenient
- **Low Severity**:
  - Minor inconveniences
  - Nice-to-have rather than must-have
  - Limited community validation

### Step 4: Confidence Assessment
For EACH need, assess your confidence level:
- **High (0.8-1.0)**: 20+ posts discussing this, mentioned in multiple subreddits, strong agreement
- **Medium (0.5-0.8)**: 10-20 posts, consistent sentiment across discussions
- **Low (0.3-0.5)**: 5-10 posts, some disagreement or ambiguity
- **Speculative (<0.3)**: Few posts, single subreddit, extrapolated from limited data

Confidence factors to evaluate:
1. **postVolumeFactor** (0-1): How many posts discuss this? (20+ = 1.0, 10-20 = 0.7, 5-10 = 0.4, <5 = 0.2)
2. **crossSubredditFactor** (0-1): Mentioned in multiple subreddits? (3+ = 1.0, 2 = 0.6, 1 = 0.3)
3. **sentimentConsistencyFactor** (0-1): Do people agree? (strong consensus = 1.0, mixed = 0.5, contradictory = 0.2)

### Step 5: Extract Struggle Language
Capture the EXACT phrases users use—these become marketing copy and search terms:
- Pain indicators: "I'm so tired of...", "Why is it so hard to...", "I've tried everything..."
- Unmet need signals: "I wish there was...", "Is there anything that...", "Has anyone found..."
- Willingness to pay: "I would pay for...", "Worth it if...", "Shut up and take my money"

### Step 6: Solutions & Workarounds Extraction
For each unmet need, also extract:
1. **Workarounds**: What do users currently do to solve this? (e.g., "Currently I use a spreadsheet to...")
2. **Competitors mentioned**: What existing products/apps do they reference?
3. **Ideal solution quotes**: When users describe what they wish existed (e.g., "I would pay for something that...")

## Output Requirements

Respond in this exact JSON format:
{
  "unmetNeeds": [
    {
      "title": "Brief, action-oriented title describing the struggle",
      "description": "2-3 sentences describing the ROOT problem (from 5 Whys), not the surface complaint. Include the job type (functional/emotional/social/aspirational).",
      "severity": "high|medium|low",
      "postCount": 0,
      "avgUpvotes": 0,
      "topSubreddits": ["subreddits where this was discussed"],
      "representativeQuotes": ["Exact quotes from posts/comments that exemplify this struggle - use the user's actual words"],
      "confidence": {
        "score": 0.0,
        "reasoning": "Brief explanation of confidence level",
        "postVolumeFactor": 0.0,
        "crossSubredditFactor": 0.0,
        "sentimentConsistencyFactor": 0.0
      },
      "attributedQuotes": [
        {
          "text": "The exact quote text",
          "postIndex": 1,
          "isFromComment": false,
          "subreddit": "subredditname"
        }
      ],
      "workarounds": ["What users currently do to work around this problem"],
      "competitorsMentioned": ["App X", "Tool Y"],
      "idealSolutionQuotes": ["I would pay for something that...", "I wish there was..."]
    }
  ],
  "sentiment": {
    "frustrated": 0,
    "seekingHelp": 0,
    "successStories": 0
  },
  "languagePatterns": [
    "Exact phrase patterns users use (e.g., 'I'm so tired of having to...')",
    "Include pain language, question patterns, and buying signals",
    "These should be quotable struggle-language snippets"
  ]
}

**Important Guidelines:**
- Identify 5-7 distinct unmet needs, prioritizing depth over breadth
- Each need should represent a DIFFERENT underlying job, not variations of the same problem
- Quotes must be REAL text from the provided posts/comments, not fabricated
- For attributedQuotes, the postIndex should reference the [Post X] number from the input
- Sentiment percentages must sum to 100
- Language patterns should be struggle-language verbs/phrases, not product nouns
- Include confidence scores for EVERY need - be honest about uncertainty`;
}

async function callClaudeAPI(
  apiKey: string,
  prompt: string
): Promise<ClaudeAnalysisResult> {
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
    throw new Error('Failed to analyze Reddit data with Claude');
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';

  return parseClaudeAnalysisResponse(content);
}

function parseClaudeAnalysisResponse(content: string): ClaudeAnalysisResult {
  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Could not find JSON in Claude response:', content);
    throw new Error('Could not parse Claude response as JSON');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize the response
    const unmetNeeds = Array.isArray(parsed.unmetNeeds)
      ? parsed.unmetNeeds.map((need: Record<string, unknown>) => {
          // Parse confidence if present
          const confidence = need.confidence as Record<string, unknown> | undefined;
          const parsedConfidence = confidence ? {
            score: Number(confidence.score) || 0.5,
            reasoning: String(confidence.reasoning || ''),
            postVolumeFactor: Number(confidence.postVolumeFactor) || 0.5,
            crossSubredditFactor: Number(confidence.crossSubredditFactor) || 0.5,
            sentimentConsistencyFactor: Number(confidence.sentimentConsistencyFactor) || 0.5,
          } : undefined;

          // Parse attributed quotes if present
          const attributedQuotes = Array.isArray(need.attributedQuotes)
            ? (need.attributedQuotes as Record<string, unknown>[]).map(aq => ({
                text: String(aq.text || ''),
                postIndex: Number(aq.postIndex) || 1,
                isFromComment: Boolean(aq.isFromComment),
                subreddit: String(aq.subreddit || ''),
              }))
            : undefined;

          return {
            title: String(need.title || 'Unknown Need'),
            description: String(need.description || ''),
            severity: validateSeverity(need.severity),
            postCount: Number(need.postCount) || 0,
            avgUpvotes: Number(need.avgUpvotes) || 0,
            topSubreddits: Array.isArray(need.topSubreddits)
              ? need.topSubreddits.map(String)
              : [],
            representativeQuotes: Array.isArray(need.representativeQuotes)
              ? need.representativeQuotes.map(String)
              : [],
            confidence: parsedConfidence,
            attributedQuotes,
            // Solution extraction fields
            workarounds: Array.isArray(need.workarounds)
              ? need.workarounds.map(String)
              : undefined,
            competitorsMentioned: Array.isArray(need.competitorsMentioned)
              ? need.competitorsMentioned.map(String)
              : undefined,
            idealSolutionQuotes: Array.isArray(need.idealSolutionQuotes)
              ? need.idealSolutionQuotes.map(String)
              : undefined,
          };
        })
      : [];

    const sentiment = parsed.sentiment || {};
    const normalizedSentiment = normalizeSentiment({
      frustrated: Number(sentiment.frustrated) || 0,
      seekingHelp: Number(sentiment.seekingHelp) || 0,
      successStories: Number(sentiment.successStories) || 0,
    });

    const languagePatterns = Array.isArray(parsed.languagePatterns)
      ? parsed.languagePatterns.map(String)
      : [];

    return {
      unmetNeeds,
      sentiment: normalizedSentiment,
      languagePatterns,
    };
  } catch (e) {
    console.error('Failed to parse Claude response:', e, content);
    throw new Error('Failed to parse Claude analysis response');
  }
}

function validateSeverity(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'medium';
}

function normalizeSentiment(sentiment: SentimentBreakdown): SentimentBreakdown {
  const total = sentiment.frustrated + sentiment.seekingHelp + sentiment.successStories;
  if (total === 0) {
    return { frustrated: 33, seekingHelp: 34, successStories: 33 };
  }
  if (total === 100) {
    return sentiment;
  }
  // Normalize to 100%
  const factor = 100 / total;
  return {
    frustrated: Math.round(sentiment.frustrated * factor),
    seekingHelp: Math.round(sentiment.seekingHelp * factor),
    successStories: Math.round(sentiment.successStories * factor),
  };
}

// ============================================================================
// Trend Calculation
// ============================================================================

function calculateTrendMetrics(posts: RedditPost[]): TrendAnalysis {
  if (posts.length === 0) {
    return {
      discussionVolume: 0,
      trendDirection: 'stable',
      percentChange: 0,
    };
  }

  // Get current time and time boundaries
  const now = Date.now() / 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60;
  const twoMonthsAgo = now - 60 * 24 * 60 * 60;

  // Count posts in each period
  const recentPosts = posts.filter(
    (p) => p.created_utc >= oneMonthAgo
  ).length;

  const olderPosts = posts.filter(
    (p) => p.created_utc >= twoMonthsAgo && p.created_utc < oneMonthAgo
  ).length;

  // Calculate trend
  let trendDirection: 'rising' | 'stable' | 'declining' = 'stable';
  let percentChange = 0;

  if (olderPosts > 0) {
    percentChange = Math.round(((recentPosts - olderPosts) / olderPosts) * 100);

    if (percentChange > 20) {
      trendDirection = 'rising';
    } else if (percentChange < -20) {
      trendDirection = 'declining';
    }
  } else if (recentPosts > 0) {
    trendDirection = 'rising';
    percentChange = 100;
  }

  return {
    discussionVolume: posts.length,
    trendDirection,
    percentChange,
  };
}

// ============================================================================
// Language Mining (Phase 2.2)
// ============================================================================

// Re-export from language-extractor for convenience
export { mineLanguageFromPosts, generateSearchTerms } from './language-extractor';

// ============================================================================
// Subreddit Aggregation
// ============================================================================

function aggregateSubredditStats(posts: RedditPost[]): SubredditSummary[] {
  const subredditMap = new Map<string, { postCount: number; totalEngagement: number }>();

  for (const post of posts) {
    const existing = subredditMap.get(post.subreddit);
    const engagement = post.score + post.num_comments;

    if (existing) {
      existing.postCount++;
      existing.totalEngagement += engagement;
    } else {
      subredditMap.set(post.subreddit, {
        postCount: 1,
        totalEngagement: engagement,
      });
    }
  }

  // Convert to array and sort by post count
  const summaries: SubredditSummary[] = Array.from(subredditMap.entries())
    .map(([name, data]) => ({
      name,
      postCount: data.postCount,
      avgEngagement: Math.round(data.totalEngagement / data.postCount),
    }))
    .sort((a, b) => b.postCount - a.postCount);

  // Return top 10 subreddits
  return summaries.slice(0, 10);
}
