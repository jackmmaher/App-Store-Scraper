'use client';

import { useState, useMemo } from 'react';
import { AppProject } from '@/lib/supabase';

interface InsightsPanelProps {
  linkedProjects: AppProject[];
}

export default function InsightsPanel({ linkedProjects }: InsightsPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('overview');

  const insights = useMemo(() => {
    if (linkedProjects.length === 0) {
      return null;
    }

    // Aggregate stats
    const totalReviews = linkedProjects.reduce(
      (sum, p) => sum + (p.review_count || 0),
      0
    );
    const avgRating =
      linkedProjects.reduce((sum, p) => sum + (p.app_rating || 0), 0) /
      linkedProjects.length;

    // Extract common themes from AI analyses
    const analyses = linkedProjects
      .filter((p) => p.ai_analysis)
      .map((p) => p.ai_analysis as string);

    return {
      projectCount: linkedProjects.length,
      totalReviews,
      avgRating,
      analyses,
    };
  }, [linkedProjects]);

  if (linkedProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <svg
          className="w-16 h-16 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No linked projects
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Link competitor projects to this concept to see aggregated insights and analysis.
        </p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Linked Projects</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {insights?.projectCount}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Reviews Analyzed</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {insights?.totalReviews.toLocaleString()}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Average Rating</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {insights?.avgRating.toFixed(1)} / 5
          </p>
        </div>
      </div>

      {/* Linked Projects */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <button
          onClick={() => toggleSection('projects')}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <span className="font-semibold text-gray-900 dark:text-white">
            Competitor Overview
          </span>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${
              expandedSection === 'projects' ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expandedSection === 'projects' && (
          <div className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">App</th>
                    <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">Rating</th>
                    <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">Reviews</th>
                    <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">Category</th>
                    <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">Analysis</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedProjects.map((project) => (
                    <tr key={project.id} className="border-b border-gray-100 dark:border-gray-700">
                      <td className="py-2">
                        <div className="flex items-center space-x-2">
                          <img
                            src={project.app_icon_url || '/placeholder-icon.png'}
                            alt=""
                            className="w-8 h-8 rounded-lg"
                          />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {project.app_name}
                            </p>
                            <p className="text-xs text-gray-500">{project.app_developer}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-gray-900 dark:text-white">
                        {project.app_rating?.toFixed(1) || '-'}
                      </td>
                      <td className="py-2 text-gray-900 dark:text-white">
                        {project.app_review_count?.toLocaleString() || '-'}
                      </td>
                      <td className="py-2 text-gray-500 dark:text-gray-400">
                        {project.app_primary_genre || '-'}
                      </td>
                      <td className="py-2">
                        {project.ai_analysis ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs rounded-full">
                            Available
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-xs rounded-full">
                            None
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* AI Analyses */}
      {insights?.analyses && insights.analyses.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <button
            onClick={() => toggleSection('analysis')}
            className="w-full px-4 py-3 flex items-center justify-between text-left"
          >
            <span className="font-semibold text-gray-900 dark:text-white">
              AI Analysis Summary
            </span>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${
                expandedSection === 'analysis' ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'analysis' && (
            <div className="px-4 pb-4 space-y-4">
              {linkedProjects
                .filter((p) => p.ai_analysis)
                .map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <img
                        src={project.app_icon_url || '/placeholder-icon.png'}
                        alt=""
                        className="w-6 h-6 rounded"
                      />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {project.app_name}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {project.ai_analysis}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
