'use client';

import { useState, useEffect, useRef } from 'react';
import SearchConfigPanel from '@/components/reddit/SearchConfigPanel';
import UnmetNeedsPanel from '@/components/reddit/UnmetNeedsPanel';
import TrendsSentimentPanel from '@/components/reddit/TrendsSentimentPanel';
import RedditAnalysisProgress, { type RedditAnalysisStage } from '@/components/reddit/RedditAnalysisProgress';
import type { RedditSearchConfig, RedditAnalysisResult } from '@/lib/reddit/types';

interface AnalyzedApp {
  app_store_id: string;
  name: string;
  icon_url?: string;
  rating?: number;
  reviews?: number;
}

interface LinkedCompetitor {
  app_store_id: string;
  name: string;
  icon_url?: string;
  rating?: number;
  reviews?: number;
  scraped_reviews?: unknown[];
  ai_analysis?: string;
  scraped_at?: string;
  analyzed_at?: string;
  reddit_analysis_id?: string;
}

interface CompetitorAppsProps {
  projectId: string;
  analyzedApps: AnalyzedApp[];
  linkedCompetitors: LinkedCompetitor[];
  onRefresh: () => void;
}

export default function CompetitorApps({
  projectId,
  analyzedApps,
  linkedCompetitors,
  onRefresh,
}: CompetitorAppsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [addingApp, setAddingApp] = useState<string | null>(null);
  const [scrapingApp, setScrapingApp] = useState<string | null>(null);
  const [analyzingApp, setAnalyzingApp] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [scrapingAll, setScrapingAll] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; action: string } | null>(null);

  // Reddit Deep Dive state
  const [showRedditConfig, setShowRedditConfig] = useState<string | null>(null); // competitorId or null
  const [redditAnalysis, setRedditAnalysis] = useState<Record<string, RedditAnalysisResult>>({});
  const [redditAnalyzingId, setRedditAnalyzingId] = useState<string | null>(null); // which competitor is being analyzed
  const [redditAnalysisStage, setRedditAnalysisStage] = useState<RedditAnalysisStage>('idle');
  const [redditAnalysisError, setRedditAnalysisError] = useState<string | null>(null);
  const [isSavingSolutions, setIsSavingSolutions] = useState(false);
  const [expandedRedditAnalysis, setExpandedRedditAnalysis] = useState<string | null>(null);
  const stageTimerRef = useRef<NodeJS.Timeout | null>(null);

  const linkedIds = new Set(linkedCompetitors.map(c => c.app_store_id));
  const unlinkedApps = analyzedApps.filter(app => !linkedIds.has(app.app_store_id));

  // Compute batch operation availability
  const unscrapedCompetitors = linkedCompetitors.filter(c => !c.scraped_reviews || c.scraped_reviews.length === 0);
  const unanalyzedCompetitors = linkedCompetitors.filter(c => c.scraped_reviews && c.scraped_reviews.length > 0 && !c.ai_analysis);
  const allAnalyzed = linkedCompetitors.length > 0 && linkedCompetitors.every(c => c.ai_analysis);

  const handleAddCompetitor = async (app: AnalyzedApp) => {
    setAddingApp(app.app_store_id);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_store_id: app.app_store_id,
          name: app.name,
          icon_url: app.icon_url,
          rating: app.rating,
          reviews: app.reviews,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to add competitor');
      }

      onRefresh();
    } catch (err) {
      console.error('Error adding competitor:', err);
      alert('Failed to add competitor');
    } finally {
      setAddingApp(null);
    }
  };

  const handleAddAll = async () => {
    setAddingAll(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitors: unlinkedApps.map(app => ({
            app_store_id: app.app_store_id,
            name: app.name,
            icon_url: app.icon_url,
            rating: app.rating,
            reviews: app.reviews,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to add competitors');
      }

      onRefresh();
    } catch (err) {
      console.error('Error adding all competitors:', err);
      alert('Failed to add competitors');
    } finally {
      setAddingAll(false);
    }
  };

  const handleScrape = async (appId: string) => {
    setScrapingApp(appId);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/${appId}/scrape`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to scrape reviews');
      }

      onRefresh();
    } catch (err) {
      console.error('Error scraping reviews:', err);
      alert('Failed to scrape reviews');
    } finally {
      setScrapingApp(null);
    }
  };

  const handleAnalyze = async (appId: string) => {
    setAnalyzingApp(appId);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/${appId}/analyze`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to analyze reviews');
      }

      onRefresh();
    } catch (err) {
      console.error('Error analyzing reviews:', err);
      alert('Failed to analyze reviews');
    } finally {
      setAnalyzingApp(null);
    }
  };

  // Batch scrape all unscraped competitors
  const handleScrapeAll = async () => {
    if (unscrapedCompetitors.length === 0) return;

    setScrapingAll(true);
    setBatchProgress({ current: 0, total: unscrapedCompetitors.length, action: 'Scraping' });

    let successCount = 0;
    for (let i = 0; i < unscrapedCompetitors.length; i++) {
      const comp = unscrapedCompetitors[i];
      setBatchProgress({ current: i + 1, total: unscrapedCompetitors.length, action: 'Scraping' });

      try {
        const res = await fetch(`/api/projects/${projectId}/competitors/${comp.app_store_id}/scrape`, {
          method: 'POST',
        });

        if (res.ok) {
          successCount++;
        }
      } catch (err) {
        console.error(`Error scraping ${comp.name}:`, err);
      }
    }

    setScrapingAll(false);
    setBatchProgress(null);
    onRefresh();

    if (successCount < unscrapedCompetitors.length) {
      alert(`Scraped ${successCount}/${unscrapedCompetitors.length} competitors. Some failed.`);
    }
  };

  // Batch analyze all unanalyzed competitors
  const handleAnalyzeAll = async () => {
    if (unanalyzedCompetitors.length === 0) return;

    setAnalyzingAll(true);
    setBatchProgress({ current: 0, total: unanalyzedCompetitors.length, action: 'Analyzing' });

    let successCount = 0;
    for (let i = 0; i < unanalyzedCompetitors.length; i++) {
      const comp = unanalyzedCompetitors[i];
      setBatchProgress({ current: i + 1, total: unanalyzedCompetitors.length, action: 'Analyzing' });

      try {
        const res = await fetch(`/api/projects/${projectId}/competitors/${comp.app_store_id}/analyze`, {
          method: 'POST',
        });

        if (res.ok) {
          successCount++;
        }
      } catch (err) {
        console.error(`Error analyzing ${comp.name}:`, err);
      }
    }

    setAnalyzingAll(false);
    setBatchProgress(null);
    onRefresh();

    if (successCount < unanalyzedCompetitors.length) {
      alert(`Analyzed ${successCount}/${unanalyzedCompetitors.length} competitors. Some failed.`);
    }
  };

  const formatNumber = (n?: number) => {
    if (!n) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
      }
    };
  }, []);

  // Load existing Reddit analyses for competitors with reddit_analysis_id
  useEffect(() => {
    // Track which analyses we're loading to avoid duplicates
    const loadingIds = new Set<string>();

    const loadExistingAnalyses = async () => {
      const competitorsWithAnalysis = linkedCompetitors.filter(c => c.reddit_analysis_id);

      for (const comp of competitorsWithAnalysis) {
        // Skip if already loading or loaded
        if (loadingIds.has(comp.app_store_id)) continue;
        loadingIds.add(comp.app_store_id);

        try {
          const res = await fetch(`/api/reddit/analysis/${comp.app_store_id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.analysis) {
              setRedditAnalysis(prev => {
                // Double-check we haven't loaded this yet
                if (prev[comp.app_store_id]) return prev;
                return {
                  ...prev,
                  [comp.app_store_id]: data.analysis,
                };
              });
            }
          }
        } catch (err) {
          console.error(`Error loading Reddit analysis for ${comp.name}:`, err);
        }
      }
    };

    loadExistingAnalyses();
  }, [linkedCompetitors]);

  // Handle Reddit Deep Dive analysis
  const handleRedditAnalyze = async (config: RedditSearchConfig) => {
    setRedditAnalyzingId(config.competitorId);
    setRedditAnalysisStage('crawling');
    setRedditAnalysisError(null);
    setShowRedditConfig(null);

    // Simulate stage transitions based on typical timing
    stageTimerRef.current = setTimeout(() => {
      setRedditAnalysisStage('analyzing');
      stageTimerRef.current = setTimeout(() => {
        setRedditAnalysisStage('storing');
      }, 45000);
    }, 90000);

    try {
      const response = await fetch('/api/reddit/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      // Clear simulated timers
      if (stageTimerRef.current) {
        clearTimeout(stageTimerRef.current);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze Reddit data');
      }

      const result = await response.json();

      if (result.analysis) {
        setRedditAnalysisStage('complete');
        setRedditAnalysis(prev => ({
          ...prev,
          [config.competitorId]: result.analysis,
        }));
        setExpandedRedditAnalysis(config.competitorId);

        // Reset after showing complete
        setTimeout(() => {
          setRedditAnalysisStage('idle');
          setRedditAnalyzingId(null);
        }, 2000);
      }

      onRefresh(); // Refresh to get updated reddit_analysis_id
    } catch (error) {
      console.error('Reddit analysis failed:', error);
      setRedditAnalysisError(error instanceof Error ? error.message : 'Failed to run Reddit analysis');
      setRedditAnalysisStage('error');

      // Reset after showing error
      setTimeout(() => {
        setRedditAnalysisStage('idle');
        setRedditAnalyzingId(null);
        setShowRedditConfig(config.competitorId);
      }, 3000);
    }
  };

  const isRedditAnalyzing = redditAnalysisStage !== 'idle' && redditAnalysisStage !== 'complete' && redditAnalysisStage !== 'error';

  // Handle solution notes change for unmet needs
  const handleSolutionChange = (competitorId: string, needId: string, notes: string) => {
    setRedditAnalysis(prev => {
      const analysis = prev[competitorId];
      if (!analysis) return prev;

      return {
        ...prev,
        [competitorId]: {
          ...analysis,
          unmetNeeds: analysis.unmetNeeds.map(need =>
            need.id === needId ? { ...need, solutionNotes: notes } : need
          ),
        },
      };
    });
  };

  // Save solutions for a competitor's Reddit analysis
  const handleSaveSolutions = async (competitorId: string) => {
    const analysis = redditAnalysis[competitorId];
    if (!analysis) return;

    setIsSavingSolutions(true);
    try {
      const solutions = analysis.unmetNeeds
        .filter(need => need.solutionNotes)
        .map(need => ({
          needId: need.id,
          notes: need.solutionNotes || '',
        }));

      const response = await fetch('/api/reddit/solutions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: analysis.id,
          solutions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save solutions');
      }

      alert('Solutions saved successfully!');
    } catch (error) {
      console.error('Error saving solutions:', error);
      alert('Failed to save solutions');
    } finally {
      setIsSavingSolutions(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Analyzed Competitors</h2>
        </div>
        <div className="flex items-center gap-2">
          {unlinkedApps.length > 0 && (
            <button
              onClick={handleAddAll}
              disabled={addingAll}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {addingAll ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding...
                </>
              ) : (
                <>Add All ({unlinkedApps.length})</>
              )}
            </button>
          )}
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
      </div>

      {!isCollapsed && (
        <div className="p-4 sm:p-6">
          {/* Workflow Progress Indicator */}
          {linkedCompetitors.length > 0 && (
            <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 text-sm">
                  <span className={`flex items-center gap-1.5 ${linkedCompetitors.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Linked ({linkedCompetitors.length})
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">→</span>
                  <span className={`flex items-center gap-1.5 ${unscrapedCompetitors.length === 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                    {unscrapedCompetitors.length === 0 ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" />
                      </svg>
                    )}
                    Scraped ({linkedCompetitors.length - unscrapedCompetitors.length}/{linkedCompetitors.length})
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">→</span>
                  <span className={`flex items-center gap-1.5 ${allAnalyzed ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                    {allAnalyzed ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="2" />
                      </svg>
                    )}
                    Analyzed ({linkedCompetitors.filter(c => c.ai_analysis).length}/{linkedCompetitors.length})
                  </span>
                </div>

                {/* Batch action buttons */}
                <div className="flex items-center gap-2">
                  {unscrapedCompetitors.length > 0 && (
                    <button
                      onClick={handleScrapeAll}
                      disabled={scrapingAll || scrapingApp !== null}
                      className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {scrapingAll ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : 'Scraping...'}
                        </>
                      ) : (
                        <>Scrape All ({unscrapedCompetitors.length})</>
                      )}
                    </button>
                  )}
                  {unanalyzedCompetitors.length > 0 && (
                    <button
                      onClick={handleAnalyzeAll}
                      disabled={analyzingAll || analyzingApp !== null || scrapingAll}
                      className="px-3 py-1.5 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {analyzingAll ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          {batchProgress ? `${batchProgress.current}/${batchProgress.total}` : 'Analyzing...'}
                        </>
                      ) : (
                        <>Analyze All ({unanalyzedCompetitors.length})</>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {allAnalyzed && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  All competitor analyses complete. Ready for Blueprint generation.
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {linkedCompetitors.length === 0
              ? 'These apps were identified during gap analysis. Add them to scrape reviews for deeper competitive insights.'
              : unscrapedCompetitors.length > 0
                ? `${unscrapedCompetitors.length} competitor(s) need reviews scraped. Use "Scrape All" for batch processing.`
                : unanalyzedCompetitors.length > 0
                  ? `${unanalyzedCompetitors.length} competitor(s) need AI analysis. Use "Analyze All" for batch processing.`
                  : 'All competitors analyzed. Head to the Blueprint tab to generate your app specification.'}
          </p>

          {/* Unlinked Apps List */}
          {unlinkedApps.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Available to Add ({unlinkedApps.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {unlinkedApps.map((app) => (
                  <div
                    key={app.app_store_id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {app.icon_url ? (
                        <img src={app.icon_url} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{app.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {app.rating?.toFixed(1) || 'N/A'}★ · {formatNumber(app.reviews)} reviews
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddCompetitor(app)}
                      disabled={addingApp === app.app_store_id}
                      className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {addingApp === app.app_store_id ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        '+ Add'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Competitors */}
          {linkedCompetitors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Linked Competitors ({linkedCompetitors.length})
              </h3>
              <div className="space-y-3">
                {linkedCompetitors.map((comp) => {
                  const hasReviews = comp.scraped_reviews && comp.scraped_reviews.length > 0;
                  const hasAnalysis = !!comp.ai_analysis;

                  return (
                    <div
                      key={comp.app_store_id}
                      className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {comp.icon_url ? (
                            <img src={comp.icon_url} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{comp.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {comp.rating?.toFixed(1) || 'N/A'}★ · {formatNumber(comp.reviews)} reviews
                            </p>
                          </div>
                        </div>

                        {/* Status badges and actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasReviews && (
                            <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                              {comp.scraped_reviews?.length} reviews
                            </span>
                          )}
                          {hasAnalysis && (
                            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                              Analyzed
                            </span>
                          )}

                          {!hasReviews && (
                            <button
                              onClick={() => handleScrape(comp.app_store_id)}
                              disabled={scrapingApp === comp.app_store_id}
                              className="px-3 py-1.5 text-xs bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {scrapingApp === comp.app_store_id ? (
                                <span className="flex items-center gap-1">
                                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Scraping...
                                </span>
                              ) : (
                                'Scrape'
                              )}
                            </button>
                          )}

                          {hasReviews && !hasAnalysis && (
                            <button
                              onClick={() => handleAnalyze(comp.app_store_id)}
                              disabled={analyzingApp === comp.app_store_id}
                              className="px-3 py-1.5 text-xs bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-400 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {analyzingApp === comp.app_store_id ? (
                                <span className="flex items-center gap-1">
                                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Analyzing...
                                </span>
                              ) : (
                                'Analyze'
                              )}
                            </button>
                          )}

                          {/* Reddit Deep Dive button - shows when competitor has scraped reviews */}
                          {hasReviews ? (
                            <button
                              onClick={() => {
                                if (redditAnalysis[comp.app_store_id]) {
                                  // Toggle display of existing analysis
                                  setExpandedRedditAnalysis(
                                    expandedRedditAnalysis === comp.app_store_id ? null : comp.app_store_id
                                  );
                                } else {
                                  // Open config panel to start new analysis
                                  setShowRedditConfig(comp.app_store_id);
                                }
                              }}
                              disabled={isRedditAnalyzing && showRedditConfig === comp.app_store_id}
                              className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 ${
                                redditAnalysis[comp.app_store_id]
                                  ? 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400'
                                  : 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400'
                              }`}
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                              </svg>
                              {redditAnalysis[comp.app_store_id] ? 'Reddit Insights' : 'Reddit Deep Dive'}
                            </button>
                          ) : (
                            <button
                              disabled
                              title="Scrape reviews first to enable Reddit Deep Dive"
                              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                              </svg>
                              Reddit
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Show analysis preview if available */}
                      {hasAnalysis && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                            {comp.ai_analysis?.slice(0, 300)}...
                          </p>
                        </div>
                      )}

                      {/* Reddit Deep Dive Config Panel */}
                      {showRedditConfig === comp.app_store_id && redditAnalyzingId !== comp.app_store_id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <SearchConfigPanel
                            competitorId={comp.app_store_id}
                            competitorName={comp.name}
                            onAnalyze={handleRedditAnalyze}
                            onCancel={() => setShowRedditConfig(null)}
                            isLoading={isRedditAnalyzing}
                          />
                        </div>
                      )}

                      {/* Reddit Analysis Progress */}
                      {redditAnalyzingId === comp.app_store_id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <RedditAnalysisProgress stage={redditAnalysisStage} error={redditAnalysisError} />
                        </div>
                      )}

                      {/* Reddit Analysis Results */}
                      {redditAnalysis[comp.app_store_id] && expandedRedditAnalysis === comp.app_store_id && redditAnalyzingId !== comp.app_store_id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                              <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                              </svg>
                              Reddit Deep Dive Results
                            </h4>
                            <button
                              onClick={() => setShowRedditConfig(comp.app_store_id)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Run New Analysis
                            </button>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <UnmetNeedsPanel
                              needs={redditAnalysis[comp.app_store_id].unmetNeeds}
                              onSolutionChange={(needId, notes) => handleSolutionChange(comp.app_store_id, needId, notes)}
                              onSaveSolutions={() => handleSaveSolutions(comp.app_store_id)}
                              isSaving={isSavingSolutions}
                            />
                            <TrendsSentimentPanel
                              trends={redditAnalysis[comp.app_store_id].trends}
                              sentiment={redditAnalysis[comp.app_store_id].sentiment}
                              languagePatterns={redditAnalysis[comp.app_store_id].languagePatterns}
                              topSubreddits={redditAnalysis[comp.app_store_id].topSubreddits}
                            />
                          </div>
                          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            Analyzed {redditAnalysis[comp.app_store_id].rawData.postsAnalyzed} posts and {redditAnalysis[comp.app_store_id].rawData.commentsAnalyzed} comments
                            {' '}from {redditAnalysis[comp.app_store_id].rawData.dateRange.start.split('T')[0]} to {redditAnalysis[comp.app_store_id].rawData.dateRange.end.split('T')[0]}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {unlinkedApps.length === 0 && linkedCompetitors.length === 0 && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No competitor apps available from gap analysis
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
