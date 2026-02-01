// Reddit Config Generator
// Generates search configuration from competitor data and reviews using Claude AI

import { RedditSearchConfig } from './types';
import { supabase, Review, LinkedCompetitor } from '@/lib/supabase';
import { CATEGORY_SUBREDDITS } from '@/lib/opportunity/constants';

// ============================================================================
// Extended Category Subreddits for Reddit Deep Dive
// ============================================================================

const EXTENDED_CATEGORY_SUBREDDITS: Record<string, string[]> = {
  ...CATEGORY_SUBREDDITS,
  // Add more specific subreddits for common app categories
  'games': ['gaming', 'iosgaming', 'mobilegaming', 'indiegaming', 'gamedev'],
  'music': ['music', 'wearethemusicmakers', 'musicproduction', 'spotify', 'applemusic'],
  'sports': ['sports', 'running', 'cycling', 'golf', 'tennis', 'basketball'],
  'medical': ['health', 'medical', 'healthcare', 'medicine', 'healthIT'],
  'reference': ['books', 'wikipedia', 'reference', 'learning'],
  'news': ['news', 'worldnews', 'journalism', 'newsapps'],
  'books': ['books', 'reading', 'kindle', 'audiobooks', 'ebooks'],
};

// ============================================================================
// Types
// ============================================================================

interface CompetitorWithReviews {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  reviews: Review[];
}

interface ClaudeExtractionResult {
  problemDomain: string;
  searchTopics: string[];
  suggestedSubreddits: string[];
}

// ============================================================================
// Main Config Generator
// ============================================================================

export async function generateRedditSearchConfig(
  competitorId: string
): Promise<RedditSearchConfig> {
  // Fetch competitor data and reviews
  const competitor = await fetchCompetitorWithReviews(competitorId);

  if (!competitor) {
    throw new Error(`Competitor not found: ${competitorId}`);
  }

  // Get category-based subreddits as fallback
  const categorySubreddits = getCategorySubreddits(competitor.category);

  // If no reviews, return metadata-only config
  if (!competitor.reviews || competitor.reviews.length === 0) {
    return createFallbackConfig(competitor, categorySubreddits);
  }

  try {
    // Use Claude to extract problem domain and keywords from reviews
    const extraction = await extractInsightsWithClaude(competitor);

    // Combine category subreddits with AI suggestions
    const subreddits = mergeSubreddits(categorySubreddits, extraction.suggestedSubreddits);

    return {
      competitorId,
      problemDomain: extraction.problemDomain,
      searchTopics: extraction.searchTopics,
      subreddits,
      timeRange: 'month',
    };
  } catch (error) {
    console.error('Error extracting insights with Claude:', error);
    // Fallback to metadata-only config
    return createFallbackConfig(competitor, categorySubreddits);
  }
}

// ============================================================================
// Data Fetching
// ============================================================================

async function fetchCompetitorWithReviews(
  competitorId: string
): Promise<CompetitorWithReviews | null> {
  // First, try to find the competitor in app_projects as a linked competitor
  const { data: projects, error: projectsError } = await supabase
    .from('app_projects')
    .select('id, linked_competitors')
    .not('linked_competitors', 'is', null);

  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
    return null;
  }

  // Search through linked competitors
  for (const project of projects || []) {
    const linkedCompetitors = project.linked_competitors as LinkedCompetitor[] | null;
    if (!linkedCompetitors) continue;

    const competitor = linkedCompetitors.find(
      (c: LinkedCompetitor) => c.app_store_id === competitorId
    );

    if (competitor) {
      // Get the full project to get the category
      const { data: fullProject } = await supabase
        .from('app_projects')
        .select('app_primary_genre')
        .eq('id', project.id)
        .single();

      return {
        id: competitor.app_store_id,
        name: competitor.name,
        description: null, // Linked competitors don't store description
        category: fullProject?.app_primary_genre || null,
        reviews: (competitor.scraped_reviews as Review[]) || [],
      };
    }
  }

  // If not found as linked competitor, try the apps table
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('app_store_id, name, description, primary_genre, reviews')
    .eq('app_store_id', competitorId)
    .single();

  if (appError) {
    if (appError.code !== 'PGRST116') {
      console.error('Error fetching app:', appError);
    }
    return null;
  }

  return {
    id: app.app_store_id,
    name: app.name,
    description: app.description,
    category: app.primary_genre,
    reviews: (app.reviews as Review[]) || [],
  };
}

// ============================================================================
// Claude AI Extraction
// ============================================================================

async function extractInsightsWithClaude(
  competitor: CompetitorWithReviews
): Promise<ClaudeExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Sample reviews for analysis (prioritize negative reviews for pain points)
  const sampledReviews = sampleReviewsForAnalysis(competitor.reviews);

  const prompt = buildExtractionPrompt(competitor, sampledReviews);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
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
    throw new Error('Failed to extract insights from reviews');
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';

  return parseClaudeResponse(content);
}

function sampleReviewsForAnalysis(reviews: Review[]): Review[] {
  // Prioritize negative reviews (1-3 stars) for pain point discovery
  const negativeReviews = reviews.filter((r) => r.rating <= 3);
  const positiveReviews = reviews.filter((r) => r.rating > 3);

  // Sample up to 25 negative and 10 positive reviews
  const sampledNegative = negativeReviews.slice(0, 25);
  const sampledPositive = positiveReviews.slice(0, 10);

  return [...sampledNegative, ...sampledPositive];
}

function buildExtractionPrompt(
  competitor: CompetitorWithReviews,
  reviews: Review[]
): string {
  const reviewsText = reviews
    .map((r, i) => `[${i + 1}] ★${r.rating} "${r.title}"\n${r.content}`)
    .join('\n\n');

  return `Analyze these app reviews for "${competitor.name}" to help find relevant Reddit discussions about user problems.

## App Context
- Name: ${competitor.name}
- Category: ${competitor.category || 'Unknown'}
${competitor.description ? `- Description: ${competitor.description.slice(0, 300)}...` : ''}

## Reviews (${reviews.length} sampled)
${reviewsText}

## Task
Based on these reviews, extract:

1. **Problem Domain**: A 1-2 sentence summary of the core problem users are trying to solve with this app.

2. **Search Topics**: 5-8 specific keywords or phrases people might use when discussing this problem on Reddit. Focus on:
   - Pain points mentioned in reviews
   - Specific use cases
   - Alternative solutions users might search for

3. **Suggested Subreddits**: 3-5 subreddits (beyond obvious category ones) where users might discuss these problems.

Respond in this exact JSON format:
{
  "problemDomain": "...",
  "searchTopics": ["topic1", "topic2", ...],
  "suggestedSubreddits": ["subreddit1", "subreddit2", ...]
}`;
}

function parseClaudeResponse(content: string): ClaudeExtractionResult {
  // Try to parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      problemDomain: parsed.problemDomain || 'General app functionality',
      searchTopics: Array.isArray(parsed.searchTopics) ? parsed.searchTopics : [],
      suggestedSubreddits: Array.isArray(parsed.suggestedSubreddits)
        ? parsed.suggestedSubreddits.map((s: string) => s.replace(/^r\//, ''))
        : [],
    };
  } catch {
    throw new Error('Failed to parse Claude response JSON');
  }
}

// ============================================================================
// Subreddit Helpers
// ============================================================================

function getCategorySubreddits(category: string | null): string[] {
  if (!category) return ['apple', 'iphone', 'ios'];

  // Normalize category name (e.g., "Health & Fitness" -> "health-fitness")
  const normalizedCategory = category
    .toLowerCase()
    .replace(/\s*&\s*/g, '-')
    .replace(/\s+/g, '-');

  return EXTENDED_CATEGORY_SUBREDDITS[normalizedCategory] || ['apple', 'iphone', 'ios'];
}

function mergeSubreddits(categorySubreddits: string[], aiSuggested: string[]): string[] {
  // Combine and deduplicate
  const combined = new Set([...categorySubreddits, ...aiSuggested]);

  // Remove any empty strings or invalid entries
  const filtered = Array.from(combined).filter(
    (s) => s && s.length > 0 && !s.includes(' ')
  );

  // Return up to 10 subreddits
  return filtered.slice(0, 10);
}

// ============================================================================
// Fallback Config
// ============================================================================

function createFallbackConfig(
  competitor: CompetitorWithReviews,
  categorySubreddits: string[]
): RedditSearchConfig {
  // Extract keywords from app name
  const nameKeywords = competitor.name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !['app', 'the', 'and', 'for'].includes(word));

  return {
    competitorId: competitor.id,
    problemDomain: `Users looking for ${competitor.category || 'app'} solutions like ${competitor.name}`,
    searchTopics: nameKeywords.slice(0, 5),
    subreddits: categorySubreddits,
    timeRange: 'month',
  };
}
