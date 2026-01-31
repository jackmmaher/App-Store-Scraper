'use client';

import { Recommendation, GapAnalysis } from '@/lib/app-ideas/types';
import { useRouter } from 'next/navigation';

interface RecommendationCardProps {
  recommendation: Recommendation;
  gapAnalysis?: GapAnalysis;
  rank: number;
  onCreateProject?: () => void;
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

function getRankBadge(rank: number): { bg: string; text: string } {
  switch (rank) {
    case 1:
      return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' };
    case 2:
      return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300' };
    case 3:
      return { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' };
    default:
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' };
  }
}

export default function RecommendationCard({
  recommendation,
  gapAnalysis,
  rank,
  onCreateProject,
}: RecommendationCardProps) {
  const router = useRouter();
  const rankStyle = getRankBadge(rank);

  const handleCreateProject = () => {
    if (onCreateProject) {
      onCreateProject();
    } else {
      // Navigate to projects with the recommendation context
      // This could be enhanced to pre-fill project details
      router.push('/projects');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header with gradient */}
      <div className={`px-6 py-4 ${
        rank === 1
          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20'
          : 'bg-gray-50 dark:bg-gray-800/50'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 text-xs font-bold rounded ${rankStyle.bg} ${rankStyle.text}`}>
              #{rank}
            </span>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {recommendation.headline}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {recommendation.clusterName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                Score
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {recommendation.opportunityScore}
              </div>
            </div>
            <div
              className={`w-3 h-12 rounded-full ${getScoreColor(recommendation.opportunityScore)}`}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Why build this */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Why Build This
          </h4>
          <ul className="space-y-1.5">
            {recommendation.reasoning.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <span className="text-blue-500 mt-1">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>

        {/* Key Insights Grid */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
              Search Volume
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {recommendation.combinedSearchVolume}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
              Competition
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {recommendation.competitionSummary}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
              Primary Gap
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {recommendation.primaryGap}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
              Monetization
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {recommendation.suggestedMonetization}
            </div>
          </div>
        </div>

        {/* Differentiator callout */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Key Differentiator
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                {recommendation.differentiator}
              </div>
            </div>
          </div>
        </div>

        {/* MVP Scope */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            MVP Scope
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {recommendation.mvpScope}
          </p>
        </div>

        {/* Gap Analysis Details (if provided) */}
        {gapAnalysis && (
          <details className="group mb-5">
            <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Detailed Gap Analysis
            </summary>

            <div className="mt-3 pl-6 space-y-4">
              {/* Existing Features */}
              {gapAnalysis.existingFeatures.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Common Features in Competitors
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {gapAnalysis.existingFeatures.map((feature, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* User Complaints */}
              {gapAnalysis.userComplaints.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    User Pain Points
                  </h5>
                  <ul className="space-y-1">
                    {gapAnalysis.userComplaints.map((complaint, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span className="text-red-400">−</span>
                        {complaint}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {gapAnalysis.gaps.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Market Gaps
                  </h5>
                  <ul className="space-y-1">
                    {gapAnalysis.gaps.map((gap, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span className="text-green-500">+</span>
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Analyzed Apps */}
              {gapAnalysis.analyzedApps.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Top Competitors Analyzed
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {gapAnalysis.analyzedApps.slice(0, 5).map((app) => (
                      <div
                        key={app.id}
                        className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1"
                      >
                        {app.iconUrl && (
                          <img
                            src={app.iconUrl}
                            alt={app.name}
                            className="w-6 h-6 rounded"
                          />
                        )}
                        <div className="text-xs">
                          <div className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
                            {app.name}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            {app.rating.toFixed(1)}★ · {app.reviews.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* CTA */}
        <button
          onClick={handleCreateProject}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create Project
        </button>
      </div>
    </div>
  );
}
