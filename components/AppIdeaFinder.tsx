'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORY_NAMES, COUNTRY_CODES, MAIN_CATEGORIES } from '@/lib/constants';
import {
  DiscoveredKeyword,
  Cluster,
  ClusterScore,
  GapAnalysis,
  Recommendation,
  EntryType,
} from '@/lib/app-ideas/types';
import ClusterCard from './app-ideas/ClusterCard';
import RecommendationCard from './app-ideas/RecommendationCard';
import AppIdeaProgress, { ProgressStep } from './app-ideas/AppIdeaProgress';

type WizardStep = 'start' | 'clusters' | 'scores' | 'gaps' | 'recommendations';

interface PastSession {
  id: string;
  entry_type: EntryType;
  entry_value: string;
  country: string;
  status: string;
  created_at: string;
  recommendations: Recommendation[] | null;
}

const STEPS: { id: WizardStep; label: string; number: number }[] = [
  { id: 'start', label: 'Start', number: 1 },
  { id: 'clusters', label: 'Clusters', number: 2 },
  { id: 'scores', label: 'Scores', number: 3 },
  { id: 'gaps', label: 'Gaps', number: 4 },
  { id: 'recommendations', label: 'Recommendations', number: 5 },
];

export default function AppIdeaFinder() {
  const router = useRouter();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('start');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entry point state
  const [entryType, setEntryType] = useState<EntryType>('category');
  const [entryValue, setEntryValue] = useState('');
  const [country, setCountry] = useState('us');

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  const [showPastSessions, setShowPastSessions] = useState(false);

  // Pipeline results
  const [keywords, setKeywords] = useState<DiscoveredKeyword[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterScores, setClusterScores] = useState<ClusterScore[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // UI state
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [creatingProject, setCreatingProject] = useState<string | null>(null);

  // Progress state
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressTitle, setProgressTitle] = useState('');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [completedItems, setCompletedItems] = useState(0);
  const [currentItemLabel, setCurrentItemLabel] = useState('');
  const [progressMode, setProgressMode] = useState<'items' | 'keywords' | 'steps'>('items');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load past sessions on mount
  useEffect(() => {
    loadPastSessions();
  }, []);

  const loadPastSessions = async () => {
    try {
      const response = await fetch('/api/app-ideas/discover');
      const data = await response.json();
      if (data.success && data.data) {
        setPastSessions(data.data);
      }
    } catch (err) {
      console.error('Failed to load past sessions:', err);
    }
  };

  // Load a past session
  const loadSession = async (session: PastSession) => {
    setSessionId(session.id);
    setEntryType(session.entry_type);
    setEntryValue(session.entry_value);
    setCountry(session.country);
    setShowPastSessions(false);

    // Fetch full session data
    try {
      const response = await fetch(`/api/app-ideas/discover?id=${session.id}`);
      const data = await response.json();
      if (data.success && data.data) {
        const s = data.data;
        if (s.discovered_keywords) setKeywords(s.discovered_keywords);
        if (s.clusters) setClusters(s.clusters);
        if (s.cluster_scores) setClusterScores(s.cluster_scores);
        if (s.gap_analyses) setGapAnalyses(s.gap_analyses);
        if (s.recommendations) setRecommendations(s.recommendations);

        // Navigate to appropriate step
        if (s.recommendations?.length > 0) {
          setCurrentStep('recommendations');
        } else if (s.cluster_scores?.length > 0) {
          setCurrentStep('scores');
        } else if (s.clusters?.length > 0) {
          setCurrentStep('clusters');
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load session');
    }
  };

  // Step 1: Discover keywords and cluster with streaming progress
  const handleDiscover = useCallback(async () => {
    if (!entryValue.trim()) {
      setError('Please enter a value');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgressTitle('Discovering App Ideas');

    // Build initial progress steps
    const initialSteps: ProgressStep[] = [
      { id: 'discover', label: 'Discovering Keywords', status: 'pending' as const },
      { id: 'cluster', label: 'Clustering Keywords', status: 'pending' as const },
    ];
    setProgressSteps(initialSteps);
    setCurrentStepIdx(0);
    setCompletedItems(0);
    // Use keyword count for granular progress during discovery (estimate ~100 keywords)
    setTotalItems(100);
    setCurrentItemLabel('');
    setProgressMode('keywords');

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/app-ideas/discover/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryType,
          entryValue: entryValue.trim(),
          country,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Discovery failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'start':
                setSessionId(data.sessionId);
                break;

              case 'phase_start':
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? { ...s, status: 'active' as const }
                      : s
                  )
                );
                setCurrentItemLabel(data.label);
                break;

              case 'keyword_progress':
                // Update current progress with keyword count
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? {
                          ...s,
                          status: 'active' as const,
                          detail: data.message || `${data.keywordsFound} keywords found`,
                        }
                      : s
                  )
                );
                // Update progress bar with keyword count
                if (data.keywordsFound) {
                  setCompletedItems(data.keywordsFound);
                }
                if (data.latestKeyword) {
                  setCurrentItemLabel(`Found: "${data.latestKeyword}"`);
                } else if (data.message) {
                  setCurrentItemLabel(data.message);
                }
                break;

              case 'phase_complete':
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? {
                          ...s,
                          status: 'done' as const,
                          detail:
                            data.phaseId === 'discover'
                              ? `${data.keywordsFound} keywords`
                              : `${data.clustersCreated} clusters`,
                        }
                      : s
                  )
                );
                // When discover completes, switch to phase-based progress for clustering
                if (data.phaseId === 'discover') {
                  setProgressMode('items');
                  setTotalItems(2);
                  setCompletedItems(1);
                  setCurrentItemLabel('Clustering with AI...');
                } else {
                  setCompletedItems(2);
                }
                break;

              case 'complete':
                setSessionId(data.sessionId);
                setKeywords(data.keywords);
                setClusters(data.clusters);
                setCurrentStep('clusters');
                loadPastSessions();
                break;

              case 'error':
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // User cancelled
      }
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsLoading(false);
      setProgressSteps([]);
      setProgressTitle('');
      abortControllerRef.current = null;
    }
  }, [entryType, entryValue, country]);

  // Step 2: Score clusters with streaming progress
  const handleScoreClusters = useCallback(async () => {
    if (clusters.length === 0) {
      setError('No clusters to score');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgressTitle('Scoring Clusters');

    // Build initial progress steps - one per cluster
    const initialSteps: ProgressStep[] = clusters.map(c => ({
      id: c.id,
      label: c.name,
      status: 'pending' as const,
    }));
    setProgressSteps(initialSteps);
    setCurrentStepIdx(0);
    setCompletedItems(0);
    setTotalItems(clusters.length * 3); // 3 keywords per cluster
    setCurrentItemLabel('');

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/app-ideas/score/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters,
          sessionId,
          category: entryType === 'category' ? entryValue : 'productivity',
          country,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Scoring failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'start':
                setTotalItems(data.totalKeywords);
                break;

              case 'cluster_start':
                setProgressSteps(prev =>
                  prev.map((s, i) =>
                    i === data.clusterIndex
                      ? { ...s, status: 'active' as const }
                      : s
                  )
                );
                setCurrentStepIdx(data.clusterIndex);
                break;

              case 'keyword_start':
                setCurrentItemLabel(data.keyword);
                break;

              case 'keyword_complete':
                setCompletedItems(data.keywordIndex);
                setCurrentItemLabel(`${data.keyword} (${data.score})`);
                break;

              case 'cluster_complete':
                setProgressSteps(prev =>
                  prev.map((s, i) =>
                    i === data.clusterIndex
                      ? { ...s, status: 'done' as const, detail: `Score: ${data.score.opportunityScore}` }
                      : s
                  )
                );
                break;

              case 'complete':
                setClusterScores(data.clusterScores);
                setCurrentStep('scores');
                break;

              case 'error':
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // User cancelled
      }
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setIsLoading(false);
      setProgressSteps([]);
      setProgressTitle('');
      abortControllerRef.current = null;
    }
  }, [clusters, sessionId, entryType, entryValue, country]);

  // Step 3 & 4: Gap analysis and recommendations with streaming progress
  const handleAnalyze = useCallback(async () => {
    if (clusterScores.length === 0) {
      setError('No scored clusters to analyze');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgressTitle('Analyzing Markets');

    // Get top 3 clusters
    const topClusters = [...clusterScores]
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 3);

    // Build initial progress steps - gap + recommendation for each cluster
    const initialSteps: ProgressStep[] = [
      ...topClusters.map(c => ({
        id: `gap-${c.clusterId}`,
        label: `Analyze: ${c.clusterName}`,
        status: 'pending' as const,
      })),
      ...topClusters.map(c => ({
        id: `rec-${c.clusterId}`,
        label: `Recommend: ${c.clusterName}`,
        status: 'pending' as const,
      })),
    ];
    setProgressSteps(initialSteps);
    setCurrentStepIdx(0);
    setCompletedItems(0);
    setTotalItems(topClusters.length * 2); // gap + rec per cluster
    setCurrentItemLabel('');

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/app-ideas/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterScores,
          sessionId,
          country,
          topN: 3,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'start':
                setTotalItems(data.totalPhases);
                break;

              case 'phase_start':
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? { ...s, status: 'active' as const }
                      : s
                  )
                );
                setCurrentItemLabel(
                  data.phaseType === 'gap_analysis'
                    ? `Analyzing ${data.clusterName}...`
                    : `Generating recommendation for ${data.clusterName}...`
                );
                break;

              case 'phase_complete':
                setCompletedItems(data.phaseIndex);
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? {
                          ...s,
                          status: 'done' as const,
                          detail:
                            data.phaseType === 'gap_analysis'
                              ? `${data.appsAnalyzed} apps, ${data.gapsFound} gaps`
                              : data.headline?.slice(0, 30) + '...',
                        }
                      : s
                  )
                );
                break;

              case 'phase_error':
                setCompletedItems(data.phaseIndex);
                setProgressSteps(prev =>
                  prev.map(s =>
                    s.id === data.phaseId
                      ? { ...s, status: 'error' as const, detail: 'Failed' }
                      : s
                  )
                );
                break;

              case 'complete':
                setGapAnalyses(data.gapAnalyses);
                setRecommendations(data.recommendations);
                setCurrentStep('recommendations');
                loadPastSessions();
                break;

              case 'error':
                throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // User cancelled
      }
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
      setProgressSteps([]);
      setProgressTitle('');
      abortControllerRef.current = null;
    }
  }, [clusterScores, sessionId, country]);

  // Create project from recommendation
  const handleCreateProject = useCallback(async (rec: Recommendation) => {
    if (!sessionId) {
      setError('No session ID - please run the full workflow');
      return;
    }

    setCreatingProject(rec.clusterId);

    try {
      const gapAnalysis = gapAnalyses.find(g => g.clusterId === rec.clusterId);
      const clusterScore = clusterScores.find(c => c.clusterId === rec.clusterId);

      const response = await fetch('/api/app-ideas/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          recommendation: rec,
          gapAnalysis,
          clusterScore,
          country,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create project');
      }

      // Navigate to the new project
      router.push(`/projects/${data.data.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(null);
    }
  }, [sessionId, gapAnalyses, clusterScores, country, router]);

  // Cluster management
  const handleEditCluster = useCallback((cluster: Cluster, newName: string) => {
    setClusters(prev =>
      prev.map(c => (c.id === cluster.id ? { ...c, name: newName } : c))
    );
  }, []);

  const handleRemoveCluster = useCallback((clusterId: string) => {
    setClusters(prev => prev.filter(c => c.id !== clusterId));
  }, []);

  const toggleClusterExpanded = useCallback((clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  // Reset wizard
  const handleStartOver = useCallback(() => {
    setCurrentStep('start');
    setEntryValue('');
    setSessionId(null);
    setKeywords([]);
    setClusters([]);
    setClusterScores([]);
    setGapAnalyses([]);
    setRecommendations([]);
    setError(null);
    setExpandedClusters(new Set());
  }, []);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            App Idea Finder
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Discover app opportunities with keyword analysis, gap identification, and actionable recommendations.
          </p>
        </div>
        {pastSessions.length > 0 && (
          <button
            onClick={() => setShowPastSessions(!showPastSessions)}
            className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Past Sessions ({pastSessions.length})
          </button>
        )}
      </div>

      {/* Past Sessions Panel */}
      {showPastSessions && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Past Sessions</h3>
            <button
              onClick={() => setShowPastSessions(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pastSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => loadSession(session)}
                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {session.entry_type === 'category'
                        ? CATEGORY_NAMES[session.entry_value] || session.entry_value
                        : session.entry_value}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {session.entry_type} · {formatDate(session.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      session.status === 'complete'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {session.status}
                    </span>
                    {session.recommendations && session.recommendations.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {session.recommendations.length} ideas
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-blue-600 text-white'
                      : index === currentStepIndex
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 ring-2 ring-blue-600'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:block ${
                    index <= currentStepIndex
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 ${
                    index < currentStepIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading/Progress display */}
      {isLoading && progressSteps.length > 0 && (
        <div className="mb-6">
          <AppIdeaProgress
            title={progressTitle}
            steps={progressSteps}
            currentStepIndex={currentStepIdx}
            isActive={isLoading}
            totalItems={totalItems}
            completedItems={completedItems}
            currentItemLabel={currentItemLabel}
            progressMode={progressMode}
          />
        </div>
      )}

      {/* Fallback loading state (should not happen with streaming) */}
      {isLoading && progressSteps.length === 0 && (
        <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            <span className="text-blue-700 dark:text-blue-400 font-medium">
              Processing...
            </span>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {/* Step 1: Start */}
        {currentStep === 'start' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              How do you want to find app ideas?
            </h2>

            {/* Entry type selection */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { type: 'category' as EntryType, icon: '📂', label: 'Pick a Category' },
                { type: 'keyword' as EntryType, icon: '🔍', label: 'Enter a Keyword' },
                { type: 'app' as EntryType, icon: '📱', label: 'App ID' },
              ].map(({ type, icon, label }) => (
                <button
                  key={type}
                  onClick={() => {
                    setEntryType(type);
                    setEntryValue('');
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    entryType === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="font-medium text-gray-900 dark:text-white">{label}</div>
                </button>
              ))}
            </div>

            {/* Entry value input */}
            <div className="mb-6">
              {entryType === 'category' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Category
                  </label>
                  <select
                    value={entryValue}
                    onChange={(e) => setEntryValue(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a category...</option>
                    {MAIN_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_NAMES[cat]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : entryType === 'keyword' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Enter Keyword
                  </label>
                  <input
                    type="text"
                    value={entryValue}
                    onChange={(e) => setEntryValue(e.target.value)}
                    placeholder="e.g., timer app, habit tracker, meditation"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Enter App ID
                  </label>
                  <input
                    type="text"
                    value={entryValue}
                    onChange={(e) => setEntryValue(e.target.value)}
                    placeholder="e.g., 284882215 (from App Store URL)"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Find the app ID in the App Store URL: apps.apple.com/app/id
                    <span className="font-mono">123456789</span>
                  </p>
                </div>
              )}
            </div>

            {/* Country selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Country
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Object.entries(COUNTRY_CODES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Action button */}
            <button
              onClick={handleDiscover}
              disabled={isLoading || !entryValue.trim()}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Find App Ideas
            </button>
          </div>
        )}

        {/* Step 2: Clusters */}
        {currentStep === 'clusters' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Keyword Clusters
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {keywords.length} keywords grouped into {clusters.length} app concepts
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {clusters.map((cluster) => (
                <ClusterCard
                  key={cluster.id}
                  cluster={cluster}
                  onEdit={handleEditCluster}
                  onRemove={handleRemoveCluster}
                  isExpanded={expandedClusters.has(cluster.id)}
                  onToggleExpand={() => toggleClusterExpanded(cluster.id)}
                />
              ))}
            </div>

            {clusters.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No clusters available. Try a different search.
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setCurrentStep('start')}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleScoreClusters}
                disabled={isLoading || clusters.length === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                Score Clusters →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Scores */}
        {currentStep === 'scores' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Cluster Scores
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Ranked by opportunity score. Top 3 will be analyzed in detail.
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {clusterScores.map((score, index) => {
                const cluster = clusters.find(c => c.id === score.clusterId);
                if (!cluster) return null;
                return (
                  <div key={score.clusterId} className="relative">
                    {index < 3 && (
                      <div className="absolute -left-2 top-4 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                        {index + 1}
                      </div>
                    )}
                    <ClusterCard
                      cluster={cluster}
                      score={score}
                      showScores
                      isExpanded={expandedClusters.has(cluster.id)}
                      onToggleExpand={() => toggleClusterExpanded(cluster.id)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setCurrentStep('clusters')}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleAnalyze}
                disabled={isLoading || clusterScores.length === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                Analyze Top 3 →
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Recommendations */}
        {currentStep === 'recommendations' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  App Recommendations
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Actionable app ideas based on market analysis
                </p>
              </div>
              <button
                onClick={handleStartOver}
                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Start New Search
              </button>
            </div>

            <div className="space-y-6">
              {recommendations.map((rec, index) => {
                const gapAnalysis = gapAnalyses.find(g => g.clusterId === rec.clusterId);
                return (
                  <RecommendationCard
                    key={rec.clusterId}
                    recommendation={rec}
                    gapAnalysis={gapAnalysis}
                    rank={index + 1}
                    onCreateProject={() => handleCreateProject(rec)}
                    isCreating={creatingProject === rec.clusterId}
                  />
                );
              })}
            </div>

            {recommendations.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No recommendations generated. Try analyzing different clusters.
              </div>
            )}

            <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
              <button
                onClick={() => setCurrentStep('scores')}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                ← Back to Scores
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
