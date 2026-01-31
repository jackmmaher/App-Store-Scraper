// App Idea Finder Types

// ============================================================================
// Entry Point Types
// ============================================================================

export type EntryType = 'category' | 'keyword' | 'app';

export type SessionStatus = 'discovering' | 'clustering' | 'scoring' | 'analyzing' | 'complete';

// ============================================================================
// Keyword & Cluster Types
// ============================================================================

export interface DiscoveredKeyword {
  term: string;
  priority: number;
  position: number;
}

export interface Cluster {
  id: string;
  name: string;
  keywords: string[];
  theme: string;
  keywordCount: number;
}

export interface ClusterScore {
  clusterId: string;
  clusterName: string;
  keywords: string[];

  // Aggregate scores (0-100)
  opportunityScore: number;
  competitionGap: number;
  marketDemand: number;
  revenuePotential: number;
  trendMomentum: number;
  executionFeasibility: number;

  // Reasoning from scoring
  reasoning: string;

  // Individual keyword scores for drilling down
  keywordScores?: KeywordScore[];
}

export interface KeywordScore {
  keyword: string;
  opportunityScore: number;
  competitionGap: number;
  marketDemand: number;
  revenuePotential: number;
  trendMomentum: number;
  executionFeasibility: number;
}

// ============================================================================
// Gap Analysis Types
// ============================================================================

export interface GapAnalysis {
  clusterId: string;
  clusterName: string;

  // Analysis results
  existingFeatures: string[];
  userComplaints: string[];
  gaps: string[];
  monetizationInsights: string;

  // Top apps analyzed
  analyzedApps: AnalyzedApp[];
}

export interface AnalyzedApp {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  iconUrl: string;
  price: number;
  hasSubscription: boolean;
}

// ============================================================================
// Recommendation Types
// ============================================================================

export interface Recommendation {
  clusterId: string;
  clusterName: string;

  // The main recommendation
  headline: string;
  reasoning: string[];

  // Key insights
  combinedSearchVolume: string;
  competitionSummary: string;
  primaryGap: string;
  suggestedMonetization: string;
  mvpScope: string;

  // Differentiator
  differentiator: string;

  // Scores for reference
  opportunityScore: number;
}

// ============================================================================
// Session Types
// ============================================================================

export interface AppIdeaSession {
  id: string;
  entryType: EntryType;
  entryValue: string;
  country: string;
  status: SessionStatus;

  // Pipeline results
  discoveredKeywords: DiscoveredKeyword[] | null;
  clusters: Cluster[] | null;
  clusterScores: ClusterScore[] | null;
  gapAnalyses: GapAnalysis[] | null;
  recommendations: Recommendation[] | null;

  // Timestamps
  createdAt: string;
  completedAt: string | null;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface DiscoverRequest {
  entryType: EntryType;
  entryValue: string;
  country?: string;
}

export interface DiscoverResponse {
  success: boolean;
  data?: {
    sessionId: string;
    keywords: DiscoveredKeyword[];
    clusters: Cluster[];
  };
  error?: string;
}

export interface ScoreClustersRequest {
  sessionId: string;
  clusters: Cluster[];
}

export interface ScoreClustersResponse {
  success: boolean;
  data?: {
    clusterScores: ClusterScore[];
  };
  error?: string;
}

export interface AnalyzeRequest {
  sessionId: string;
  clusterScores: ClusterScore[];
  topN?: number; // How many top clusters to analyze (default 3)
}

export interface AnalyzeResponse {
  success: boolean;
  data?: {
    gapAnalyses: GapAnalysis[];
    recommendations: Recommendation[];
  };
  error?: string;
}

// ============================================================================
// Claude API Types
// ============================================================================

export interface ClusteringPromptResult {
  clusters: Array<{
    name: string;
    keywords: string[];
    theme: string;
  }>;
}

export interface GapAnalysisPromptResult {
  existing_features: string[];
  user_complaints: string[];
  gaps: string[];
  monetization_insights: string;
}

export interface RecommendationPromptResult {
  headline: string;
  reasoning: string[];
  combined_search_volume: string;
  competition_summary: string;
  primary_gap: string;
  suggested_monetization: string;
  mvp_scope: string;
  differentiator: string;
}
