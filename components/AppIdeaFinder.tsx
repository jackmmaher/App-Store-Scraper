'use client';

import { useState, useCallback } from 'react';
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

type WizardStep = 'start' | 'clusters' | 'scores' | 'gaps' | 'recommendations';

const STEPS: { id: WizardStep; label: string; number: number }[] = [
  { id: 'start', label: 'Start', number: 1 },
  { id: 'clusters', label: 'Clusters', number: 2 },
  { id: 'scores', label: 'Scores', number: 3 },
  { id: 'gaps', label: 'Gaps', number: 4 },
  { id: 'recommendations', label: 'Recommendations', number: 5 },
];

export default function AppIdeaFinder() {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('start');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Entry point state
  const [entryType, setEntryType] = useState<EntryType>('category');
  const [entryValue, setEntryValue] = useState('');
  const [country, setCountry] = useState('us');

  // Pipeline results
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<DiscoveredKeyword[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterScores, setClusterScores] = useState<ClusterScore[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // UI state
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  // Step 1: Discover keywords and cluster
  const handleDiscover = useCallback(async () => {
    if (!entryValue.trim()) {
      setError('Please enter a value');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingMessage('Discovering keywords...');

    try {
      const response = await fetch('/api/app-ideas/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryType,
          entryValue: entryValue.trim(),
          country,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Discovery failed');
      }

      setSessionId(data.data.sessionId);
      setKeywords(data.data.keywords);
      setClusters(data.data.clusters);
      setCurrentStep('clusters');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [entryType, entryValue, country]);

  // Step 2: Score clusters
  const handleScoreClusters = useCallback(async () => {
    if (clusters.length === 0) {
      setError('No clusters to score');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingMessage('Scoring clusters...');

    try {
      const response = await fetch('/api/app-ideas/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'score',
          clusters,
          category: entryType === 'category' ? entryValue : 'productivity',
          country,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Scoring failed');
      }

      setClusterScores(data.data.clusterScores);
      setCurrentStep('scores');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [clusters, entryType, entryValue, country]);

  // Step 3 & 4: Gap analysis and recommendations
  const handleAnalyze = useCallback(async () => {
    if (clusterScores.length === 0) {
      setError('No scored clusters to analyze');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingMessage('Analyzing top clusters...');

    try {
      const response = await fetch('/api/app-ideas/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze',
          clusterScores,
          country,
          topN: 3,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setGapAnalyses(data.data.gapAnalyses);
      setRecommendations(data.data.recommendations);
      setCurrentStep('recommendations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [clusterScores, country]);

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

  // Navigation
  const canGoBack = currentStep !== 'start';
  const getPreviousStep = (): WizardStep => {
    const stepIndex = STEPS.findIndex(s => s.id === currentStep);
    return STEPS[Math.max(0, stepIndex - 1)].id;
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          App Idea Finder
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Discover app opportunities with keyword analysis, gap identification, and actionable recommendations.
        </p>
      </div>

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

      {/* Loading overlay */}
      {isLoading && (
        <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
            <span className="text-blue-700 dark:text-blue-400 font-medium">
              {loadingMessage}
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
