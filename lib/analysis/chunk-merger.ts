/**
 * Chunk Merger
 *
 * Takes an array of ChunkAnalysisResult objects and merges them into a single
 * deduplicated, aggregated result. Pain points with similar titles (>70% word
 * overlap) are merged. Mention counts are summed. Quotes are combined and
 * capped at 5 per item. Results are ranked by frequency descending.
 */

import type { ChunkAnalysisResult } from './batch-processor';

// ============================================
// Types
// ============================================

export interface MergedAnalysisResult {
  painPoints: Array<{
    id: string;
    title: string;
    category: 'bug' | 'missing_feature' | 'ux_issue' | 'pricing' | 'performance';
    severity: 'critical' | 'high' | 'medium' | 'low';
    frequency: number;
    quotes: string[];
    chunksFound: number;
  }>;
  featureRequests: Array<{
    id: string;
    feature: string;
    frequency: number;
    quotes: string[];
    chunksFound: number;
  }>;
  competitorMentions: Array<{
    app: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    contexts: string[];
    mentionCount: number;
  }>;
  userSegments: Array<{
    segment: string;
    needs: string[];
    painPoints: string[];
  }>;
  meta: {
    totalReviews: number;
    chunksProcessed: number;
    processingTime: number;
  };
}

// ============================================
// Merge Function
// ============================================

/**
 * Merges multiple chunk analysis results into a single deduplicated result.
 *
 * @param chunks - Array of per-chunk analysis results
 * @param totalReviews - Total number of reviews processed across all chunks
 * @param processingTimeMs - Total processing time in milliseconds
 * @returns Merged, deduplicated, and ranked analysis result
 */
export function mergeChunkResults(
  chunks: ChunkAnalysisResult[],
  totalReviews: number,
  processingTimeMs: number,
): MergedAnalysisResult {
  const mergedPainPoints = mergePainPoints(chunks);
  const mergedFeatureRequests = mergeFeatureRequests(chunks);
  const mergedCompetitorMentions = mergeCompetitorMentions(chunks);
  const mergedUserSegments = mergeUserSegments(chunks);

  return {
    painPoints: mergedPainPoints,
    featureRequests: mergedFeatureRequests,
    competitorMentions: mergedCompetitorMentions,
    userSegments: mergedUserSegments,
    meta: {
      totalReviews,
      chunksProcessed: chunks.length,
      processingTime: processingTimeMs,
    },
  };
}

// ============================================
// Pain Points Merging
// ============================================

interface PainPointAccumulator {
  title: string;
  category: 'bug' | 'missing_feature' | 'ux_issue' | 'pricing' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  totalMentions: number;
  allQuotes: string[];
  chunksFound: number;
}

function mergePainPoints(chunks: ChunkAnalysisResult[]) {
  const accumulated: PainPointAccumulator[] = [];

  for (const chunk of chunks) {
    for (const pp of chunk.painPoints) {
      const existing = findSimilarPainPoint(accumulated, pp.title);

      if (existing) {
        existing.totalMentions += pp.mentions;
        existing.allQuotes.push(...pp.quotes);
        existing.chunksFound += 1;
        // Escalate severity if a chunk reports higher severity
        existing.severity = higherSeverity(existing.severity, pp.severity);
      } else {
        accumulated.push({
          title: pp.title,
          category: pp.category,
          severity: pp.severity,
          totalMentions: pp.mentions,
          allQuotes: [...pp.quotes],
          chunksFound: 1,
        });
      }
    }
  }

  // Sort by frequency descending, then by severity
  return accumulated
    .sort((a, b) => {
      if (b.totalMentions !== a.totalMentions) {
        return b.totalMentions - a.totalMentions;
      }
      return severityRank(b.severity) - severityRank(a.severity);
    })
    .map((pp) => ({
      id: crypto.randomUUID(),
      title: pp.title,
      category: pp.category,
      severity: pp.severity,
      frequency: pp.totalMentions,
      quotes: deduplicateQuotes(pp.allQuotes).slice(0, 5),
      chunksFound: pp.chunksFound,
    }));
}

function findSimilarPainPoint(
  accumulated: PainPointAccumulator[],
  title: string,
): PainPointAccumulator | undefined {
  for (const existing of accumulated) {
    if (titleSimilarity(existing.title, title) > 0.7) {
      return existing;
    }
  }
  return undefined;
}

// ============================================
// Feature Requests Merging
// ============================================

interface FeatureRequestAccumulator {
  feature: string;
  totalMentions: number;
  allQuotes: string[];
  chunksFound: number;
}

function mergeFeatureRequests(chunks: ChunkAnalysisResult[]) {
  const accumulated: FeatureRequestAccumulator[] = [];

  for (const chunk of chunks) {
    for (const fr of chunk.featureRequests) {
      const existing = findSimilarFeatureRequest(accumulated, fr.feature);

      if (existing) {
        existing.totalMentions += fr.mentions;
        existing.allQuotes.push(...fr.quotes);
        existing.chunksFound += 1;
      } else {
        accumulated.push({
          feature: fr.feature,
          totalMentions: fr.mentions,
          allQuotes: [...fr.quotes],
          chunksFound: 1,
        });
      }
    }
  }

  return accumulated
    .sort((a, b) => b.totalMentions - a.totalMentions)
    .map((fr) => ({
      id: crypto.randomUUID(),
      feature: fr.feature,
      frequency: fr.totalMentions,
      quotes: deduplicateQuotes(fr.allQuotes).slice(0, 5),
      chunksFound: fr.chunksFound,
    }));
}

function findSimilarFeatureRequest(
  accumulated: FeatureRequestAccumulator[],
  feature: string,
): FeatureRequestAccumulator | undefined {
  for (const existing of accumulated) {
    if (titleSimilarity(existing.feature, feature) > 0.7) {
      return existing;
    }
  }
  return undefined;
}

// ============================================
// Competitor Mentions Merging
// ============================================

interface CompetitorAccumulator {
  app: string;
  sentimentCounts: { positive: number; negative: number; neutral: number };
  contexts: string[];
}

function mergeCompetitorMentions(chunks: ChunkAnalysisResult[]) {
  const byApp = new Map<string, CompetitorAccumulator>();

  for (const chunk of chunks) {
    for (const cm of chunk.competitorMentions) {
      const normalizedApp = cm.app.trim().toLowerCase();
      const existing = byApp.get(normalizedApp);

      if (existing) {
        existing.sentimentCounts[cm.sentiment] += 1;
        if (cm.context && !existing.contexts.includes(cm.context)) {
          existing.contexts.push(cm.context);
        }
      } else {
        byApp.set(normalizedApp, {
          app: cm.app, // Preserve original casing from first occurrence
          sentimentCounts: {
            positive: cm.sentiment === 'positive' ? 1 : 0,
            negative: cm.sentiment === 'negative' ? 1 : 0,
            neutral: cm.sentiment === 'neutral' ? 1 : 0,
          },
          contexts: cm.context ? [cm.context] : [],
        });
      }
    }
  }

  return Array.from(byApp.values())
    .sort((a, b) => {
      const totalA =
        a.sentimentCounts.positive + a.sentimentCounts.negative + a.sentimentCounts.neutral;
      const totalB =
        b.sentimentCounts.positive + b.sentimentCounts.negative + b.sentimentCounts.neutral;
      return totalB - totalA;
    })
    .map((acc) => {
      const total =
        acc.sentimentCounts.positive +
        acc.sentimentCounts.negative +
        acc.sentimentCounts.neutral;

      // Overall sentiment is whichever has the most mentions
      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (
        acc.sentimentCounts.positive >= acc.sentimentCounts.negative &&
        acc.sentimentCounts.positive >= acc.sentimentCounts.neutral
      ) {
        sentiment = 'positive';
      } else if (
        acc.sentimentCounts.negative >= acc.sentimentCounts.positive &&
        acc.sentimentCounts.negative >= acc.sentimentCounts.neutral
      ) {
        sentiment = 'negative';
      }

      return {
        app: acc.app,
        sentiment,
        contexts: acc.contexts.slice(0, 5),
        mentionCount: total,
      };
    });
}

// ============================================
// User Segments Merging
// ============================================

function mergeUserSegments(chunks: ChunkAnalysisResult[]) {
  const bySegment = new Map<
    string,
    { segment: string; needs: Set<string>; painPoints: Set<string> }
  >();

  for (const chunk of chunks) {
    for (const seg of chunk.userSegments) {
      const normalizedSegment = seg.segment.trim().toLowerCase();
      const existing = bySegment.get(normalizedSegment);

      if (existing) {
        for (const need of seg.needs) {
          existing.needs.add(need);
        }
        for (const pp of seg.painPoints) {
          existing.painPoints.add(pp);
        }
      } else {
        bySegment.set(normalizedSegment, {
          segment: seg.segment, // Preserve original casing
          needs: new Set(seg.needs),
          painPoints: new Set(seg.painPoints),
        });
      }
    }
  }

  return Array.from(bySegment.values()).map((seg) => ({
    segment: seg.segment,
    needs: Array.from(seg.needs),
    painPoints: Array.from(seg.painPoints),
  }));
}

// ============================================
// Similarity & Utility Functions
// ============================================

/**
 * Computes word-level Jaccard similarity between two titles.
 * Returns a value between 0 and 1. If >0.7, the titles are considered duplicates.
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = normalizeTitle(a);
  const wordsB = normalizeTitle(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Normalizes a title into a set of lowercase words, removing common stop words
 * and punctuation for better deduplication matching.
 */
function normalizeTitle(title: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'not', 'no', 'but', 'if', 'so', 'as', 'it',
    'its', 'this', 'that', 'these', 'those', 'when', 'while',
  ]);

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  return new Set(words);
}

/**
 * Deduplicates quotes by normalized comparison, keeping the first occurrence
 * of each unique quote.
 */
function deduplicateQuotes(quotes: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const quote of quotes) {
    const normalized = quote.trim().toLowerCase();
    if (!seen.has(normalized) && normalized.length > 0) {
      seen.add(normalized);
      unique.push(quote.trim());
    }
  }

  return unique;
}

// ============================================
// Severity Helpers
// ============================================

const SEVERITY_RANKS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function severityRank(severity: string): number {
  return SEVERITY_RANKS[severity] ?? 0;
}

function higherSeverity(
  a: 'critical' | 'high' | 'medium' | 'low',
  b: 'critical' | 'high' | 'medium' | 'low',
): 'critical' | 'high' | 'medium' | 'low' {
  return severityRank(a) >= severityRank(b) ? a : b;
}
