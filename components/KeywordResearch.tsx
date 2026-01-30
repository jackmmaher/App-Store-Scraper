'use client';

import { useState, useEffect, useCallback } from 'react';
import { Keyword, KeywordScoreResult, DiscoveryMethod, KeywordJob } from '@/lib/keywords/types';

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

export default function KeywordResearch() {
  // State
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [totalKeywords, setTotalKeywords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KeywordStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<KeywordJob[]>([]);
  const [filters, setFilters] = useState<Filters>({
    q: '',
    country: 'us',
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
            <div className="text-sm text-gray-500">Avg Volume</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.avgDifficulty.toFixed(1)}</div>
            <div className="text-sm text-gray-500">Avg Difficulty</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.avgOpportunity.toFixed(1)}</div>
            <div className="text-sm text-gray-500">Avg Opportunity</div>
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
              <span className={`text-lg font-bold ${getScoreColor(scoreResult.volume_score, 'volume')}`}>
                Vol: {scoreResult.volume_score}
              </span>
              <span className={`text-lg font-bold ${getScoreColor(scoreResult.difficulty_score, 'difficulty')}`}>
                Diff: {scoreResult.difficulty_score}
              </span>
              <span className={`text-lg font-bold ${getScoreColor(scoreResult.opportunity_score, 'opportunity')}`}>
                Opp: {scoreResult.opportunity_score}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Results: {scoreResult.raw.total_results} |
              Avg Reviews: {scoreResult.raw.top10_avg_reviews.toLocaleString()} |
              Title Matches: {scoreResult.raw.top10_title_matches}/10
            </div>
            {scoreResult.top_10_apps.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Top 10 Competitors:</div>
                <div className="flex flex-wrap gap-2">
                  {scoreResult.top_10_apps.slice(0, 5).map((app) => (
                    <span
                      key={app.id}
                      className="inline-flex items-center px-2 py-1 bg-white border border-gray-200 rounded text-sm"
                    >
                      {app.name.slice(0, 30)}{app.name.length > 30 ? '...' : ''}
                      <span className="ml-1 text-yellow-500">★{app.rating}</span>
                    </span>
                  ))}
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
                    Volume <SortIndicator column="volume" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('difficulty')}
                  >
                    Difficulty <SortIndicator column="difficulty" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('opportunity')}
                  >
                    Opportunity <SortIndicator column="opportunity" />
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
                  <tr key={kw.id} className="hover:bg-gray-50">
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
    </div>
  );
}
