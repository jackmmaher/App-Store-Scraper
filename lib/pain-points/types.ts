// Pain Point Registry Types
// Shared interfaces for the pain point analysis and feature matrix system

export interface PainPoint {
  id: string;
  title: string;
  description: string;
  category: 'bug' | 'missing_feature' | 'ux_issue' | 'pricing' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  frequency: number;
  sources: {
    reviews: { count: number; quotes: string[]; avgRating: number };
    reddit: { count: number; subreddits: string[]; quotes: string[] };
  };
  targetFeature: string | null;
  competitorsAffected: string[];
}

export interface FeatureMatrixEntry {
  name: string;
  competitors: Record<string, 'has' | 'partial' | 'missing'>;
  userDemand: 'high' | 'medium' | 'low';
  opportunity: boolean;
}

export interface FeatureMatrix {
  features: FeatureMatrixEntry[];
  competitors: string[];
}

export interface PainPointRegistry {
  projectId: string;
  painPoints: PainPoint[];
  featureMatrix: FeatureMatrix;
  lastUpdated: string;
}
