'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AppResult, Review, ReviewStats, MasterApp } from '@/lib/supabase';
import { getMasterApp, saveAppAnalysis, saveAppReviews, ensureAppInMasterDb } from '@/lib/supabase';
import { COUNTRY_CODES } from '@/lib/constants';
import { useKeywordRanking } from '@/hooks/useKeywordRanking';
import { useKeywordExtraction } from '@/hooks/useKeywordExtraction';
import StarRating from './StarRating';
import { useToast } from '@/components/ui/Toast';
import { getOperationErrorMessage } from '@/lib/errors';

interface Props {
  app: AppResult;
  country: string;
  onClose: () => void;
  onProjectSaved?: (projectId: string) => void;
  existingProjectId?: string; // If provided, updates existing project instead of creating new
}

// Filter configuration types
interface FilterConfig {
  sort: 'mostRecent' | 'mostHelpful' | 'mostFavorable' | 'mostCritical';
  enabled: boolean;
  target: number;
}

interface StealthConfig {
  baseDelay: number;
  randomization: number;
  filterCooldown: number;
  autoThrottle: boolean;
}

interface FilterStatus {
  filter: string;
  status: 'pending' | 'active' | 'complete' | 'skipped';
  count: number;
}

interface ScrapeProgress {
  currentFilter: string;
  currentFilterIndex: number;
  currentPage: number;
  maxPages: number;
  reviewsCollected: number;
  uniqueReviews: number;
  filterStatuses: FilterStatus[];
  nextRequestIn: number;
  isThrottled: boolean;
  throttleMessage?: string;
  elapsedSeconds?: number;
  phase?: 'rss' | 'browser'; // Current scraping phase
}

// Filter descriptions
const FILTER_INFO: Record<string, { label: string; description: string }> = {
  mostRecent: {
    label: 'Most Recent',
    description: 'Newest reviews first - good for tracking trends',
  },
  mostHelpful: {
    label: 'Most Helpful',
    description: 'Highly upvoted reviews - quality insights',
  },
  mostFavorable: {
    label: 'Most Favorable',
    description: '5-star reviews prioritized - what users love',
  },
  mostCritical: {
    label: 'Most Critical',
    description: '1-star reviews prioritized - pain points & bugs',
  },
};

const POPULAR_COUNTRIES = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'br', 'mx'];

export default function AppDetailModal({ app, country, onClose, onProjectSaved, existingProjectId }: Props) {
  const toast = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [analysisCopied, setAnalysisCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'analysis' | 'settings' | 'keywords'>('settings');
  const [hasScraped, setHasScraped] = useState(false);

  // Enhanced filter settings
  const [filters, setFilters] = useState<FilterConfig[]>([
    { sort: 'mostRecent', enabled: true, target: 500 },
    { sort: 'mostHelpful', enabled: true, target: 500 },
    { sort: 'mostFavorable', enabled: false, target: 500 },
    { sort: 'mostCritical', enabled: true, target: 1000 },
  ]);

  // Stealth settings
  const [stealthConfig, setStealthConfig] = useState<StealthConfig>({
    baseDelay: 2.0,
    randomization: 50,
    filterCooldown: 5.0,
    autoThrottle: true,
  });

  // Accordion state
  const [filterSectionOpen, setFilterSectionOpen] = useState(true);
  const [stealthSectionOpen, setStealthSectionOpen] = useState(false);
  const [countrySectionOpen, setCountrySectionOpen] = useState(false);

  // Country selection for scraping (default to US)
  const [scrapeCountry, setScrapeCountry] = useState('us');

  // Progress state for SSE streaming
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Review display filters
  const [ratingFilter, setRatingFilter] = useState<'all' | 1 | 2 | 3 | 4 | 5>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'mostRecent' | 'mostHelpful' | 'mostFavorable' | 'mostCritical'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'rating-high' | 'rating-low' | 'helpful'>('default');

  // Keywords - use shared hooks
  const {
    keywordInput,
    setKeywordInput,
    keywordRanks,
    checking: checkingKeyword,
    checkKeywordRank,
  } = useKeywordRanking({ appId: app.id, country });

  const {
    extractedKeywords,
    extracting: extractingKeywords,
    extractKeywords,
  } = useKeywordExtraction({ appName: app.name, appDescription: app.description });

  // Project saving
  const [savingProject, setSavingProject] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  // Master database state
  const [masterApp, setMasterApp] = useState<MasterApp | null>(null);
  const [loadingMasterData, setLoadingMasterData] = useState(true);
  const [addingToDb, setAddingToDb] = useState(false);

  // Extracted keywords scoring state
  const [scoredKeywords, setScoredKeywords] = useState<Set<string>>(new Set());
  const [scoringKeyword, setScoringKeyword] = useState<string | null>(null);
  const [bulkScoring, setBulkScoring] = useState(false);
  const [bulkScoringProgress, setBulkScoringProgress] = useState({ current: 0, total: 0 });

  // Toggle filter enabled state
  const toggleFilter = (sort: FilterConfig['sort']) => {
    setFilters(prev =>
      prev.map(f => (f.sort === sort ? { ...f, enabled: !f.enabled } : f))
    );
  };

  // Update filter target
  const updateFilterTarget = (sort: FilterConfig['sort'], target: number) => {
    setFilters(prev =>
      prev.map(f => (f.sort === sort ? { ...f, target: Math.min(Math.max(target, 100), 2000) } : f))
    );
  };

  // Calculate estimated reviews
  const estimatedReviews = filters
    .filter(f => f.enabled)
    .reduce((sum, f) => sum + f.target, 0);

  // Filter and sort displayed reviews
  const filteredReviews = reviews
    .filter(r => ratingFilter === 'all' || r.rating === ratingFilter)
    .filter(r => sourceFilter === 'all' || r.sort_source === sourceFilter)
    .sort((a, b) => {
      switch (sortBy) {
        case 'rating-high':
          return (b.rating ?? 0) - (a.rating ?? 0);
        case 'rating-low':
          return (a.rating ?? 0) - (b.rating ?? 0);
        case 'helpful':
          return (b.vote_count || 0) - (a.vote_count || 0);
        default:
          return 0;
      }
    });

  // Get unique sort sources from scraped reviews
  const availableSources = [...new Set(reviews.map(r => r.sort_source).filter((s): s is string => Boolean(s)))];

  // Start streaming scrape
  const startScrape = useCallback(async () => {
    const enabledFilters = filters.filter(f => f.enabled);
    if (enabledFilters.length === 0) {
      setError('Please enable at least one filter');
      return;
    }

    setIsScraping(true);
    setLoading(true);
    setError(null);
    setReviews([]); // Reset reviews for fresh scrape (batches will accumulate)
    setStats(null);
    setActiveTab('reviews');

    // Initialize progress
    const initialStatuses: FilterStatus[] = enabledFilters.map(f => ({
      filter: f.sort,
      status: 'pending',
      count: 0,
    }));
    setProgress({
      currentFilter: enabledFilters[0].sort,
      currentFilterIndex: 0,
      currentPage: 0,
      maxPages: 0,
      reviewsCollected: 0,
      uniqueReviews: 0,
      filterStatuses: initialStatuses,
      nextRequestIn: 0,
      isThrottled: false,
    });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/py-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          country: scrapeCountry,
          streaming: true,
          filters: enabledFilters.map(f => ({ sort: f.sort, target: f.target })),
          stealth: stealthConfig,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start scraping');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              handleSSEEvent(event, enabledFilters);
            } catch (parseErr) {
              // Log parse errors - these can indicate truncated large responses
              console.error('SSE parse error:', parseErr, 'Line length:', line.length, 'Preview:', line.slice(0, 200));
              // If this looks like a truncated complete event, show error to user
              if (line.includes('"type":"complete"') && line.length > 10000) {
                setError('Large response was truncated. Try scraping fewer reviews.');
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled - keep partial results
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setIsScraping(false);
      setLoading(false);
      setHasScraped(true);
    }
  }, [app.id, scrapeCountry, filters, stealthConfig]);

  // Handle SSE events
  const handleSSEEvent = useCallback((event: Record<string, unknown>, enabledFilters: FilterConfig[]) => {
    switch (event.type) {
      case 'start':
        // Already initialized
        break;

      case 'heartbeat':
        // Heartbeat keeps connection alive and provides estimated progress during scraping
        // Uses time-based estimates until real data arrives from filterComplete/progress events
        setProgress(prev => {
          if (!prev) return prev;
          const updatedStatuses = prev.filterStatuses.map(s =>
            s.filter === event.filter
              ? { ...s, status: 'active' as const, count: (event.filterReviewsEstimate as number) || s.count }
              : s.status === 'active' && s.filter !== event.filter
                ? { ...s, status: 'pending' as const }
                : s
          );
          return {
            ...prev,
            currentFilter: (event.filter as string) ?? prev.currentFilter,
            currentFilterIndex: (event.filterIndex as number) ?? prev.currentFilterIndex,
            filterStatuses: updatedStatuses,
            elapsedSeconds: (event.elapsedSeconds as number) ?? prev.elapsedSeconds,
            // Use estimated page/maxPages from heartbeat if we don't have real data yet
            currentPage: (event.page as number) ?? prev.currentPage,
            maxPages: (event.maxPages as number) ?? prev.maxPages,
            uniqueReviews: (event.estimatedReviews as number) ?? prev.uniqueReviews,
            phase: (event.phase as 'rss' | 'browser') ?? prev.phase,
          };
        });
        break;

      case 'progress':
        // Real progress from Python crawler with actual counts
        setProgress(prev => {
          if (!prev) return prev;
          const updatedStatuses = prev.filterStatuses.map(s =>
            s.filter === event.filter
              ? { ...s, status: 'active' as const, count: (event.filterReviewsTotal as number) ?? s.count }
              : s
          );
          return {
            ...prev,
            currentFilter: (event.filter as string) ?? prev.currentFilter,
            currentFilterIndex: (event.filterIndex as number) ?? prev.currentFilterIndex,
            currentPage: (event.page as number) ?? prev.currentPage,
            maxPages: (event.maxPages as number) ?? prev.maxPages,
            uniqueReviews: (event.totalUnique as number) ?? prev.uniqueReviews,
            filterStatuses: updatedStatuses,
            nextRequestIn: (event.nextDelayMs as number) ?? 0,
          };
        });
        break;

      case 'throttle':
        setProgress(prev =>
          prev
            ? {
                ...prev,
                isThrottled: true,
                throttleMessage: event.message as string,
              }
            : prev
        );
        break;

      case 'filterComplete':
        setProgress(prev => {
          if (!prev) return prev;
          const updatedStatuses = prev.filterStatuses.map(s =>
            s.filter === event.filter
              ? { ...s, status: 'complete' as const, count: event.reviewsCollected as number }
              : s
          );
          return { ...prev, filterStatuses: updatedStatuses, isThrottled: false };
        });
        break;

      case 'filterSkipped':
        setProgress(prev => {
          if (!prev) return prev;
          const updatedStatuses = prev.filterStatuses.map(s =>
            s.filter === event.filter ? { ...s, status: 'skipped' as const } : s
          );
          return { ...prev, filterStatuses: updatedStatuses };
        });
        break;

      case 'filterCooldown':
        setProgress(prev =>
          prev ? { ...prev, nextRequestIn: event.cooldownMs as number } : prev
        );
        break;

      case 'reviewBatch':
        // Accumulate reviews from batches (prevents SSE truncation with large payloads)
        setReviews(prev => [...prev, ...(event.reviews as Review[])]);
        // Update progress to show batch progress
        setProgress(prev => prev ? {
          ...prev,
          uniqueReviews: event.totalReviews as number,
          currentPage: event.batchNumber as number,
          maxPages: event.totalBatches as number,
        } : prev);
        break;

      case 'complete':
        // Reviews already received via batches, just set stats
        // Only set reviews if batches weren't used (backwards compatibility)
        if ((event.reviews as Review[])?.length > 0) {
          setReviews(event.reviews as Review[]);
        }
        setStats(event.stats as ReviewStats);
        setProgress(null);
        setJustScraped(true); // Trigger save to master DB
        break;

      case 'error':
        // Handle error events from the backend
        console.error('Scraping error from backend:', event.message);
        setError(event.message as string || 'An error occurred during scraping');
        setProgress(null);
        break;
    }
  }, []);

  // Cancel scrape
  const cancelScrape = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Load existing data from master database on mount
  useEffect(() => {
    const loadMasterData = async () => {
      setLoadingMasterData(true);
      try {
        const masterData = await getMasterApp(app.id);
        if (masterData) {
          setMasterApp(masterData);
          // Load existing reviews if available
          if (masterData.reviews && masterData.reviews.length > 0) {
            setReviews(masterData.reviews);
            setStats(masterData.review_stats);
            setHasScraped(true);
          }
          // Load existing analysis if available
          if (masterData.ai_analysis) {
            setAnalysis(masterData.ai_analysis);
          }
        }
      } catch (err) {
        console.error('Error loading master app data:', err);
      } finally {
        setLoadingMasterData(false);
      }
    };

    loadMasterData();
  }, [app.id]);

  // Add app to database
  const addToDatabase = async () => {
    setAddingToDb(true);
    try {
      const result = await ensureAppInMasterDb(app, country);
      if (result) {
        setMasterApp(result);
      }
    } catch (err) {
      console.error('Error adding app to database:', err);
    } finally {
      setAddingToDb(false);
    }
  };

  // Score a single extracted keyword and add to database
  const scoreExtractedKeyword = async (keyword: string) => {
    setScoringKeyword(keyword);
    try {
      const res = await fetch('/api/keywords/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          country,
          source_app_id: app.id,
          discovered_via: 'review_extraction',
        }),
      });

      if (res.ok) {
        setScoredKeywords(prev => new Set([...prev, keyword]));
      }
    } catch (err) {
      console.error('Error scoring keyword:', err);
    } finally {
      setScoringKeyword(null);
    }
  };

  // Bulk score all extracted keywords
  const bulkScoreExtractedKeywords = async () => {
    const keywordsToScore = extractedKeywords.filter(kw => !scoredKeywords.has(kw.keyword));
    if (keywordsToScore.length === 0) return;

    setBulkScoring(true);
    setBulkScoringProgress({ current: 0, total: keywordsToScore.length });

    for (let i = 0; i < keywordsToScore.length; i++) {
      const kw = keywordsToScore[i];
      try {
        const res = await fetch('/api/keywords/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: kw.keyword,
            country,
            source_app_id: app.id,
            discovered_via: 'review_extraction',
          }),
        });

        if (res.ok) {
          setScoredKeywords(prev => new Set([...prev, kw.keyword]));
        }
      } catch (err) {
        console.error('Error scoring keyword:', kw.keyword, err);
      }

      setBulkScoringProgress({ current: i + 1, total: keywordsToScore.length });
      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    setBulkScoring(false);
  };

  // Track if we just finished scraping (to trigger save to master DB)
  const [justScraped, setJustScraped] = useState(false);

  // Save reviews to master database after scraping completes
  useEffect(() => {
    if (justScraped && reviews.length > 0 && !isScraping) {
      const saveToMaster = async () => {
        try {
          // Ensure app exists in master DB first
          await ensureAppInMasterDb(app, country);
          // Save reviews
          const updated = await saveAppReviews(app.id, reviews, stats);
          if (updated) {
            setMasterApp(updated);
            console.log('[MasterDB] Saved reviews for', app.name);
          }
        } catch (err) {
          console.error('Error saving reviews to master DB:', err);
        }
        setJustScraped(false);
      };
      saveToMaster();
    }
  }, [justScraped, reviews, stats, isScraping, app, country]);

  const analyzeReviews = async () => {
    if (reviews.length === 0) return;

    setAnalyzing(true);
    setActiveTab('analysis');
    setAnalysisStatus('Preparing review data...');

    // Status message rotation
    const statusMessages = [
      'Reading through reviews...',
      'Identifying common themes...',
      'Analyzing sentiment patterns...',
      'Extracting key insights...',
      'Categorizing feedback...',
      'Finding feature requests...',
      'Detecting pain points...',
      'Summarizing findings...',
      'Generating recommendations...',
      'Finalizing analysis...',
    ];
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      statusIndex = (statusIndex + 1) % statusMessages.length;
      setAnalysisStatus(statusMessages[statusIndex]);
    }, 3000);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews,
          appName: app.name,
          category: app.primary_genre,
          rating: app.rating,
          totalReviews: app.review_count,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to analyze');
      }

      const data = await res.json();
      setAnalysis(data.analysis);

      // Save analysis to master database
      try {
        await ensureAppInMasterDb(app, country);
        const updated = await saveAppAnalysis(app.id, data.analysis, reviews, stats);
        if (updated) {
          setMasterApp(updated);
          console.log('[MasterDB] Saved analysis for', app.name);
        }
      } catch (saveErr) {
        console.error('Error saving analysis to master DB:', saveErr);
      }
    } catch (err) {
      setAnalysis(`Error: ${err instanceof Error ? err.message : 'Analysis failed'}`);
    } finally {
      clearInterval(statusInterval);
      setAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const copyAnalysis = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis);
      setAnalysisCopied(true);
      setTimeout(() => setAnalysisCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const saveAsProject = async () => {
    setSavingProject(true);

    try {
      let res;

      if (existingProjectId) {
        // Update existing project with scraped reviews
        res = await fetch(`/api/projects?id=${existingProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviews,
            review_stats: stats,
            ai_analysis: analysis,
          }),
        });
      } else {
        // Create new project
        res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app,
            reviews,
            reviewStats: stats,
            scrapeSettings: {
              filters: filters.filter(f => f.enabled),
              stealth: stealthConfig,
              primaryCountry: country,
            },
            aiAnalysis: analysis,
            country,
          }),
        });
      }

      if (!res.ok) {
        throw new Error('Failed to save project');
      }

      const data = await res.json();
      setProjectSaved(true);
      setSavedProjectId(existingProjectId || data.project.id);
      onProjectSaved?.(existingProjectId || data.project.id);
      toast.success('Project saved successfully');
    } catch (err) {
      console.error('Error saving project:', err);
      toast.error(getOperationErrorMessage('save', err));
    } finally {
      setSavingProject(false);
    }
  };

  const extractKeywordsFromReviews = () => extractKeywords(reviews);

  const exportReviewsCSV = () => {
    const headers = ['Rating', 'Title', 'Content', 'Author', 'Version', 'Country', 'Votes'];
    const rows = reviews.map((r) => [
      r.rating,
      r.title,
      r.content.replace(/"/g, '""').replace(/\n/g, ' '),
      r.author,
      r.version,
      r.country || country,
      r.vote_count,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${app.name.replace(/[^a-z0-9]/gi, '-')}-reviews-${reviews.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportReviewsJSON = () => {
    const exportData = {
      app: {
        id: app.id,
        name: app.name,
        developer: app.developer,
        rating: app.rating,
        review_count: app.review_count,
      },
      stats,
      reviews,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${app.name.replace(/[^a-z0-9]/gi, '-')}-reviews-${reviews.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Calculate overall progress percentage
  const getProgressPercentage = () => {
    if (!progress) return 0;
    const totalFilters = progress.filterStatuses.length;
    if (totalFilters === 0) return 0;

    // Count completed, skipped, and active filters
    let completedWeight = 0;
    for (const s of progress.filterStatuses) {
      if (s.status === 'complete' || s.status === 'skipped') {
        completedWeight += 1;
      } else if (s.status === 'active') {
        // For active filter, use page progress as partial completion
        const pageProgress = progress.maxPages > 0 ? Math.min(progress.currentPage / progress.maxPages, 0.95) : 0.5;
        completedWeight += pageProgress;
      }
      // pending filters contribute 0
    }

    return Math.round((completedWeight / totalFilters) * 100);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 sm:rounded-xl shadow-2xl w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3 sm:gap-4">
          {app.icon_url && (
            <img src={app.icon_url} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
              {app.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{app.developer}</p>
              {app.url && (
                <>
                  <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span className="hidden sm:inline">View in App Store</span>
                    <span className="sm:hidden">Store</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </>
              )}
              <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
              {loadingMasterData ? (
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              ) : masterApp ? (
                <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">In Database</span>
                </span>
              ) : (
                <button
                  onClick={addToDatabase}
                  disabled={addingToDb}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                >
                  {addingToDb ? (
                    <>
                      <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="hidden sm:inline">Add to Database</span>
                      <span className="sm:hidden">Add</span>
                    </>
                  )}
                </button>
              )}
              {!existingProjectId && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  {projectSaved ? (
                    <a
                      href={`/projects/${savedProjectId}`}
                      className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="hidden sm:inline">In Projects - View</span>
                      <span className="sm:hidden">View</span>
                    </a>
                  ) : (
                    <button
                      onClick={saveAsProject}
                      disabled={savingProject}
                      className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1 disabled:opacity-50"
                    >
                      {savingProject ? (
                        <>
                          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Adding...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          <span className="hidden sm:inline">Add to Project</span>
                          <span className="sm:hidden">Project</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <div className="flex items-center gap-1">
                <StarRating rating={Math.round(app.rating)} />
                <span className="text-sm text-gray-600 dark:text-gray-300 ml-1">
                  {app.rating?.toFixed(1)}
                </span>
              </div>
              <span className="text-xs sm:text-sm text-gray-500">
                {app.review_count?.toLocaleString()} reviews
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats Bar - only show after scraping */}
        {hasScraped && stats && stats.total > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {stats.total.toLocaleString()} reviews
                </span>
                <div className="flex items-center gap-2 text-xs">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <span key={rating} className="flex items-center gap-0.5">
                      <span className="text-yellow-500">{rating}★</span>
                      <span className="text-gray-500">{stats.rating_distribution[rating] || 0}</span>
                    </span>
                  ))}
                </div>
                {stats.countries_scraped && stats.countries_scraped.length > 1 && (
                  <span className="text-xs text-gray-500">
                    from {stats.countries_scraped.map(c => c.toUpperCase()).join(', ')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportReviewsCSV}
                  className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                >
                  CSV
                </button>
                <button
                  onClick={exportReviewsJSON}
                  className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                >
                  JSON
                </button>
                <button
                  onClick={analyzeReviews}
                  disabled={analyzing || reviews.length === 0}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {analyzing ? 'Analyzing...' : 'AI Analysis'}
                </button>
                {projectSaved ? (
                  <a
                    href={`/projects/${savedProjectId}`}
                    className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden sm:inline">Saved - View</span>
                    <span className="sm:hidden">View</span>
                  </a>
                ) : (
                  <button
                    onClick={saveAsProject}
                    disabled={savingProject || reviews.length === 0}
                    className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {savingProject ? (
                      <>
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        {existingProjectId ? 'Save Reviews' : 'Save'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 scrollbar-hide">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'reviews'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Reviews {hasScraped && `(${reviews.length})`}
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'analysis'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveTab('keywords')}
            className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'keywords'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Keywords
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Smart Scraping Settings
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Configure filters and stealth settings for deep review scraping. Country: {COUNTRY_CODES[country] || country.toUpperCase()}
                </p>

                {/* Filter Selection Accordion */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
                  <button
                    onClick={() => setFilterSectionOpen(!filterSectionOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-t-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">Filter Selection</span>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${filterSectionOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {filterSectionOpen && (
                    <div className="p-4 space-y-4">
                      {filters.map((filter) => (
                        <div
                          key={filter.sort}
                          className={`flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 p-3 rounded-lg border transition-colors ${
                            filter.enabled
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                              : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={filter.enabled}
                              onChange={() => toggleFilter(filter.sort)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={`font-medium text-sm sm:text-base ${filter.enabled ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                {FILTER_INFO[filter.sort].label}
                              </span>
                              <p className={`text-xs ${filter.enabled ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                {FILTER_INFO[filter.sort].description}
                              </p>
                            </div>
                          </label>
                          <div className="flex items-center gap-2 ml-7 sm:ml-0 flex-shrink-0">
                            <input
                              type="number"
                              value={filter.target}
                              onChange={(e) => updateFilterTarget(filter.sort, parseInt(e.target.value) || 500)}
                              disabled={!filter.enabled}
                              min={100}
                              max={2000}
                              step={100}
                              className={`w-20 sm:w-24 px-2 py-1 text-sm border rounded ${
                                filter.enabled
                                  ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                                  : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                              }`}
                            />
                            <span className={`text-xs ${filter.enabled ? 'text-gray-500' : 'text-gray-400'}`}>
                              reviews
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stealth Settings Accordion */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
                  <button
                    onClick={() => setStealthSectionOpen(!stealthSectionOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-t-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">Stealth Settings</span>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${stealthSectionOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {stealthSectionOpen && (
                    <div className="p-4 space-y-4">
                      {/* Base Delay Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Base Delay
                          </label>
                          <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                            {stealthConfig.baseDelay.toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="5"
                          step="0.5"
                          value={stealthConfig.baseDelay}
                          onChange={(e) => setStealthConfig(prev => ({ ...prev, baseDelay: parseFloat(e.target.value) }))}
                          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-xs text-gray-500 mt-1">Delay between each page request</p>
                      </div>

                      {/* Randomization Slider */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Randomization
                          </label>
                          <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                            ±{stealthConfig.randomization}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="10"
                          value={stealthConfig.randomization}
                          onChange={(e) => setStealthConfig(prev => ({ ...prev, randomization: parseInt(e.target.value) }))}
                          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-xs text-gray-500 mt-1">Random variance applied to delays</p>
                      </div>

                      {/* Filter Cooldown */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Filter Cooldown
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={stealthConfig.filterCooldown}
                              onChange={(e) => setStealthConfig(prev => ({
                                ...prev,
                                filterCooldown: Math.min(Math.max(parseFloat(e.target.value) || 1, 1), 30)
                              }))}
                              min={1}
                              max={30}
                              step={1}
                              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <span className="text-sm text-gray-500">seconds</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">Pause between different filter types</p>
                      </div>

                      {/* Auto-throttle Toggle */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stealthConfig.autoThrottle}
                          onChange={(e) => setStealthConfig(prev => ({ ...prev, autoThrottle: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            Auto-throttle on errors
                          </span>
                          <p className="text-xs text-gray-500">
                            Automatically increase delays if rate limited
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                {/* Country Selection Accordion */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-4">
                  <button
                    onClick={() => setCountrySectionOpen(!countrySectionOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-t-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">App Store Country</span>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${countrySectionOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {countrySectionOpen && (
                    <div className="p-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        Select which country's App Store to scrape reviews from
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {POPULAR_COUNTRIES.map((code) => (
                          <button
                            key={code}
                            onClick={() => setScrapeCountry(code)}
                            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                              scrapeCountry === code
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {COUNTRY_CODES[code]} ({code.toUpperCase()})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">
                      Target: up to {estimatedReviews.toLocaleString()} reviews
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {filters.filter(f => f.enabled).length} filter{filters.filter(f => f.enabled).length !== 1 ? 's' : ''} enabled
                    {' '}({filters.filter(f => f.enabled).map(f => FILTER_INFO[f.sort].label).join(', ')})
                    {' '} · {COUNTRY_CODES[scrapeCountry] || scrapeCountry.toUpperCase()} App Store
                  </p>
                </div>

                {/* Scrape Button */}
                <button
                  onClick={startScrape}
                  disabled={isScraping || filters.filter(f => f.enabled).length === 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isScraping ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scraping Reviews...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Start Scraping
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === 'reviews' && (
            <div>
              {/* Progress Display */}
              {isScraping && progress && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Scraping Progress</h4>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Overall Progress</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">{getProgressPercentage()}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${getProgressPercentage()}%` }}
                      />
                    </div>
                  </div>

                  {/* Current Status */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Current Filter:</span>
                      <span className="ml-2 text-gray-900 dark:text-white font-medium">
                        {FILTER_INFO[progress.currentFilter]?.label || progress.currentFilter}
                      </span>
                      <span className="ml-1 text-gray-400">
                        ({progress.currentFilterIndex + 1} of {progress.filterStatuses.length})
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Page:</span>
                      <span className="ml-2 text-gray-900 dark:text-white font-medium">
                        ~{progress.currentPage} of ~{progress.maxPages}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Reviews:</span>
                      <span className="ml-2 text-gray-900 dark:text-white font-medium">
                        {progress.uniqueReviews > 0
                          ? `~${progress.uniqueReviews.toLocaleString()} collected`
                          : 'Starting...'
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Elapsed:</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {progress.elapsedSeconds
                          ? `${Math.floor(progress.elapsedSeconds / 60)}:${String(progress.elapsedSeconds % 60).padStart(2, '0')}`
                          : '0:00'
                        }
                      </span>
                      {progress.phase && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          progress.phase === 'rss'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        }`}>
                          {progress.phase === 'rss' ? 'RSS API' : 'Browser'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Filter Status List */}
                  <div className="space-y-2 mb-4">
                    {progress.filterStatuses.map((filterStatus) => (
                      <div
                        key={filterStatus.filter}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-5 text-center">
                          {filterStatus.status === 'complete' && (
                            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {filterStatus.status === 'active' && (
                            <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                          {filterStatus.status === 'pending' && (
                            <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full inline-block" />
                          )}
                          {filterStatus.status === 'skipped' && (
                            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                        <span className={`flex-1 ${filterStatus.status === 'active' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                          {FILTER_INFO[filterStatus.filter]?.label || filterStatus.filter}
                        </span>
                        <span className="text-gray-500">
                          {filterStatus.status === 'complete'
                            ? `${filterStatus.count.toLocaleString()} reviews`
                            : filterStatus.status === 'active'
                              ? filterStatus.count > 0
                                ? `~${filterStatus.count.toLocaleString()} reviews`
                                : 'scraping...'
                              : filterStatus.status === 'pending'
                                ? 'pending'
                                : filterStatus.status === 'skipped'
                                  ? 'skipped'
                                  : ''
                          }
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Throttle Warning */}
                  {progress.isThrottled && (
                    <div className="mb-4 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-700 dark:text-yellow-300">
                      {progress.throttleMessage || 'Rate limited - adjusting delays...'}
                    </div>
                  )}

                  {/* Cancel Button */}
                  <button
                    onClick={cancelScrape}
                    className="w-full py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium rounded-lg transition-colors"
                  >
                    Cancel Scrape
                  </button>
                </div>
              )}

              {/* Loading without progress (fallback) */}
              {loading && !progress && (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400">Scraping reviews...</p>
                  <p className="text-xs text-gray-500 mt-1">This may take a moment for large requests</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg">
                  {error}
                </div>
              )}

              {!loading && !error && !hasScraped && (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Configure settings and click "Start Scraping" to fetch reviews
                  </p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    Go to Settings
                  </button>
                </div>
              )}

              {!loading && !error && hasScraped && (
                <div className="space-y-4">
                  {reviews.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No reviews found for this app.</p>
                  ) : (
                    <>
                      {/* Review Filters */}
                      <div className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                        {/* Rating Filter */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Rating:</span>
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => setRatingFilter('all')}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                ratingFilter === 'all'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                              }`}
                            >
                              All
                            </button>
                            {[5, 4, 3, 2, 1].map((rating) => (
                              <button
                                key={rating}
                                onClick={() => setRatingFilter(rating as 1 | 2 | 3 | 4 | 5)}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                  ratingFilter === rating
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                                }`}
                              >
                                {rating}★
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {/* Source Filter */}
                          {availableSources.length > 1 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Source:</span>
                              <select
                                value={sourceFilter}
                                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                <option value="all">All Sources</option>
                                {availableSources.map((source) => (
                                  <option key={source} value={source}>
                                    {FILTER_INFO[source]?.label || source}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Sort By */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sort:</span>
                            <select
                              value={sortBy}
                              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="default">Default</option>
                              <option value="rating-high">Rating (High to Low)</option>
                              <option value="rating-low">Rating (Low to High)</option>
                              <option value="helpful">Most Helpful</option>
                            </select>
                          </div>

                          {/* Results Count */}
                          <div className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">
                            {filteredReviews.length} of {reviews.length}
                          </div>
                        </div>
                      </div>

                      {/* Review List */}
                      {filteredReviews.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500 dark:text-gray-400 mb-2">No reviews match your filters</p>
                          <button
                            onClick={() => {
                              setRatingFilter('all');
                              setSourceFilter('all');
                              setSortBy('default');
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Clear filters
                          </button>
                        </div>
                      ) : (
                        filteredReviews.map((review) => (
                          <div
                            key={review.id}
                            className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <StarRating rating={review.rating ?? 0} />
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {review.title}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  by {review.author} • v{review.version}
                                  {review.country && ` • ${review.country.toUpperCase()}`}
                                  {review.vote_count > 0 && ` • ${review.vote_count} found helpful`}
                                  {review.sort_source && availableSources.length > 1 && (
                                    <span className="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-[10px]">
                                      {FILTER_INFO[review.sort_source]?.label || review.sort_source}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {review.content}
                            </p>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div>
              {analyzing ? (
                <div className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-4">Analyzing Reviews</h4>

                  {/* Progress Animation */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Processing {reviews.length} reviews...</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">Working</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '100%' }} />
                    </div>
                  </div>

                  {/* Status Message */}
                  <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0">
                      <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {analysisStatus || 'Preparing review data...'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Claude AI is analyzing patterns and generating insights
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 text-center mt-4">
                    This typically takes 15-30 seconds depending on review volume
                  </p>
                </div>
              ) : analysis ? (
                <div className="prose dark:prose-invert max-w-none">
                  <div className="relative">
                    <button
                      onClick={copyAnalysis}
                      className="absolute top-2 right-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm z-10"
                      title="Copy analysis"
                    >
                      {analysisCopied ? (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <div className="analysis-report bg-gray-50 dark:bg-gray-900 rounded-lg p-6 pr-14">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {analysis}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {!hasScraped ? (
                    <>
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        First scrape some reviews, then analyze them with AI
                      </p>
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        Go to Settings
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Click below to analyze {reviews.length} reviews with Claude AI
                      </p>
                      <button
                        onClick={analyzeReviews}
                        disabled={reviews.length === 0}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        Analyze Reviews
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Keywords Tab */}
          {activeTab === 'keywords' && (
            <div className="space-y-6">
              {/* Keyword Rank Checker */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Keyword Rank Checker
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Check where this app ranks for specific keywords in the App Store
                </p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && checkKeywordRank()}
                    placeholder="Enter a keyword (e.g., fitness tracker, meditation)"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => checkKeywordRank()}
                    disabled={checkingKeyword || !keywordInput.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {checkingKeyword ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Checking...
                      </>
                    ) : (
                      'Check Rank'
                    )}
                  </button>
                </div>

                {/* Keyword Results */}
                {keywordRanks.length > 0 && (
                  <div className="space-y-3">
                    {keywordRanks.map((result, idx) => (
                      <div
                        key={`${result.keyword}-${idx}`}
                        className={`p-4 rounded-lg border ${
                          result.found
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            "{result.keyword}"
                          </span>
                          {result.found ? (
                            <span className="px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-full">
                              #{result.ranking}
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-gray-400 text-white text-sm rounded-full">
                              Not in Top 200
                            </span>
                          )}
                        </div>

                        {/* Top competitors for this keyword */}
                        {result.topApps && result.topApps.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top 5 for this keyword:</p>
                            <div className="space-y-1">
                              {result.topApps.slice(0, 5).map((topApp) => (
                                <div
                                  key={topApp.id}
                                  className={`flex items-center gap-2 text-sm p-1 rounded ${
                                    topApp.isTarget ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                                  }`}
                                >
                                  <span className="w-6 text-center font-medium text-gray-500">
                                    #{topApp.rank}
                                  </span>
                                  {topApp.icon && (
                                    <img src={topApp.icon} alt="" className="w-6 h-6 rounded" />
                                  )}
                                  <span className={`flex-1 truncate ${topApp.isTarget ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {topApp.name}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {topApp.rating?.toFixed(1)}★
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Extracted Keywords from Reviews */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Keywords from Reviews
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Common terms users mention in reviews - add to keyword research
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={extractKeywordsFromReviews}
                      disabled={extractingKeywords || reviews.length === 0}
                      className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {extractingKeywords ? 'Extracting...' : hasScraped ? 'Extract' : 'Scrape First'}
                    </button>
                    {extractedKeywords.length > 0 && (
                      <button
                        onClick={bulkScoreExtractedKeywords}
                        disabled={bulkScoring || extractedKeywords.every(kw => scoredKeywords.has(kw.keyword))}
                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {bulkScoring ? (
                          <>
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            {bulkScoringProgress.current}/{bulkScoringProgress.total}
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add All to Research
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {extractedKeywords.length > 0 ? (
                  <div className="space-y-3">
                    {/* Scored keywords count */}
                    {scoredKeywords.size > 0 && (
                      <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {scoredKeywords.size} of {extractedKeywords.length} added to keyword research
                      </div>
                    )}

                    {/* Keywords grid */}
                    <div className="flex flex-wrap gap-2">
                      {extractedKeywords.map((kw, idx) => {
                        const isScored = scoredKeywords.has(kw.keyword);
                        const isScoring = scoringKeyword === kw.keyword;

                        return (
                          <div
                            key={`${kw.keyword}-${idx}`}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-colors ${
                              isScored
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : kw.type === 'phrase'
                                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {isScored && (
                              <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            <button
                              onClick={() => checkKeywordRank(kw.keyword)}
                              className="hover:underline"
                              title={`Check ranking - mentioned ${kw.count} times`}
                            >
                              {kw.keyword}
                              <span className="ml-1 text-xs opacity-60">({kw.count})</span>
                            </button>
                            {!isScored && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  scoreExtractedKeyword(kw.keyword);
                                }}
                                disabled={isScoring || bulkScoring}
                                className="ml-1 p-0.5 hover:bg-white/50 dark:hover:bg-black/20 rounded transition-colors disabled:opacity-50"
                                title="Add to keyword research"
                              >
                                {isScoring ? (
                                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Link to keyword research */}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <a
                        href="/keywords"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View all keywords in Keyword Research
                      </a>
                    </div>
                  </div>
                ) : !hasScraped ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      Scrape reviews first to extract keywords
                    </p>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Go to Settings
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    Click "Extract" to analyze review content
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
