'use client';

import { useState } from 'react';

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
