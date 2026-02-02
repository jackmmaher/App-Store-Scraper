// Language Extractor for Reddit Deep Dive
// Extracts authentic struggle phrases from reviews and Reddit posts

import { Review } from '@/lib/supabase';
import { RedditPost, RedditComment } from './analyzer';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedPhrase {
  phrase: string;
  frequency: number;
  sentiment: 'negative' | 'neutral' | 'positive';
  sources: string[]; // Review IDs or post IDs containing this phrase
  category: 'struggle' | 'wish' | 'question' | 'workaround' | 'willingness';
}

export interface LanguageExtractionResult {
  strugglePhrases: ExtractedPhrase[];
  wishPhrases: ExtractedPhrase[];
  questionPatterns: ExtractedPhrase[];
  workaroundPhrases: ExtractedPhrase[];
  willingnessSignals: ExtractedPhrase[];
  topSearchTerms: string[];
}

// ============================================================================
// Pattern Definitions
// ============================================================================

// Struggle language patterns (frustration, pain, difficulty)
const STRUGGLE_PATTERNS = [
  // "I can't..." patterns
  /\bI\s+can(?:')?t\s+(?:seem\s+to\s+)?([a-z\s]{5,40})/gi,
  // "I'm tired/sick/frustrated of..." patterns
  /\bI(?:'m|\s+am)\s+(?:so\s+)?(?:tired|sick|frustrated|annoyed|fed up)\s+(?:of|with|that)\s+([a-z\s]{5,50})/gi,
  // "Why is it so hard to..." patterns
  /\bwhy\s+(?:is\s+it|does\s+it|can(?:')?t\s+I)\s+(?:so\s+)?(?:hard|difficult|impossible)\s+to\s+([a-z\s]{5,40})/gi,
  // "I hate..." patterns
  /\bI\s+(?:really\s+)?hate\s+(?:how|when|that)\s+([a-z\s]{5,50})/gi,
  // "It's annoying that..." patterns
  /\b(?:it(?:')?s|this\s+is)\s+(?:so\s+)?(?:annoying|frustrating|ridiculous)\s+(?:that|when|how)\s+([a-z\s]{5,50})/gi,
  // "I've tried everything..." patterns
  /\bI(?:'ve|\s+have)\s+tried\s+(?:everything|so\s+many\s+things?|multiple\s+\w+)/gi,
  // "Nothing works..." patterns
  /\bnothing\s+(?:seems\s+to\s+)?(?:work|help)s?/gi,
  // "I keep..." negative patterns
  /\bI\s+keep\s+(?:failing|forgetting|struggling|losing|missing)\s+([a-z\s]{3,30})/gi,
  // Direct complaints
  /\b(?:the\s+)?(?:app|tool|feature|thing)\s+(?:doesn(?:')?t|won(?:')?t|never)\s+([a-z\s]{5,40})/gi,
];

// Wish/desire patterns (what users want)
const WISH_PATTERNS = [
  // "I wish..." patterns
  /\bI\s+wish\s+(?:there\s+was|I\s+could|it\s+(?:would|could))\s+([a-z\s]{5,50})/gi,
  // "If only..." patterns
  /\bif\s+only\s+(?:I\s+could|there\s+was|it\s+(?:would|could))\s+([a-z\s]{5,50})/gi,
  // "I want..." patterns
  /\bI\s+(?:just\s+)?want\s+(?:to\s+be\s+able\s+to|something\s+that)\s+([a-z\s]{5,40})/gi,
  // "I need..." patterns
  /\bI\s+(?:really\s+)?need\s+(?:a\s+way\s+to|something\s+that)\s+([a-z\s]{5,40})/gi,
  // "It would be great if..." patterns
  /\b(?:it\s+)?would\s+be\s+(?:great|nice|amazing)\s+(?:if|to)\s+([a-z\s]{5,50})/gi,
];

// Question patterns (seeking solutions)
const QUESTION_PATTERNS = [
  // "How do you..." patterns
  /\bhow\s+(?:do|can|should)\s+(?:you|I|we)\s+([a-z\s]{5,40})\??/gi,
  // "Is there a..." patterns
  /\bis\s+there\s+(?:a|any)\s+(?:way|app|tool|method)\s+(?:to|that)\s+([a-z\s]{5,40})\??/gi,
  // "Does anyone..." patterns
  /\bdoes\s+anyone\s+(?:know|have|use)\s+([a-z\s]{5,50})\??/gi,
  // "Has anyone..." patterns
  /\bhas\s+anyone\s+(?:found|tried|managed)\s+([a-z\s]{5,50})\??/gi,
  // "What do you use..." patterns
  /\bwhat\s+(?:do\s+you|app|tool)\s+(?:use|recommend)\s+(?:for|to)\s+([a-z\s]{5,40})\??/gi,
  // "Any recommendations..." patterns
  /\b(?:any|looking\s+for)\s+recommendations?\s+(?:for|on)\s+([a-z\s]{5,40})\??/gi,
];

// Workaround patterns (current solutions)
const WORKAROUND_PATTERNS = [
  // "Currently I use..." patterns
  /\b(?:currently|right\s+now)\s+I\s+(?:use|rely\s+on|have\s+to)\s+([a-z\s]{5,50})/gi,
  // "I've been doing..." patterns
  /\bI(?:'ve|\s+have)\s+been\s+(?:doing|using|trying)\s+([a-z\s]{5,50})/gi,
  // "My workaround is..." patterns
  /\bmy\s+(?:workaround|solution|hack)\s+is\s+(?:to\s+)?([a-z\s]{5,50})/gi,
  // "I ended up..." patterns
  /\bI\s+ended\s+up\s+(?:having\s+to\s+)?([a-z\s]{5,50})/gi,
  // "What I do is..." patterns
  /\bwhat\s+I\s+do\s+is\s+([a-z\s]{5,50})/gi,
];

// Willingness to pay patterns
const WILLINGNESS_PATTERNS = [
  // "I would pay for..." patterns
  /\bI\s+(?:would|'d)\s+(?:gladly\s+)?pay\s+(?:\$?\d+\s+)?(?:for|to)\s+([a-z\s]{5,50})/gi,
  // "Worth paying for..." patterns
  /\b(?:worth|I(?:'d|\s+would)\s+pay)\s+(?:\$?\d+\s+)?(?:for|if|to\s+have)\s+([a-z\s]{5,40})/gi,
  // "Shut up and take my money" variants
  /\b(?:shut\s+up\s+and\s+)?take\s+my\s+money/gi,
  // "I'd buy this in a heartbeat" patterns
  /\bI(?:'d|\s+would)\s+(?:buy|subscribe|pay)\s+(?:for\s+this\s+)?(?:in\s+a\s+heartbeat|immediately|right\s+away)/gi,
];

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Extract struggle phrases from app reviews
 * Prioritizes negative reviews (1-3 stars) for pain point discovery
 */
export function extractStrugglePhrases(reviews: Review[]): ExtractedPhrase[] {
  // Filter to negative reviews (1-3 stars), skip reviews with null ratings
  const negativeReviews = reviews.filter(r => r.rating !== null && r.rating <= 3);

  const phraseMap = new Map<string, ExtractedPhrase>();

  for (const review of negativeReviews) {
    const text = `${review.title || ''} ${review.content || ''}`.toLowerCase();
    const reviewId = `review-${review.rating}-${text.slice(0, 20)}`;

    // Extract struggle phrases
    extractPatternsFromText(text, STRUGGLE_PATTERNS, 'struggle', 'negative', reviewId, phraseMap);

    // Extract wish phrases
    extractPatternsFromText(text, WISH_PATTERNS, 'wish', 'negative', reviewId, phraseMap);

    // Extract question patterns
    extractPatternsFromText(text, QUESTION_PATTERNS, 'question', 'neutral', reviewId, phraseMap);
  }

  // Convert to array and sort by frequency
  return Array.from(phraseMap.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 30); // Top 30 phrases
}

/**
 * Mine language patterns from Reddit posts after initial crawl
 */
export function mineLanguageFromPosts(posts: RedditPost[]): LanguageExtractionResult {
  const strugglePhrases = new Map<string, ExtractedPhrase>();
  const wishPhrases = new Map<string, ExtractedPhrase>();
  const questionPatterns = new Map<string, ExtractedPhrase>();
  const workaroundPhrases = new Map<string, ExtractedPhrase>();
  const willingnessSignals = new Map<string, ExtractedPhrase>();

  for (const post of posts) {
    const postId = post.id;

    // Extract from title (high signal)
    const titleText = post.title.toLowerCase();
    extractPatternsFromText(titleText, STRUGGLE_PATTERNS, 'struggle', 'negative', postId, strugglePhrases);
    extractPatternsFromText(titleText, QUESTION_PATTERNS, 'question', 'neutral', postId, questionPatterns);

    // Extract from post content
    const contentText = (post.selftext || '').toLowerCase();
    extractPatternsFromText(contentText, STRUGGLE_PATTERNS, 'struggle', 'negative', postId, strugglePhrases);
    extractPatternsFromText(contentText, WISH_PATTERNS, 'wish', 'negative', postId, wishPhrases);
    extractPatternsFromText(contentText, QUESTION_PATTERNS, 'question', 'neutral', postId, questionPatterns);
    extractPatternsFromText(contentText, WORKAROUND_PATTERNS, 'workaround', 'neutral', postId, workaroundPhrases);
    extractPatternsFromText(contentText, WILLINGNESS_PATTERNS, 'willingness', 'positive', postId, willingnessSignals);

    // Extract from comments
    const allComments = flattenComments(post.comments || []);
    for (const comment of allComments) {
      const commentText = (comment.body || '').toLowerCase();
      const commentId = `${postId}-c${comment.id}`;

      extractPatternsFromText(commentText, STRUGGLE_PATTERNS, 'struggle', 'negative', commentId, strugglePhrases);
      extractPatternsFromText(commentText, WISH_PATTERNS, 'wish', 'negative', commentId, wishPhrases);
      extractPatternsFromText(commentText, QUESTION_PATTERNS, 'question', 'neutral', commentId, questionPatterns);
      extractPatternsFromText(commentText, WORKAROUND_PATTERNS, 'workaround', 'neutral', commentId, workaroundPhrases);
      extractPatternsFromText(commentText, WILLINGNESS_PATTERNS, 'willingness', 'positive', commentId, willingnessSignals);
    }
  }

  // Convert to sorted arrays
  const sortAndSlice = (map: Map<string, ExtractedPhrase>, limit: number) =>
    Array.from(map.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);

  const result: LanguageExtractionResult = {
    strugglePhrases: sortAndSlice(strugglePhrases, 15),
    wishPhrases: sortAndSlice(wishPhrases, 10),
    questionPatterns: sortAndSlice(questionPatterns, 10),
    workaroundPhrases: sortAndSlice(workaroundPhrases, 10),
    willingnessSignals: sortAndSlice(willingnessSignals, 5),
    topSearchTerms: [],
  };

  // Generate top search terms from extracted phrases
  result.topSearchTerms = generateSearchTerms(result);

  return result;
}

/**
 * Generate search terms from extracted language patterns
 * These can be used for a second-pass crawl
 */
export function generateSearchTerms(extraction: LanguageExtractionResult): string[] {
  const terms = new Set<string>();

  // Add top struggle phrases as search terms
  for (const phrase of extraction.strugglePhrases.slice(0, 5)) {
    terms.add(cleanSearchTerm(phrase.phrase));
  }

  // Add question patterns
  for (const phrase of extraction.questionPatterns.slice(0, 3)) {
    terms.add(cleanSearchTerm(phrase.phrase));
  }

  // Add wish phrases
  for (const phrase of extraction.wishPhrases.slice(0, 3)) {
    terms.add(cleanSearchTerm(phrase.phrase));
  }

  return Array.from(terms).filter(t => t.length >= 5 && t.length <= 50);
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractPatternsFromText(
  text: string,
  patterns: RegExp[],
  category: ExtractedPhrase['category'],
  sentiment: ExtractedPhrase['sentiment'],
  sourceId: string,
  phraseMap: Map<string, ExtractedPhrase>
): void {
  for (const pattern of patterns) {
    // Reset regex state
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Get the captured group or the full match
      const phrase = (match[1] || match[0]).trim();

      // Skip very short or very long matches
      if (phrase.length < 5 || phrase.length > 60) continue;

      // Normalize the phrase
      const normalized = normalizePhrase(phrase);

      if (!normalized) continue;

      const existing = phraseMap.get(normalized);
      if (existing) {
        existing.frequency++;
        if (!existing.sources.includes(sourceId)) {
          existing.sources.push(sourceId);
        }
      } else {
        phraseMap.set(normalized, {
          phrase: normalized,
          frequency: 1,
          sentiment,
          sources: [sourceId],
          category,
        });
      }
    }
  }
}

function normalizePhrase(phrase: string): string | null {
  // Remove extra whitespace
  let normalized = phrase.replace(/\s+/g, ' ').trim();

  // Remove trailing punctuation
  normalized = normalized.replace(/[.,!?;:]+$/, '');

  // Skip if too short after normalization
  if (normalized.length < 5) return null;

  // Skip if mostly numbers or special chars
  const letterRatio = (normalized.match(/[a-z]/gi) || []).length / normalized.length;
  if (letterRatio < 0.7) return null;

  // Skip common filler phrases
  const fillerPhrases = ['the app', 'this app', 'an app', 'a way', 'the way'];
  if (fillerPhrases.some(f => normalized === f)) return null;

  return normalized;
}

function cleanSearchTerm(phrase: string): string {
  return phrase
    .replace(/^(i |my |the |a |an |to |how |why |does |has |is |are |what |can )/i, '')
    .replace(/['"]/g, '')
    .trim();
}

function flattenComments(comments: RedditComment[]): RedditComment[] {
  const result: RedditComment[] = [];

  for (const comment of comments) {
    result.push(comment);
    if (comment.replies && comment.replies.length > 0) {
      result.push(...flattenComments(comment.replies));
    }
  }

  return result;
}

// ============================================================================
// Integration with Config Generator
// ============================================================================

/**
 * Enhance search topics with extracted phrases from reviews
 * Call this in config-generator before generating the config
 */
export function enhanceSearchTopicsWithReviewLanguage(
  aiGeneratedTopics: string[],
  reviews: Review[]
): string[] {
  const extractedPhrases = extractStrugglePhrases(reviews);

  // Convert to search terms
  const extractedTerms = extractedPhrases
    .slice(0, 5)
    .map(p => cleanSearchTerm(p.phrase))
    .filter(t => t.length >= 5);

  // Combine AI-generated with extracted, removing duplicates
  const combined = new Set([...aiGeneratedTopics]);

  for (const term of extractedTerms) {
    // Check if this term is sufficiently different from existing ones
    const isDuplicate = Array.from(combined).some(existing =>
      existing.toLowerCase().includes(term.toLowerCase()) ||
      term.toLowerCase().includes(existing.toLowerCase())
    );

    if (!isDuplicate) {
      combined.add(term);
    }
  }

  return Array.from(combined).slice(0, 10); // Return top 10 combined terms
}
