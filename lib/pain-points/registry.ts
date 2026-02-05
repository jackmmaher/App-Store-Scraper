// Pain Point Registry Builder
// Merges review analysis + Reddit data into a unified pain point registry

import type { MergedAnalysisResult } from '../analysis/chunk-merger';
import type { RedditAnalysisResult } from '../reddit/types';
import type {
  PainPoint,
  FeatureMatrix,
  FeatureMatrixEntry,
  PainPointRegistry,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a deterministic ID from a title string.
 * Uses a simple hash to create a stable identifier.
 */
function generateId(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    const char = title.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `pp_${Math.abs(hash).toString(36)}`;
}

/**
 * Compute similarity between two strings using word overlap (Jaccard index).
 * Returns a value between 0 and 1 where 1 is identical.
 */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

const SIMILARITY_THRESHOLD = 0.4;

// ============================================================================
// Category inference
// ============================================================================

/**
 * Infer pain point category from text content.
 */
function inferCategory(
  title: string,
  description: string
): PainPoint['category'] {
  const text = `${title} ${description}`.toLowerCase();

  const patterns: Array<{ category: PainPoint['category']; keywords: string[] }> = [
    {
      category: 'bug',
      keywords: [
        'bug', 'crash', 'broken', 'error', 'glitch', 'freeze', 'not working',
        'fails', 'failure', 'exception', 'hang', 'stuck',
      ],
    },
    {
      category: 'performance',
      keywords: [
        'slow', 'lag', 'latency', 'memory', 'battery', 'heavy', 'bloat',
        'loading', 'takes forever', 'drain', 'resource', 'cpu', 'ram',
      ],
    },
    {
      category: 'pricing',
      keywords: [
        'price', 'pricing', 'expensive', 'cost', 'subscription', 'pay',
        'free', 'tier', 'plan', 'charge', 'fee', 'money', 'afford',
      ],
    },
    {
      category: 'ux_issue',
      keywords: [
        'confusing', 'unintuitive', 'hard to use', 'ui', 'ux', 'design',
        'layout', 'navigate', 'navigation', 'interface', 'cluttered',
        'overwhelming', 'complicated', 'difficult',
      ],
    },
    {
      category: 'missing_feature',
      keywords: [
        'missing', 'need', 'want', 'wish', 'feature', 'request', 'add',
        'support', 'integrate', 'integration', 'option', 'ability',
        'should have', 'no way to', 'cannot',
      ],
    },
  ];

  let bestCategory: PainPoint['category'] = 'missing_feature';
  let bestScore = 0;

  for (const { category, keywords } of patterns) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Map a severity string from Reddit to PainPoint severity.
 */
function mapRedditSeverity(
  severity: 'high' | 'medium' | 'low'
): PainPoint['severity'] {
  // Reddit uses 3-level severity; map to our 4-level system
  switch (severity) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

// ============================================================================
// Extract pain points from batch analysis
// ============================================================================

interface AnalysisPainPointSource {
  title: string;
  description: string;
  frequency: number;
  quotes: string[];
  avgRating: number;
  category?: string;
  severity?: string;
}

/**
 * Extract pain point-like entries from a MergedAnalysisResult.
 * The ai_analysis field is a JSON string containing structured analysis data.
 */
function extractFromBatchAnalysis(
  batchAnalysis: MergedAnalysisResult
): AnalysisPainPointSource[] {
  const results: AnalysisPainPointSource[] = [];

  // The merged analysis contains painPoints, featureRequests, and other fields
  if (batchAnalysis.painPoints && Array.isArray(batchAnalysis.painPoints)) {
    for (const pp of batchAnalysis.painPoints) {
      results.push({
        title: pp.title || 'Unknown issue',
        description: '',
        frequency: pp.frequency || 1,
        quotes: pp.quotes || [],
        avgRating: 0,
        category: pp.category,
        severity: pp.severity,
      });
    }
  }

  // negativeThemes is not part of MergedAnalysisResult; pain points with
  // high severity already cover negative themes.

  return results;
}

// ============================================================================
// Build the registry
// ============================================================================

/**
 * Build a unified PainPointRegistry by merging review analysis and Reddit data.
 *
 * Algorithm:
 * 1. Start with pain points from batch analysis (if available)
 * 2. For each Reddit unmet need, check if it matches an existing pain point
 *    (by title similarity using Jaccard index)
 * 3. If match found, merge Reddit data into the existing pain point's sources.reddit
 * 4. If no match, create a new pain point from the Reddit need
 * 5. Sort by frequency descending
 * 6. Build feature matrix from extracted feature requests
 */
export function buildPainPointRegistry(
  projectId: string,
  batchAnalysis: MergedAnalysisResult | null,
  redditAnalysis: RedditAnalysisResult | null,
  competitorNames: string[]
): PainPointRegistry {
  const painPoints: PainPoint[] = [];

  // Step 1: Extract from batch analysis
  if (batchAnalysis) {
    const extracted = extractFromBatchAnalysis(batchAnalysis);

    for (const source of extracted) {
      const category = (source.category as PainPoint['category']) ||
        inferCategory(source.title, source.description);

      const severity = (source.severity as PainPoint['severity']) ||
        (source.avgRating > 0 && source.avgRating <= 2
          ? 'critical'
          : source.avgRating <= 3
            ? 'high'
            : 'medium');

      painPoints.push({
        id: generateId(source.title),
        title: source.title,
        description: source.description,
        category,
        severity,
        frequency: source.frequency,
        sources: {
          reviews: {
            count: source.frequency,
            quotes: source.quotes.slice(0, 5),
            avgRating: source.avgRating,
          },
          reddit: { count: 0, subreddits: [], quotes: [] },
        },
        targetFeature: null,
        competitorsAffected: [],
      });
    }
  }

  // Step 2-4: Merge Reddit unmet needs
  if (redditAnalysis && redditAnalysis.unmetNeeds) {
    for (const need of redditAnalysis.unmetNeeds) {
      // Find best matching existing pain point
      let bestMatch: PainPoint | null = null;
      let bestSimilarity = 0;

      for (const pp of painPoints) {
        const sim = titleSimilarity(need.title, pp.title);
        if (sim > bestSimilarity && sim >= SIMILARITY_THRESHOLD) {
          bestSimilarity = sim;
          bestMatch = pp;
        }
      }

      const redditQuotes = need.evidence.representativeQuotes || [];
      const redditSubreddits = need.evidence.topSubreddits || [];

      if (bestMatch) {
        // Step 3: Merge into existing pain point
        bestMatch.sources.reddit = {
          count: need.evidence.postCount || 1,
          subreddits: redditSubreddits,
          quotes: redditQuotes.slice(0, 5),
        };
        // Boost frequency based on Reddit evidence
        bestMatch.frequency += need.evidence.postCount || 1;

        // Merge competitor mentions
        if (need.competitorsMentioned) {
          const existing = new Set(bestMatch.competitorsAffected);
          for (const comp of need.competitorsMentioned) {
            existing.add(comp);
          }
          bestMatch.competitorsAffected = Array.from(existing);
        }
      } else {
        // Step 4: Create new pain point from Reddit need
        const category = inferCategory(need.title, need.description);
        const severity = mapRedditSeverity(need.severity);

        painPoints.push({
          id: generateId(`reddit_${need.title}`),
          title: need.title,
          description: need.description,
          category,
          severity,
          frequency: need.evidence.postCount || 1,
          sources: {
            reviews: { count: 0, quotes: [], avgRating: 0 },
            reddit: {
              count: need.evidence.postCount || 1,
              subreddits: redditSubreddits,
              quotes: redditQuotes.slice(0, 5),
            },
          },
          targetFeature: null,
          competitorsAffected: need.competitorsMentioned || [],
        });
      }
    }
  }

  // Step 5: Sort by frequency descending
  painPoints.sort((a, b) => b.frequency - a.frequency);

  // Step 6: Build feature matrix
  const featureMatrix = generateFeatureMatrix(batchAnalysis, competitorNames);

  return {
    projectId,
    painPoints,
    featureMatrix,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// Feature Matrix Generation
// ============================================================================

/**
 * Build a competitive feature matrix from batch analysis data.
 *
 * Extracts feature requests and pain points, then cross-references with
 * competitor mentions to determine which competitors likely have or lack
 * each feature.
 */
export function generateFeatureMatrix(
  batchAnalysis: MergedAnalysisResult | null,
  competitorNames: string[]
): FeatureMatrix {
  const features: FeatureMatrixEntry[] = [];

  if (!batchAnalysis) {
    return { features: [], competitors: competitorNames };
  }

  // Extract feature requests from analysis
  const featureRequests: Array<{
    name: string;
    demand: number;
    competitors: string[];
    description: string;
  }> = [];

  if (batchAnalysis.featureRequests && Array.isArray(batchAnalysis.featureRequests)) {
    for (const fr of batchAnalysis.featureRequests) {
      featureRequests.push({
        name: fr.feature || 'Unknown feature',
        demand: fr.frequency || 1,
        competitors: [],
        description: '',
      });
    }
  }

  // Also extract from pain points that are missing_feature category
  if (batchAnalysis.painPoints && Array.isArray(batchAnalysis.painPoints)) {
    for (const pp of batchAnalysis.painPoints) {
      const cat: string = pp.category || '';
      if (
        cat === 'missing_feature' ||
        cat === 'feature_request' ||
        (pp.title && /\b(need|want|wish|missing|add|support)\b/i.test(pp.title))
      ) {
        // Avoid duplicates by checking name similarity
        const name = pp.title || 'Unknown';
        const isDuplicate = featureRequests.some(
          (fr) => titleSimilarity(fr.name, name) >= SIMILARITY_THRESHOLD
        );
        if (!isDuplicate) {
          featureRequests.push({
            name,
            demand: pp.frequency || 1,
            competitors: [],
            description: '',
          });
        }
      }
    }
  }

  // Build matrix entries
  for (const fr of featureRequests) {
    const competitorStatus: Record<string, 'has' | 'partial' | 'missing'> = {};

    for (const compName of competitorNames) {
      const compLower = compName.toLowerCase();
      const descLower = fr.description.toLowerCase();
      const mentionedComps = fr.competitors.map((c) => c.toLowerCase());

      if (mentionedComps.includes(compLower)) {
        // If competitor is mentioned in context of this feature request,
        // it likely means users are saying "competitor X has this" or
        // "I wish this had what competitor X has"
        competitorStatus[compName] = 'has';
      } else if (descLower.includes(compLower)) {
        // Partial mention in description
        competitorStatus[compName] = 'partial';
      } else {
        // No mention - unknown, default to missing
        competitorStatus[compName] = 'missing';
      }
    }

    // Determine demand level
    const userDemand: FeatureMatrixEntry['userDemand'] =
      fr.demand >= 10 ? 'high' : fr.demand >= 3 ? 'medium' : 'low';

    // Determine if this is an opportunity:
    // High demand + most competitors lack it
    const missingCount = Object.values(competitorStatus).filter(
      (v) => v === 'missing'
    ).length;
    const totalComps = competitorNames.length;
    const opportunity =
      userDemand !== 'low' &&
      (totalComps === 0 || missingCount / totalComps >= 0.5);

    features.push({
      name: fr.name,
      competitors: competitorStatus,
      userDemand,
      opportunity,
    });
  }

  // Sort: opportunities first, then by demand
  const demandOrder = { high: 0, medium: 1, low: 2 };
  features.sort((a, b) => {
    if (a.opportunity !== b.opportunity) return a.opportunity ? -1 : 1;
    return demandOrder[a.userDemand] - demandOrder[b.userDemand];
  });

  return {
    features,
    competitors: competitorNames,
  };
}
