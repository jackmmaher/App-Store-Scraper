// Opportunity Ranker Module Index

// Types
export * from './types';

// Constants
export * from './constants';

// Dimension Calculators
export * from './dimension-calculators';

// Trend Fetcher
export {
  fetchGoogleTrends,
  fetchRedditData,
  fetchTrendData,
  isGoogleTrendsAvailable,
  isRedditAvailable,
} from './trend-fetcher';

// Core Scorer
export {
  scoreOpportunity,
  scoreOpportunityBasic,
  scoreOpportunities,
  scoreOpportunitiesBasic,
  rankOpportunities,
  selectWinner,
} from './scorer';

// Database Operations
export {
  upsertOpportunity,
  getOpportunity,
  getOpportunityById,
  searchOpportunities,
  getTopOpportunities,
  selectOpportunity,
  markBlueprintGenerated,
  recordOpportunityHistory,
  getOpportunityHistory,
  createOpportunityJob,
  getOpportunityJob,
  updateOpportunityJobProgress,
  completeOpportunityJob,
  failOpportunityJob,
  createDailyRun,
  getTodaysDailyRun,
  updateDailyRunProgress,
  completeDailyRun,
  failDailyRun,
  getRecentDailyRuns,
  getOpportunityStats,
  getTodaysWinner,
  getExistingKeywordsForCategory,
} from './db';
