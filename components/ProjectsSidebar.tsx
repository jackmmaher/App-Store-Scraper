'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AppProject } from '@/lib/supabase';

interface ProjectsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectSelect?: (project: AppProject) => void;
  currentProjectId?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export default function ProjectsSidebar({
  isOpen,
  onClose,
  onProjectSelect,
  currentProjectId,
}: ProjectsSidebarProps) {
  const [projects, setProjects] = useState<Record<string, AppProject[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects?groupByCategory=true');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
        // Auto-expand categories with projects
        setExpandedCategories(new Set(Object.keys(data.projects)));
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    e.preventDefault();

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

  const totalProjects = Object.values(projects).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-[85vw] max-w-80 bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              My Projects
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalProjects} saved {totalProjects === 1 ? 'project' : 'projects'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg
                className="animate-spin h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : totalProjects === 0 ? (
            <div className="text-center py-8">
              <svg
                className="w-12 h-12 mx-auto text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 mb-2">No projects yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Scrape reviews and run AI analysis to create your first project
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(projects)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, categoryProjects]) => (
                  <div key={category}>
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            expandedCategories.has(category) ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span>{category}</span>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                        {categoryProjects.length}
                      </span>
                    </button>

                    {/* Projects in Category */}
                    {expandedCategories.has(category) && (
                      <div className="ml-4 mt-1 space-y-1">
                        {categoryProjects.map((project) => (
                          <div
                            key={project.id}
                            className={`group relative ${
                              currentProjectId === project.id
                                ? 'bg-blue-50 dark:bg-blue-900/30'
                                : ''
                            }`}
                          >
                            <Link
                              href={`/projects/${project.id}`}
                              onClick={() => onProjectSelect?.(project)}
                              className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                                currentProjectId === project.id
                                  ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500'
                                  : ''
                              }`}
                            >
                              {project.app_icon_url ? (
                                <img
                                  src={project.app_icon_url}
                                  alt=""
                                  className="w-8 h-8 rounded-lg"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-600" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {project.app_name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                  <span>{project.review_count} reviews</span>
                                  {project.ai_analysis && (
                                    <span className="text-green-600 dark:text-green-400">
                                      AI
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Link>
                            {/* Delete button */}
                            <button
                              onClick={(e) => handleDelete(e, project.id)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                              title="Delete project"
                            >
                              <svg
                                className="w-4 h-4 text-red-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Link
            href="/projects"
            className="block w-full py-2 text-center text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            View All Projects
          </Link>
        </div>
      </div>
    </>
  );
}
