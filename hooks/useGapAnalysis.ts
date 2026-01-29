import { useState, useCallback, useEffect } from 'react';
import type { GapAnalysisSession, GapAnalysisApp } from '@/lib/supabase';

interface ScrapeProgress {
  country?: string;
  index?: number;
  total?: number;
  appsFound?: number;
  uniqueNew?: number;
  totalUnique?: number;
}

interface UseGapAnalysisProps {
  sessionId?: string;
}

export function useGapAnalysis({ sessionId }: UseGapAnalysisProps = {}) {
  const [sessions, setSessions] = useState<GapAnalysisSession[]>([]);
  const [currentSession, setCurrentSession] = useState<GapAnalysisSession | null>(null);
  const [apps, setApps] = useState<GapAnalysisApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scrape state
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress>({});

  // Classification state
  const [isClassifying, setIsClassifying] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // Load all sessions
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/gap-analysis');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load single session with apps (using query param fallback)
  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      // Use query param as fallback for Vercel dynamic route issues
      const res = await fetch(`/api/gap-analysis?id=${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      const data = await res.json();
      setCurrentSession(data.session);
      setApps(data.apps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new session
  const createSession = useCallback(async (
    category: string,
    countries: string[],
    name?: string,
    appsPerCountry?: number
  ): Promise<GapAnalysisSession | null> => {
    setError(null);

    try {
      const res = await fetch('/api/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, countries, appsPerCountry }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      const data = await res.json();
      setSessions((prev) => [data.session, ...prev]);
      return data.session;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, []);

  // Delete session (using query param)
  const deleteSession = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/gap-analysis?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSession?.id === id) {
        setCurrentSession(null);
        setApps([]);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
      return false;
    }
  }, [currentSession?.id]);

  // Start scraping (using query param)
  const startScrape = useCallback(async (id: string): Promise<boolean> => {
    setIsScraping(true);
    setScrapeProgress({});
    setError(null);

    let receivedComplete = false;

    try {
      const res = await fetch(`/api/gap-analysis?id=${id}&action=scrape`, { method: 'POST' });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start scrape');
      }

      // Process SSE stream
      const reader = res.body?.getReader();
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
              const eventData = JSON.parse(line.slice(6));

              if (eventData.type === 'country_start') {
                setScrapeProgress({
                  country: eventData.country,
                  index: eventData.index,
                  total: eventData.total,
                });
              }

              if (eventData.type === 'country_progress') {
                setScrapeProgress((prev) => ({
                  ...prev,
                  appsFound: eventData.apps_found,
                }));
              }

              if (eventData.type === 'country_complete') {
                setScrapeProgress((prev) => ({
                  ...prev,
                  appsFound: eventData.apps_found,
                  uniqueNew: eventData.unique_new,
                  totalUnique: eventData.total_unique,
                }));
              }

              if (eventData.type === 'complete') {
                receivedComplete = true;
              }

              if (eventData.type === 'error') {
                throw new Error(eventData.message);
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) {
                console.error('Error parsing SSE event:', parseErr);
              } else {
                throw parseErr;
              }
            }
          }
        }
      }

      // Stream ended - always reload session to get latest state from DB
      // This handles cases where the connection dropped before complete event
      await loadSession(id);
      return receivedComplete;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
      // Still reload session to get current state
      await loadSession(id).catch(() => {});
      return false;
    } finally {
      // Always reset scraping state when stream ends
      setIsScraping(false);
    }
  }, [loadSession]);

  // Run classification (using query param)
  const runClassification = useCallback(async (id: string): Promise<boolean> => {
    setIsClassifying(true);
    setError(null);

    try {
      const res = await fetch(`/api/gap-analysis?id=${id}&action=classify`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Classification failed');
      }

      // Reload session to get updated classifications
      await loadSession(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed');
      return false;
    } finally {
      setIsClassifying(false);
    }
  }, [loadSession]);

  // Run market gap analysis for an app (using query param)
  const analyzeApp = useCallback(async (
    sessionId: string,
    appStoreId: string
  ): Promise<string | null> => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/gap-analysis?id=${sessionId}&action=analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appStoreId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await res.json();
      setAnalysisResult(data.analysis);
      return data.analysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Load session on mount if sessionId provided
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  return {
    // State
    sessions,
    currentSession,
    apps,
    loading,
    error,

    // Scrape state
    isScraping,
    scrapeProgress,

    // Classification state
    isClassifying,

    // Analysis state
    isAnalyzing,
    analysisResult,

    // Actions
    loadSessions,
    loadSession,
    createSession,
    deleteSession,
    startScrape,
    runClassification,
    analyzeApp,
    clearError: () => setError(null),
  };
}
