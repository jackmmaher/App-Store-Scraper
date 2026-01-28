'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Header from './Header';
import { AppConcept, AppProject, WireframeData } from '@/lib/supabase';
import { formatDate } from '@/lib/formatting';
import WireframeEditor from './wireframe/WireframeEditor';
import InsightsPanel from './concept/InsightsPanel';
import SystemRequirements from './concept/SystemRequirements';
import ExportPanel from './concept/ExportPanel';

interface ConceptDetailPageProps {
  conceptId: string;
}

type TabType = 'insights' | 'wireframes' | 'system' | 'export';

export default function ConceptDetailPage({ conceptId }: ConceptDetailPageProps) {
  const router = useRouter();
  const [concept, setConcept] = useState<AppConcept | null>(null);
  const [linkedProjects, setLinkedProjects] = useState<AppProject[]>([]);
  const [allProjects, setAllProjects] = useState<AppProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('wireframes');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  const fetchConcept = useCallback(async () => {
    try {
      const res = await fetch(`/api/concepts/${conceptId}`);
      if (res.ok) {
        const data = await res.json();
        setConcept(data.concept);
      } else {
        router.push('/concepts');
      }
    } catch (error) {
      console.error('Error fetching concept:', error);
      router.push('/concepts');
    }
  }, [conceptId, router]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        // Projects may come grouped or as array
        if (Array.isArray(data.projects)) {
          setAllProjects(data.projects);
        } else if (data.projects) {
          const flat = Object.values(data.projects).flat() as AppProject[];
          setAllProjects(flat);
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConcept(), fetchProjects()]);
      setLoading(false);
    };
    loadData();
  }, [fetchConcept, fetchProjects]);

  // Update linked projects when concept or allProjects changes
  useEffect(() => {
    if (concept && allProjects.length > 0) {
      const linked = allProjects.filter((p) =>
        concept.linked_project_ids.includes(p.id)
      );
      setLinkedProjects(linked);
    }
  }, [concept, allProjects]);

  const handleSaveWireframe = async (wireframeData: WireframeData) => {
    try {
      const res = await fetch(`/api/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wireframe_data: wireframeData }),
      });

      if (res.ok) {
        const data = await res.json();
        setConcept(data.concept);
      }
    } catch (error) {
      console.error('Error saving wireframe:', error);
    }
  };

  const handleUpdateLinkedProjects = async (projectIds: string[]) => {
    try {
      const res = await fetch(`/api/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_project_ids: projectIds }),
      });

      if (res.ok) {
        const data = await res.json();
        setConcept(data.concept);
        setShowLinkModal(false);
      }
    } catch (error) {
      console.error('Error updating linked projects:', error);
    }
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) return;

    try {
      const res = await fetch(`/api/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tempName.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setConcept(data.concept);
        setEditingName(false);
      }
    } catch (error) {
      console.error('Error updating name:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this concept?')) return;

    try {
      const res = await fetch(`/api/concepts/${conceptId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/concepts');
      }
    } catch (error) {
      console.error('Error deleting concept:', error);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
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
      </>
    );
  }

  if (!concept) {
    return null;
  }

  const screenCount = Object.keys(concept.wireframe_data?.screens || {}).length;

  return (
    <>
      <Header />
      <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Concept Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/concepts')}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>

              {editingName ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    className="px-2 py-1 text-lg font-semibold border border-blue-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900 rounded"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div>
                  <h1
                    className="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600"
                    onClick={() => {
                      setTempName(concept.name);
                      setEditingName(true);
                    }}
                    title="Click to edit name"
                  >
                    {concept.name}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {linkedProjects.length} projects linked • {screenCount} screens{concept.updated_at ? ` • Updated ${formatDate(concept.updated_at)}` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowLinkModal(true)}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center space-x-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>Link Projects</span>
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              title="Delete concept"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mt-4 border-b border-gray-200 dark:border-gray-700 -mb-px">
          {(['insights', 'wireframes', 'system', 'export'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              {tab === 'insights' && 'Insights'}
              {tab === 'wireframes' && 'Wireframes'}
              {tab === 'system' && 'System'}
              {tab === 'export' && 'Export'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'insights' && (
          <InsightsPanel linkedProjects={linkedProjects} />
        )}

        {activeTab === 'wireframes' && concept.wireframe_data && (
          <WireframeEditor
            initialData={concept.wireframe_data}
            onSave={handleSaveWireframe}
          />
        )}

        {activeTab === 'system' && concept.wireframe_data && (
          <SystemRequirements wireframeData={concept.wireframe_data} />
        )}

        {activeTab === 'export' && concept.wireframe_data && (
          <ExportPanel
            conceptName={concept.name}
            conceptDescription={concept.description || undefined}
            linkedProjects={linkedProjects}
            wireframeData={concept.wireframe_data}
          />
        )}
      </div>

        {/* Link Projects Modal */}
        {showLinkModal && (
          <LinkProjectsModal
            allProjects={allProjects}
            linkedProjectIds={concept.linked_project_ids}
            onSave={handleUpdateLinkedProjects}
            onClose={() => setShowLinkModal(false)}
          />
        )}
      </div>
    </>
  );
}

interface LinkProjectsModalProps {
  allProjects: AppProject[];
  linkedProjectIds: string[];
  onSave: (projectIds: string[]) => void;
  onClose: () => void;
}

function LinkProjectsModal({
  allProjects,
  linkedProjectIds,
  onSave,
  onClose,
}: LinkProjectsModalProps) {
  const [selected, setSelected] = useState<string[]>(linkedProjectIds);

  const toggleProject = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Link Projects
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select competitor projects to analyze for this concept
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {allProjects.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No projects available. Create projects first.
            </p>
          ) : (
            <div className="space-y-2">
              {allProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <img
                    src={project.app_icon_url || '/placeholder-icon.png'}
                    alt=""
                    className="w-10 h-10 rounded-lg ml-3"
                  />
                  <div className="ml-3 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {project.app_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {project.app_developer} • {project.app_review_count?.toLocaleString() || 0} reviews
                    </p>
                  </div>
                  {project.ai_analysis && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs rounded-full">
                      Analyzed
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {selected.length} project{selected.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(selected)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
