'use client';

import { useState, useEffect, useCallback } from 'react';
import { Keyword, KeywordScoreResult, DiscoveryMethod, KeywordJob, KeywordRanking } from '@/lib/keywords/types';
import type { AppResult } from '@/lib/supabase';
import { ensureAppInMasterDb } from '@/lib/supabase';
import AppDetailModal from './AppDetailModal';

// Tooltip component for metric explanations
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-64 shadow-lg">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}

// Metric explanations
const METRIC_TOOLTIPS = {
  volume: (
    <div className="space-y-1">
      <div className="font-semibold">Volume Score (0-100)</div>
      <div>Estimated search popularity. Higher = more people searching for this keyword.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">How it&apos;s calculated:</div>
        <div>• Autosuggest priority from Apple (40%)</div>
        <div>• Position in suggestions (20%)</div>
        <div>• Market size / total results (25%)</div>
        <div>• Trigger length bonus (15%)</div>
      </div>
    </div>
  ),
  difficulty: (
    <div className="space-y-1">
      <div className="font-semibold">Difficulty Score (0-100)</div>
      <div>How hard it is to rank in the top 10. Higher = more competition.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">How it&apos;s calculated:</div>
        <div>• Apps with keyword in title (30%)</div>
        <div>• Review count strength (35%)</div>
        <div>• Average ratings (10%)</div>
        <div>• Market saturation (10%)</div>
        <div>• Market maturity (15%)</div>
      </div>
    </div>
  ),
  opportunity: (
    <div className="space-y-1">
      <div className="font-semibold">Opportunity Score (0-100)</div>
      <div>Best keywords to target. Higher = high volume with low competition.</div>
      <div className="pt-1 text-gray-300 text-[10px]">
        <div className="font-medium">Formula:</div>
        <div>Volume × (100 - Difficulty) / 100</div>
        <div className="pt-1">A score of 40+ is considered a good opportunity.</div>
      </div>
    </div>
  ),
};

interface KeywordStats {
  total: number;
  scored: number;
  avgVolume: number;
  avgDifficulty: number;
  avgOpportunity: number;
  highOpportunity: number;
}

interface Filters {
  q: string;
  country: string;
  sort: 'opportunity' | 'volume' | 'difficulty' | 'created_at';
  sort_dir: 'asc' | 'desc';
  min_volume?: number;
  max_difficulty?: number;
  min_opportunity?: number;
  discovered_via?: DiscoveryMethod;
  page: number;
  limit: number;
}

interface KeywordDetail {
  keyword: Keyword;
  rankings: KeywordRanking[];
}

interface KeywordResearchProps {
  initialQuery?: string;
  initialCountry?: string;
}

export default function KeywordResearch({ initialQuery, initialCountry }: KeywordResearchProps = {}) {
  // State
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [totalKeywords, setTotalKeywords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KeywordStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<KeywordJob[]>([]);
  const [filters, setFilters] = useState<Filters>({
    q: initialQuery || '',
    country: initialCountry || 'us',
    sort: 'opportunity',
    sort_dir: 'desc',
    page: 1,
    limit: 50,
  });

  // Discovery state
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>('autosuggest');
  const [seedKeyword, setSeedKeyword] = useState('');
  const [category, setCategory] = useState('productivity');
  const [discovering, setDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState<{
    discovered: number;
    scored: number;
    message: string;
  } | null>(null);

  // Single keyword scoring
  const [scoreKeyword, setScoreKeyword] = useState('');
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<KeywordScoreResult | null>(null);

  // Keyword detail modal state
  const [selectedKeyword, setSelectedKeyword] = useState<KeywordDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [keywordModalOpen, setKeywordModalOpen] = useState(false);
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // App detail modal state
  const [selectedApp, setSelectedApp] = useState<AppResult | null>(null);
  const [loadingApp, setLoadingApp] = useState(false);

  // Batch add competitors to database state
  const [addingAllToDb, setAddingAllToDb] = useState(false);
  const [addedToDbCount, setAddedToDbCount] = useState(0);

  // Tracking which ranking apps are being added / have been added to DB
  const [addingRankingApp, setAddingRankingApp] = useState<string | null>(null);
  const [addedRankingApps, setAddedRankingApps] = useState<Set<string>>(new Set());

  // Fetch stats
  useEffect(() => {
    fetch(`/api/keywords/stats?country=${filters.country}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats(data.data.stats);
          setRecentJobs(data.data.recentJobs || []);
        }
      })
      .catch(console.error);
  }, [filters.country]);

  // Fetch keywords
  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      params.set('country', filters.country);
      params.set('sort', filters.sort);
      params.set('sort_dir', filters.sort_dir);
      if (filters.min_volume) params.set('min_volume', filters.min_volume.toString());
      if (filters.max_difficulty) params.set('max_difficulty', filters.max_difficulty.toString());
      if (filters.min_opportunity) params.set('min_opportunity', filters.min_opportunity.toString());
      if (filters.discovered_via) params.set('discovered_via', filters.discovered_via);
      params.set('page', filters.page.toString());
      params.set('limit', filters.limit.toString());

      const res = await fetch(`/api/keywords/search?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setKeywords(data.keywords || []);
        setTotalKeywords(data.total || 0);
      }
    } catch (error) {
      console.error('Error fetching keywords:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  // Fetch keyword detail with rankings
  const handleKeywordClick = async (keyword: Keyword) => {
    setKeywordModalOpen(true);
    setLoadingDetail(true);
    setKeywordError(null);
    setSelectedKeyword(null);

    try {
      const res = await fetch(`/api/keywords/detail?id=${keyword.id}`);
      const data = await res.json();

      if (data.success && data.data) {
        setSelectedKeyword(data.data);
      } else {
        setKeywordError(data.error || 'Failed to load keyword details');
      }
    } catch (error) {
      console.error('Error fetching keyword detail:', error);
      setKeywordError(error instanceof Error ? error.message : 'Network error');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Close keyword modal
  const closeKeywordModal = () => {
    setKeywordModalOpen(false);
    setSelectedKeyword(null);
    setKeywordError(null);
  };

  // Fetch app detail and open modal
  const handleAppClick = async (ranking: KeywordRanking) => {
    setLoadingApp(true);
    try {
      // Fetch full app details from iTunes
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${ranking.app_id}&country=${filters.country}`
      );
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const app = data.results[0];
        // Map iTunes response to AppResult format
        const appResult: AppResult = {
          id: app.trackId.toString(),
          name: app.trackName,
          bundle_id: app.bundleId || '',
          developer: app.artistName || '',
          developer_id: app.artistId?.toString() || '',
          price: app.price || 0,
          currency: app.currency || 'USD',
          rating: app.averageUserRating || 0,
          rating_current_version: app.averageUserRatingForCurrentVersion || 0,
          review_count: app.userRatingCount || 0,
          review_count_current_version: app.userRatingCountForCurrentVersion || 0,
          version: app.version || '',
          release_date: app.releaseDate || '',
          current_version_release_date: app.currentVersionReleaseDate || '',
          min_os_version: app.minimumOsVersion || '',
          file_size_bytes: app.fileSizeBytes || '0',
          content_rating: app.contentAdvisoryRating || '',
          genres: app.genres || [],
          primary_genre: app.primaryGenreName || '',
          primary_genre_id: app.primaryGenreId?.toString() || '',
          url: app.trackViewUrl || '',
          icon_url: app.artworkUrl100 || '',
          description: app.description || '',
        };
        setSelectedApp(appResult);
      }
    } catch (error) {
      console.error('Error fetching app details:', error);
    } finally {
      setLoadingApp(false);
    }
  };

  // Fetch app detail from ranked app (score results)
  const handleRankedAppClick = async (appId: string) => {
    setLoadingApp(true);
    try {
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${appId}&country=${filters.country}`
      );
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const app = data.results[0];
        const appResult: AppResult = {
          id: app.trackId.toString(),
          name: app.trackName,
          bundle_id: app.bundleId || '',
          developer: app.artistName || '',
          developer_id: app.artistId?.toString() || '',
          price: app.price || 0,
          currency: app.currency || 'USD',
          rating: app.averageUserRating || 0,
          rating_current_version: app.averageUserRatingForCurrentVersion || 0,
          review_count: app.userRatingCount || 0,
          review_count_current_version: app.userRatingCountForCurrentVersion || 0,
          version: app.version || '',
          release_date: app.releaseDate || '',
          current_version_release_date: app.currentVersionReleaseDate || '',
          min_os_version: app.minimumOsVersion || '',
          file_size_bytes: app.fileSizeBytes || '0',
          content_rating: app.contentAdvisoryRating || '',
          genres: app.genres || [],
          primary_genre: app.primaryGenreName || '',
          primary_genre_id: app.primaryGenreId?.toString() || '',
          url: app.trackViewUrl || '',
          icon_url: app.artworkUrl100 || '',
          description: app.description || '',
        };
        setSelectedApp(appResult);
      }
    } catch (error) {
      console.error('Error fetching app details:', error);
    } finally {
      setLoadingApp(false);
    }
  };

  // Batch add all score result competitors to database
  const handleAddAllCompetitorsToDb = async () => {
    if (!scoreResult || scoreResult.top_10_apps.length === 0) return;

    setAddingAllToDb(true);
    setAddedToDbCount(0);

    const appsToAdd = scoreResult.top_10_apps.slice(0, 5);

    for (let i = 0; i < appsToAdd.length; i++) {
      const app = appsToAdd[i];
      try {
        // Fetch full app data from iTunes
        const res = await fetch(
          `https://itunes.apple.com/lookup?id=${app.id}&country=${filters.country}`
        );
        const data = await res.json();

        if (data.results && data.results.length > 0) {
          const itunesApp = data.results[0];
          const appResult: AppResult = {
            id: itunesApp.trackId.toString(),
            name: itunesApp.trackName,
            bundle_id: itunesApp.bundleId || '',
            developer: itunesApp.artistName || '',
            developer_id: itunesApp.artistId?.toString() || '',
            price: itunesApp.price || 0,
            currency: itunesApp.currency || 'USD',
            rating: itunesApp.averageUserRating || 0,
            rating_current_version: itunesApp.averageUserRatingForCurrentVersion || 0,
            review_count: itunesApp.userRatingCount || 0,
            review_count_current_version: itunesApp.userRatingCountForCurrentVersion || 0,
            version: itunesApp.version || '',
            release_date: itunesApp.releaseDate || '',
            current_version_release_date: itunesApp.currentVersionReleaseDate || '',
            min_os_version: itunesApp.minimumOsVersion || '',
            file_size_bytes: itunesApp.fileSizeBytes || '0',
            content_rating: itunesApp.contentAdvisoryRating || '',
            genres: itunesApp.genres || [],
            primary_genre: itunesApp.primaryGenreName || '',
            primary_genre_id: itunesApp.primaryGenreId?.toString() || '',
            url: itunesApp.trackViewUrl || '',
            icon_url: itunesApp.artworkUrl100 || '',
            description: itunesApp.description || '',
          };

          await ensureAppInMasterDb(appResult, filters.country);
          setAddedToDbCount(i + 1);
        }
      } catch (error) {
        console.error('Error adding app to database:', app.name, error);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    setAddingAllToDb(false);
  };

  // Add a single ranking app to database
  const handleAddRankingAppToDb = async (ranking: KeywordRanking, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger the row click
    if (!ranking.app_id) return;

    setAddingRankingApp(ranking.app_id);
    try {
      // Fetch full app data from iTunes
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${ranking.app_id}&country=${filters.country}`
      );
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const itunesApp = data.results[0];
        const appResult: AppResult = {
          id: itunesApp.trackId.toString(),
          name: itunesApp.trackName,
          bundle_id: itunesApp.bundleId || '',
          developer: itunesApp.artistName || '',
          developer_id: itunesApp.artistId?.toString() || '',
          price: itunesApp.price || 0,
          currency: itunesApp.currency || 'USD',
          rating: itunesApp.averageUserRating || 0,
          rating_current_version: itunesApp.averageUserRatingForCurrentVersion || 0,
          review_count: itunesApp.userRatingCount || 0,
          review_count_current_version: itunesApp.userRatingCountForCurrentVersion || 0,
          version: itunesApp.version || '',
          release_date: itunesApp.releaseDate || '',
          current_version_release_date: itunesApp.currentVersionReleaseDate || '',
          min_os_version: itunesApp.minimumOsVersion || '',
          file_size_bytes: itunesApp.fileSizeBytes || '0',
          content_rating: itunesApp.contentAdvisoryRating || '',
          genres: itunesApp.genres || [],
          primary_genre: itunesApp.primaryGenreName || '',
          primary_genre_id: itunesApp.primaryGenreId?.toString() || '',
          url: itunesApp.trackViewUrl || '',
          icon_url: itunesApp.artworkUrl100 || '',
          description: itunesApp.description || '',
        };

        await ensureAppInMasterDb(appResult, filters.country);
        setAddedRankingApps(prev => new Set([...prev, ranking.app_id]));
      }
    } catch (error) {
      console.error('Error adding ranking app to database:', error);
    } finally {
      setAddingRankingApp(null);
    }
  };

  // Start discovery
  const handleDiscover = async () => {
    if (discoveryMethod === 'autosuggest' && !seedKeyword.trim()) {
      alert('Please enter a seed keyword');
      return;
    }

    setDiscovering(true);
    setDiscoveryProgress({ discovered: 0, scored: 0, message: 'Starting discovery...' });

    try {
      const body: Record<string, unknown> = {
        method: discoveryMethod,
        country: filters.country,
        score_immediately: true,
      };

      if (discoveryMethod === 'autosuggest') {
        body.seed = seedKeyword.trim();
        body.depth = 2;
      } else if (discoveryMethod === 'category_crawl') {
        body.category = category;
      }

      const response = await fetch('/api/keywords/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

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
              const data = JSON.parse(line.slice(6));
              if (data.type === 'progress' || data.type === 'keyword') {
                setDiscoveryProgress({
                  discovered: data.discovered || 0,
                  scored: data.scored || 0,
                  message: data.message || `Discovered: ${data.discovered || 0}, Scored: ${data.scored || 0}`,
                });
              } else if (data.type === 'complete') {
                setDiscoveryProgress({
                  discovered: data.discovered || 0,
                  scored: data.scored || 0,
                  message: data.message || 'Complete!',
                });
              } else if (data.type === 'error') {
                setDiscoveryProgress({
                  discovered: 0,
                  scored: 0,
                  message: `Error: ${data.message}`,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Refresh keywords list
      fetchKeywords();
      // Refresh stats
      fetch(`/api/keywords/stats?country=${filters.country}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setStats(data.data.stats);
        });
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryProgress({
        discovered: 0,
        scored: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Discovery failed'}`,
      });
    } finally {
      setDiscovering(false);
    }
  };

  // Score single keyword
  const handleScoreKeyword = async () => {
    if (!scoreKeyword.trim()) return;

    setScoring(true);
    setScoreResult(null);

    try {
      const res = await fetch('/api/keywords/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: scoreKeyword.trim(),
          country: filters.country,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setScoreResult(data.data);
        fetchKeywords();
      }
    } catch (error) {
      console.error('Error scoring keyword:', error);
    } finally {
      setScoring(false);
    }
  };

  // Export
  const handleExport = (format: 'csv' | 'json') => {
    const params = new URLSearchParams();
    params.set('format', format);
    params.set('country', filters.country);
    if (filters.min_volume) params.set('min_volume', filters.min_volume.toString());
    if (filters.max_difficulty) params.set('max_difficulty', filters.max_difficulty.toString());
    if (filters.min_opportunity) params.set('min_opportunity', filters.min_opportunity.toString());

    window.open(`/api/keywords/export?${params.toString()}`, '_blank');
  };

  // Sorting
  const handleSort = (column: Filters['sort']) => {
    if (filters.sort === column) {
      setFilters({ ...filters, sort_dir: filters.sort_dir === 'desc' ? 'asc' : 'desc', page: 1 });
    } else {
      setFilters({ ...filters, sort: column, sort_dir: 'desc', page: 1 });
    }
  };

  const SortIndicator = ({ column }: { column: Filters['sort'] }) => {
    if (filters.sort !== column) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{filters.sort_dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Score color helper
  const getScoreColor = (score: number | null, type: 'volume' | 'difficulty' | 'opportunity') => {
    if (score === null) return 'text-gray-400';
    if (type === 'difficulty') {
      if (score <= 30) return 'text-green-600';
      if (score <= 60) return 'text-yellow-600';
      return 'text-red-600';
    }
    if (score >= 60) return 'text-green-600';
    if (score >= 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const totalPages = Math.ceil(totalKeywords / filters.limit);

  const categories = [
    'productivity', 'utilities', 'finance', 'health-fitness', 'education',
    'entertainment', 'photo-video', 'music', 'games', 'social-networking',
    'business', 'lifestyle', 'travel', 'food-drink', 'shopping', 'news',
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.total.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Total Keywords</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.scored.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Scored</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-green-600">{stats.avgVolume.toFixed(1)}</div>
            <Tooltip content={METRIC_TOOLTIPS.volume}>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                Avg Volume
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </Tooltip>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.avgDifficulty.toFixed(1)}</div>
            <Tooltip content={METRIC_TOOLTIPS.difficulty}>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                Avg Difficulty
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </Tooltip>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.avgOpportunity.toFixed(1)}</div>
            <Tooltip content={METRIC_TOOLTIPS.opportunity}>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                Avg Opportunity
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </Tooltip>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.highOpportunity}</div>
            <div className="text-sm text-gray-500">High Opp (40+)</div>
          </div>
        </div>
      )}

      {/* Discovery Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Discover Keywords</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Discovery Method</label>
            <select
              value={discoveryMethod}
              onChange={(e) => setDiscoveryMethod(e.target.value as DiscoveryMethod)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={discovering}
            >
              <option value="autosuggest">Seed Keyword Expansion</option>
              <option value="category_crawl">Category Crawl</option>
            </select>
          </div>

          {/* Input based on method */}
          <div>
            {discoveryMethod === 'autosuggest' ? (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Seed Keyword</label>
                <input
                  type="text"
                  value={seedKeyword}
                  onChange={(e) => setSeedKeyword(e.target.value)}
                  placeholder="e.g., photo editor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={discovering}
                />
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={discovering}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Discover Button */}
          <div className="flex items-end">
            <button
              onClick={handleDiscover}
              disabled={discovering}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {discovering ? 'Discovering...' : 'Start Discovery'}
            </button>
          </div>
        </div>

        {/* Discovery Progress */}
        {discoveryProgress && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <div className="flex items-center gap-4">
              {discovering && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              )}
              <div>
                <span className="font-medium">{discoveryProgress.message}</span>
                {discoveryProgress.discovered > 0 && (
                  <span className="text-gray-500 ml-2">
                    ({discoveryProgress.discovered} found, {discoveryProgress.scored} scored)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Score Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Score a Keyword</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={scoreKeyword}
            onChange={(e) => setScoreKeyword(e.target.value)}
            placeholder="Enter keyword to score..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleScoreKeyword()}
          />
          <button
            onClick={handleScoreKeyword}
            disabled={scoring || !scoreKeyword.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed"
          >
            {scoring ? 'Scoring...' : 'Score'}
          </button>
        </div>

        {/* Score Result */}
        {scoreResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md">
            <div className="flex items-center gap-6 mb-3">
              <span className="text-lg font-semibold">&quot;{scoreResult.keyword}&quot;</span>
              <Tooltip content={METRIC_TOOLTIPS.volume}>
                <span className={`text-lg font-bold ${getScoreColor(scoreResult.volume_score, 'volume')} flex items-center gap-1`}>
                  Vol: {scoreResult.volume_score}
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </Tooltip>
              <Tooltip content={METRIC_TOOLTIPS.difficulty}>
                <span className={`text-lg font-bold ${getScoreColor(scoreResult.difficulty_score, 'difficulty')} flex items-center gap-1`}>
                  Diff: {scoreResult.difficulty_score}
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </Tooltip>
              <Tooltip content={METRIC_TOOLTIPS.opportunity}>
                <span className={`text-lg font-bold ${getScoreColor(scoreResult.opportunity_score, 'opportunity')} flex items-center gap-1`}>
                  Opp: {scoreResult.opportunity_score}
                  <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </Tooltip>
            </div>
            <div className="text-sm text-gray-600">
              Results: {scoreResult.raw.total_results} |
              Avg Reviews: {scoreResult.raw.top10_avg_reviews.toLocaleString()} |
              Title Matches: {scoreResult.raw.top10_title_matches}/10
            </div>
            {scoreResult.top_10_apps.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Top {Math.min(5, scoreResult.top_10_apps.length)} Competitors:
                  <span className="font-normal text-gray-500 ml-1">(click to view details)</span>
                </div>
                <div className="space-y-2">
                  {scoreResult.top_10_apps.slice(0, 5).map((app, index) => (
                    <button
                      key={app.id}
                      onClick={() => handleRankedAppClick(app.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                    >
                      <div className="flex-shrink-0 w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-medium text-xs">
                        {index + 1}
                      </div>
                      {app.icon_url && (
                        <img src={app.icon_url} alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {app.name}
                          {app.has_keyword_in_title && (
                            <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded">
                              In Title
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
                        <span className="text-yellow-500">★</span>
                        <span>{app.rating.toFixed(1)}</span>
                        <span className="text-gray-300">|</span>
                        <span>{app.reviews.toLocaleString()} reviews</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
                {loadingApp && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    Loading app details...
                  </div>
                )}

                {/* Batch add to database */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={handleAddAllCompetitorsToDb}
                    disabled={addingAllToDb}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {addingAllToDb ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Adding {addedToDbCount}/{Math.min(5, scoreResult.top_10_apps.length)}...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add All {Math.min(5, scoreResult.top_10_apps.length)} to Database
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
              placeholder="Search keywords..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Volume</label>
            <input
              type="number"
              value={filters.min_volume || ''}
              onChange={(e) => setFilters({ ...filters, min_volume: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Difficulty</label>
            <input
              type="number"
              value={filters.max_difficulty || ''}
              onChange={(e) => setFilters({ ...filters, max_difficulty: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
              placeholder="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Opportunity</label>
            <input
              type="number"
              value={filters.min_opportunity || ''}
              onChange={(e) => setFilters({ ...filters, min_opportunity: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={filters.discovered_via || ''}
              onChange={(e) => setFilters({ ...filters, discovered_via: e.target.value as DiscoveryMethod | undefined || undefined, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Sources</option>
              <option value="autosuggest">Autosuggest</option>
              <option value="competitor">Competitor</option>
              <option value="category_crawl">Category Crawl</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <select
              value={filters.country}
              onChange={(e) => setFilters({ ...filters, country: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="us">United States</option>
              <option value="gb">United Kingdom</option>
              <option value="ca">Canada</option>
              <option value="au">Australia</option>
              <option value="de">Germany</option>
              <option value="fr">France</option>
            </select>
          </div>
        </div>

        {/* Results count and export */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Showing {keywords.length} of {totalKeywords.toLocaleString()} keywords
            <span className="text-gray-400 ml-2">• Click a row to see ranking apps</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              disabled={totalKeywords === 0}
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={totalKeywords === 0}
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>

      {/* Keywords Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading keywords...</div>
        ) : keywords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">No keywords found</p>
            <p className="text-sm mt-1">Use the discovery panel above to find keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keyword
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('volume')}
                  >
                    <Tooltip content={METRIC_TOOLTIPS.volume}>
                      <span className="flex items-center gap-1">
                        Volume
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                    <SortIndicator column="volume" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('difficulty')}
                  >
                    <Tooltip content={METRIC_TOOLTIPS.difficulty}>
                      <span className="flex items-center gap-1">
                        Difficulty
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                    <SortIndicator column="difficulty" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('opportunity')}
                  >
                    <Tooltip content={METRIC_TOOLTIPS.opportunity}>
                      <span className="flex items-center gap-1">
                        Opportunity
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                    <SortIndicator column="opportunity" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Results
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {keywords.map((kw) => (
                  <tr
                    key={kw.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => handleKeywordClick(kw)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{kw.keyword}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${getScoreColor(kw.volume_score, 'volume')}`}>
                        {kw.volume_score?.toFixed(1) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${getScoreColor(kw.difficulty_score, 'difficulty')}`}>
                        {kw.difficulty_score?.toFixed(1) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${getScoreColor(kw.opportunity_score, 'opportunity')}`}>
                        {kw.opportunity_score?.toFixed(1) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {kw.total_results?.toLocaleString() || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {kw.discovered_via || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Page {filters.page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keyword Detail Modal */}
      {keywordModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {loadingDetail ? 'Loading...' : selectedKeyword ? `"${selectedKeyword.keyword.keyword}"` : 'Keyword Details'}
                </h2>
                {selectedKeyword && (
                  <div className="flex items-center gap-4 mt-1 text-sm">
                    <Tooltip content={METRIC_TOOLTIPS.volume}>
                      <span className={`${getScoreColor(selectedKeyword.keyword.volume_score, 'volume')} flex items-center gap-1`}>
                        Volume: {selectedKeyword.keyword.volume_score?.toFixed(1)}
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                    <Tooltip content={METRIC_TOOLTIPS.difficulty}>
                      <span className={`${getScoreColor(selectedKeyword.keyword.difficulty_score, 'difficulty')} flex items-center gap-1`}>
                        Difficulty: {selectedKeyword.keyword.difficulty_score?.toFixed(1)}
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                    <Tooltip content={METRIC_TOOLTIPS.opportunity}>
                      <span className={`${getScoreColor(selectedKeyword.keyword.opportunity_score, 'opportunity')} flex items-center gap-1`}>
                        Opportunity: {selectedKeyword.keyword.opportunity_score?.toFixed(1)}
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </Tooltip>
                  </div>
                )}
              </div>
              <button
                onClick={closeKeywordModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : keywordError ? (
                <div className="text-center py-12">
                  <div className="text-red-500 mb-2">Error loading keyword details</div>
                  <div className="text-sm text-gray-500">{keywordError}</div>
                </div>
              ) : selectedKeyword?.rankings && selectedKeyword.rankings.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Top {selectedKeyword.rankings.length} Ranking Apps
                  </h3>
                  <div className="space-y-3">
                    {selectedKeyword.rankings.map((ranking) => {
                      const isAdded = addedRankingApps.has(ranking.app_id);
                      const isAdding = addingRankingApp === ranking.app_id;

                      return (
                        <div
                          key={ranking.id}
                          className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => handleAppClick(ranking)}
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                            {ranking.rank_position}
                          </div>
                          {ranking.app_icon_url && (
                            <img
                              src={ranking.app_icon_url}
                              alt=""
                              className="w-12 h-12 rounded-xl"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {ranking.app_name}
                              {ranking.has_keyword_in_title && (
                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                  In Title
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              <span className="text-yellow-500">★</span> {ranking.app_rating?.toFixed(1) || '-'}
                              <span className="mx-2">•</span>
                              {ranking.app_review_count?.toLocaleString() || '0'} reviews
                            </div>
                          </div>
                          {/* Add to DB button */}
                          {isAdded ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 px-2 py-1 bg-green-50 rounded">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Added
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleAddRankingAppToDb(ranking, e)}
                              disabled={isAdding}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                              title="Add to Apps Database"
                            >
                              {isAdding ? (
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              )}
                              Add
                            </button>
                          )}
                          <div className="text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No ranking data available for this keyword.</p>
                  <p className="text-sm mt-1">Rankings are captured when the keyword is scored.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Click an app to view details, scrape reviews, and analyze</span>
                {loadingApp && (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    Loading app...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* App Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          country={filters.country}
          onClose={() => setSelectedApp(null)}
        />
      )}
    </div>
  );
}
