// Execution Feasibility Score Calculator
// Measures how easy it is to build a competitive MVP

import {
  ExecutionFeasibilityBreakdown,
  TopAppData,
} from '../types';
import {
  EXECUTION_FEASIBILITY_WEIGHTS,
  THRESHOLDS,
  HARDWARE_KEYWORDS,
  API_DEPENDENCY_KEYWORDS,
} from '../constants';

// ============================================================================
// Math Utilities
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================================
// Component Calculations
// ============================================================================

/**
 * Calculate average feature count complexity (0-100)
 * More features = harder to build MVP
 */
function calculateFeatureComplexity(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 50; // Default to medium

  const featureCounts = topApps.map(app => app.feature_count);
  const avgFeatures = featureCounts.reduce((sum, f) => sum + f, 0) / featureCounts.length;

  // Scale: 3 features = 20, 10 features = 50, 25+ features = 100
  if (avgFeatures <= THRESHOLDS.FEATURE_COUNT_MIN) {
    return (avgFeatures / THRESHOLDS.FEATURE_COUNT_MIN) * 20;
  }

  if (avgFeatures <= THRESHOLDS.FEATURE_COUNT_MID) {
    const range = THRESHOLDS.FEATURE_COUNT_MID - THRESHOLDS.FEATURE_COUNT_MIN;
    const position = (avgFeatures - THRESHOLDS.FEATURE_COUNT_MIN) / range;
    return 20 + position * 30;
  }

  if (avgFeatures <= THRESHOLDS.FEATURE_COUNT_MAX) {
    const range = THRESHOLDS.FEATURE_COUNT_MAX - THRESHOLDS.FEATURE_COUNT_MID;
    const position = (avgFeatures - THRESHOLDS.FEATURE_COUNT_MID) / range;
    return 50 + position * 50;
  }

  return 100;
}

/**
 * Calculate API dependency complexity (0-100)
 * More external API dependencies = more complexity
 */
function calculateAPIDependency(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 30; // Default to low

  // Count apps that likely need external APIs
  // This is estimated from description patterns if available
  let totalDependencies = 0;

  // Check hardware requirements as proxy for API needs
  for (const app of topApps) {
    const requirements = app.requires_hardware || [];
    // Each hardware requirement often implies API integration
    totalDependencies += requirements.length;
  }

  const avgDependencies = totalDependencies / topApps.length;

  // Scale: 0 = 0, 2 = 40, 5+ = 100
  if (avgDependencies <= 0) return 0;
  if (avgDependencies <= 2) return (avgDependencies / 2) * 40;
  if (avgDependencies <= 5) return 40 + ((avgDependencies - 2) / 3) * 60;
  return 100;
}

/**
 * Calculate hardware requirement complexity (0-100)
 * More hardware requirements = harder to build/test
 */
function calculateHardwareComplexity(topApps: TopAppData[]): number {
  if (topApps.length === 0) return 20; // Default to low

  // Count unique hardware requirements across apps
  const allRequirements = new Set<string>();
  let totalRequirements = 0;

  for (const app of topApps) {
    const requirements = app.requires_hardware || [];
    requirements.forEach(r => allRequirements.add(r));
    totalRequirements += requirements.length;
  }

  const avgRequirements = totalRequirements / topApps.length;
  const uniqueCount = allRequirements.size;

  // Scale based on average requirements per app
  // 0 = 0, 1 = 40, 2 = 60, 3+ = 80-100
  let avgScore: number;
  if (avgRequirements <= 0) avgScore = 0;
  else if (avgRequirements <= 1) avgScore = avgRequirements * 40;
  else if (avgRequirements <= 2) avgScore = 40 + (avgRequirements - 1) * 20;
  else avgScore = 60 + Math.min((avgRequirements - 2) / 2, 1) * 40;

  // Bonus complexity for diverse hardware needs
  const diversityBonus = Math.min(uniqueCount * 5, 20);

  return clamp(avgScore + diversityBonus, 0, 100);
}

/**
 * Detect hardware requirements from description text
 */
export function detectHardwareRequirements(description: string): string[] {
  if (!description) return [];

  const lowerDesc = description.toLowerCase();
  const detected: string[] = [];

  for (const [hardware, keywords] of Object.entries(HARDWARE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        detected.push(hardware);
        break; // Only count each hardware type once
      }
    }
  }

  return detected;
}

/**
 * Detect API dependencies from description text
 */
export function detectAPIDependencies(description: string): string[] {
  if (!description) return [];

  const lowerDesc = description.toLowerCase();
  const detected: string[] = [];

  for (const keyword of API_DEPENDENCY_KEYWORDS) {
    if (lowerDesc.includes(keyword.toLowerCase())) {
      detected.push(keyword);
    }
  }

  return detected;
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate Execution Feasibility Score (0-100)
 *
 * High score = simple to build with native-only approach
 * Formula: 100 - weighted_sum_of_complexity_factors
 *
 * Components (inverted):
 * - Avg Feature Count (40%): more features = harder MVP
 * - API Dependency Score (30%): external APIs = complexity
 * - Hardware Requirement (30%): camera/GPS/etc requirements
 */
export function calculateExecutionFeasibility(
  topApps: TopAppData[]
): ExecutionFeasibilityBreakdown {
  const featureComplexity = calculateFeatureComplexity(topApps);
  const apiDependency = calculateAPIDependency(topApps);
  const hardwareComplexity = calculateHardwareComplexity(topApps);

  // Weighted sum of complexity factors
  const totalComplexity =
    featureComplexity * EXECUTION_FEASIBILITY_WEIGHTS.avg_feature_count +
    apiDependency * EXECUTION_FEASIBILITY_WEIGHTS.api_dependency +
    hardwareComplexity * EXECUTION_FEASIBILITY_WEIGHTS.hardware_requirement;

  // Invert: higher score = easier to build
  const total = Math.round((100 - totalComplexity) * 10) / 10;

  return {
    avg_feature_count: Math.round(featureComplexity * 10) / 10,
    api_dependency_score: Math.round(apiDependency * 10) / 10,
    hardware_requirement: Math.round(hardwareComplexity * 10) / 10,
    total: clamp(total, 0, 100),
  };
}

/**
 * Estimate development effort
 */
export function estimateDevelopmentEffort(breakdown: ExecutionFeasibilityBreakdown): {
  difficulty: 'easy' | 'medium' | 'hard' | 'very-hard';
  mvp_features: number;
  requires_hardware: boolean;
  requires_backend: boolean;
  recommendation: string;
} {
  const score = breakdown.total;

  const requires_hardware = breakdown.hardware_requirement > 40;
  const requires_backend = breakdown.api_dependency_score > 50;

  // Estimate MVP feature count based on competition
  const mvp_features = Math.round(
    (100 - breakdown.avg_feature_count) / 100 * 5 + 3 // 3-8 features for MVP
  );

  if (score >= 70) {
    return {
      difficulty: 'easy',
      mvp_features,
      requires_hardware,
      requires_backend,
      recommendation: 'Native-only MVP achievable in weeks',
    };
  }

  if (score >= 50) {
    return {
      difficulty: 'medium',
      mvp_features,
      requires_hardware,
      requires_backend,
      recommendation: 'Moderate complexity - plan for focused feature set',
    };
  }

  if (score >= 30) {
    return {
      difficulty: 'hard',
      mvp_features,
      requires_hardware,
      requires_backend,
      recommendation: 'Significant development effort - consider phased approach',
    };
  }

  return {
    difficulty: 'very-hard',
    mvp_features,
    requires_hardware,
    requires_backend,
    recommendation: 'Complex implementation - ensure strong differentiation justifies effort',
  };
}

/**
 * Generate human-readable explanation of feasibility
 */
export function explainExecutionFeasibility(breakdown: ExecutionFeasibilityBreakdown): string {
  const factors: string[] = [];

  if (breakdown.avg_feature_count > 70) {
    factors.push('Complex feature sets require significant development');
  } else if (breakdown.avg_feature_count < 30) {
    factors.push('Simple feature requirements enable quick MVP');
  }

  if (breakdown.api_dependency_score > 60) {
    factors.push('Heavy API dependencies add integration complexity');
  } else if (breakdown.api_dependency_score < 20) {
    factors.push('Minimal external dependencies keep architecture simple');
  }

  if (breakdown.hardware_requirement > 60) {
    factors.push('Hardware requirements complicate development and testing');
  } else if (breakdown.hardware_requirement < 20) {
    factors.push('No special hardware needs - pure software solution');
  }

  if (factors.length === 0) {
    factors.push('Moderate technical complexity - standard app development');
  }

  return factors.join('. ') + '.';
}

/**
 * Suggest tech stack based on requirements
 */
export function suggestTechStack(breakdown: ExecutionFeasibilityBreakdown): {
  recommended: string;
  alternatives: string[];
  reasoning: string;
} {
  const hasHardware = breakdown.hardware_requirement > 40;
  const hasBackend = breakdown.api_dependency_score > 50;
  const isComplex = breakdown.avg_feature_count > 60;

  // iOS-first recommendations
  if (!hasBackend && !isComplex) {
    return {
      recommended: 'SwiftUI (iOS native)',
      alternatives: ['UIKit', 'Flutter'],
      reasoning: 'Simple native app - SwiftUI offers fastest development',
    };
  }

  if (hasBackend && !isComplex) {
    return {
      recommended: 'SwiftUI + CloudKit/Firebase',
      alternatives: ['SwiftUI + Supabase', 'React Native + Firebase'],
      reasoning: 'Backend needs met with managed services',
    };
  }

  if (hasHardware) {
    return {
      recommended: 'SwiftUI/UIKit (iOS native)',
      alternatives: ['Flutter'],
      reasoning: 'Hardware access requires native development',
    };
  }

  return {
    recommended: 'SwiftUI + custom backend',
    alternatives: ['UIKit + GraphQL', 'Flutter + Firebase'],
    reasoning: 'Complex app benefits from native performance with scalable backend',
  };
}
