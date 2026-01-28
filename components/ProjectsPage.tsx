'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from './Header';
import type { AppProject } from '@/lib/supabase';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Record<string, AppProject[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects?groupByCategory=true');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProjects();
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const allProjects = Object.values(projects).flat();
  const filteredProjects = searchQuery
    ? allProjects.filter(
        (p) =>
          p.app_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.app_developer?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allProjects;

  const totalProjects = allProjects.length;
  const projectsWithAnalysis = allProjects.filter((p) => p.ai_analysis).length;
  const totalReviews = allProjects.reduce((sum, p) => sum + p.review_count, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              My Projects
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Saved app research with cached reviews and AI analysis
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Projects</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalProjects}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">With AI Analysis</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {projectsWithAnalysis}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Reviews Saved</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatNumber(totalReviews)}
            </p>
          </div>
        </div>

        {/* Search and View Toggle */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : totalProjects === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No projects yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Scrape reviews and run AI analysis on an app to create your first project.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Start a New Search
            </Link>
          </div>
        ) : searchQuery && filteredProjects.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No projects match "{searchQuery}"
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View - Grouped by Category */
          <div className="space-y-8">
            {(searchQuery
              ? [['Search Results', filteredProjects]]
              : Object.entries(projects).sort(([a], [b]) => a.localeCompare(b))
            ).map(([category, categoryProjects]) => (
              <div key={category}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  {category}
                  <span className="text-sm font-normal text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {(categoryProjects as AppProject[]).length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(categoryProjects as AppProject[]).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-4 group"
                    >
                      <div className="flex items-start gap-3">
                        {project.app_icon_url ? (
                          <img
                            src={project.app_icon_url}
                            alt=""
                            className="w-12 h-12 rounded-xl"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {project.app_name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {project.app_developer}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-sm">
                        <span className="text-gray-600 dark:text-gray-300">
                          {formatNumber(project.review_count)} reviews
                        </span>
                        {project.ai_analysis && (
                          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            AI Analysis
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-gray-400">
                        Updated {formatDate(project.updated_at)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">App</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reviews</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Analysis</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} className="flex items-center gap-3">
                        {project.app_icon_url ? (
                          <img src={project.app_icon_url} alt="" className="w-10 h-10 rounded-lg" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white hover:text-blue-600">
                            {project.app_name}
                          </p>
                          <p className="text-xs text-gray-500">{project.app_developer}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {project.app_primary_genre || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {formatNumber(project.review_count)}
                    </td>
                    <td className="px-4 py-3">
                      {project.ai_analysis ? (
                        <span className="text-green-600 dark:text-green-400 text-sm">Yes</span>
                      ) : (
                        <span className="text-gray-400 text-sm">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(project.updated_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(project.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
