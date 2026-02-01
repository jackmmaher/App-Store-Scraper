// Reddit Deep Dive Module
// Comprehensive Reddit analysis for app market research

// Core types
export * from './types';

// Config generation (JTBD-based search configuration)
export { generateRedditSearchConfig } from './config-generator';

// AI Analysis (semantic extraction with Claude)
export {
  analyzeRedditData,
  mineLanguageFromPosts,
  generateSearchTerms,
  type RedditPost,
  type RedditComment,
  type RedditStats,
  type RedditAnalysisOutput,
} from './analyzer';

// Language extraction (NLP-based phrase extraction)
export {
  extractStrugglePhrases,
  enhanceSearchTopicsWithReviewLanguage,
  type ExtractedPhrase,
  type LanguageExtractionResult,
} from './language-extractor';

// Yield tracking (performance optimization)
export {
  recordSubredditPerformance,
  recordTopicPerformance,
  recordAnalysisPerformance,
  getHighYieldSubreddits,
  getHighYieldTopics,
  type SubredditPerformance,
  type TopicPerformance,
} from './yield-tracker';
