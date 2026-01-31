'use client';

import { useState } from 'react';

interface ClusterScore {
  opportunityScore: number;
  competitionGap: number;
  marketDemand: number;
  revenuePotential: number;
  trendMomentum: number;
  executionFeasibility: number;
  keywords?: string[];
}

interface Recommendation {
  headline: string;
  reasoning: string[];
  primaryGap: string;
  differentiator: string;
  suggestedMonetization: string;
  mvpScope: string;
}

interface AnalyzedApp {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  iconUrl: string;
  price: number;
  hasSubscription: boolean;
}

interface GapAnalysis {
  existingFeatures: string[];
  userComplaints: string[];
  gaps: string[];
  monetizationInsights: string;
  analyzedApps?: AnalyzedApp[];
}

interface AppIdeaRecommendation {
  recommendation: Recommendation;
  gapAnalysis: GapAnalysis;
  clusterScore: ClusterScore;
}

interface OriginalIdeaBriefProps {
  recommendation: AppIdeaRecommendation;
}

function ScoreBar({ label, score, color = 'blue' }: { label: string; score: number; color?: string }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-400 w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClasses[color as keyof typeof colorClasses] || colorClasses.blue} rounded-full transition-all duration-500`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-8 text-right">{score}</span>
      </div>
    </div>
  );
}

export default function OriginalIdeaBrief({ recommendation }: OriginalIdeaBriefProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showGapDetails, setShowGapDetails] = useState(false);

  const { recommendation: rec, gapAnalysis, clusterScore } = recommendation;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Project Brief</h2>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-4 sm:p-6">
          {/* Headline */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{rec.headline}</h3>
          </div>

          {/* Opportunity Score Badge */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Opportunity Score</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{clusterScore.opportunityScore}</span>
              <span className="text-xs text-gray-500">/100</span>
            </div>
          </div>

          {/* Score Bars */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-6">
            <div className="space-y-3">
              <ScoreBar label="Competition Gap" score={clusterScore.competitionGap} color="green" />
              <ScoreBar label="Market Demand" score={clusterScore.marketDemand} color="blue" />
              <ScoreBar label="Revenue Potential" score={clusterScore.revenuePotential} color="purple" />
              <ScoreBar label="Trend Momentum" score={clusterScore.trendMomentum} color="orange" />
              <ScoreBar label="Feasibility" score={clusterScore.executionFeasibility} color="yellow" />
            </div>
          </div>

          {/* Why Build This */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Why Build This</h4>
            <ul className="space-y-2">
              {rec.reasoning.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Key Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Primary Gap</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200">{rec.primaryGap}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Differentiator</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200">{rec.differentiator}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Monetization</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200">{rec.suggestedMonetization}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">MVP Scope</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200">{rec.mvpScope}</p>
            </div>
          </div>

          {/* Gap Analysis Details (Collapsible) */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
            <button
              onClick={() => setShowGapDetails(!showGapDetails)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Gap Analysis Details
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${showGapDetails ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showGapDetails && (
              <div className="p-4 pt-0 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-4 mt-4">
                  {/* Existing Features */}
                  {gapAnalysis.existingFeatures && gapAnalysis.existingFeatures.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Existing Features in Market
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {gapAnalysis.existingFeatures.map((feature, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 rounded"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* User Complaints */}
                  {gapAnalysis.userComplaints && gapAnalysis.userComplaints.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        User Pain Points
                      </h5>
                      <ul className="space-y-1">
                        {gapAnalysis.userComplaints.map((complaint, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{complaint}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Market Gaps */}
                  {gapAnalysis.gaps && gapAnalysis.gaps.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Market Gaps (Opportunities)
                      </h5>
                      <ul className="space-y-1">
                        {gapAnalysis.gaps.map((gap, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Monetization Insights */}
                  {gapAnalysis.monetizationInsights && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Monetization Patterns
                      </h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{gapAnalysis.monetizationInsights}</p>
                    </div>
                  )}

                  {/* Keywords */}
                  {clusterScore.keywords && clusterScore.keywords.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Target Keywords
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {clusterScore.keywords.slice(0, 15).map((keyword, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-xs text-blue-600 dark:text-blue-400 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
