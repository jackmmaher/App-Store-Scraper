import { useState, useCallback } from 'react';
import { getOperationErrorMessage } from '@/lib/errors';

export interface KeywordRank {
  keyword: string;
  ranking: number | null;
  found: boolean;
  topApps: Array<{
    rank: number;
    id: string;
    name: string;
    developer: string;
    rating: number;
    reviews: number;
    icon: string;
    isTarget: boolean;
  }>;
}

interface UseKeywordRankingProps {
  appId: string;
  country: string;
  onError?: (message: string) => void;
}

export function useKeywordRanking({ appId, country, onError }: UseKeywordRankingProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordRanks, setKeywordRanks] = useState<KeywordRank[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkKeywordRank = useCallback(async (keyword?: string) => {
    const searchKeyword = keyword || keywordInput.trim();
    if (!searchKeyword) return;

    setChecking(true);
    setError(null);

    try {
      const res = await fetch('/api/keywords/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: searchKeyword,
          appId,
          country,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to check keyword');
      }

      const data = await res.json();

      setKeywordRanks((prev) => {
        const filtered = prev.filter(
          (k) => k.keyword.toLowerCase() !== data.keyword.toLowerCase()
        );
        return [
          {
            keyword: data.keyword,
            ranking: data.ranking,
            found: data.found,
            topApps: data.topApps,
          },
          ...filtered,
        ].slice(0, 20);
      });

      setKeywordInput('');
    } catch (err) {
      console.error('Error checking keyword:', err);
      const message = getOperationErrorMessage('search', err);
      setError(message);
      onError?.(message);
    } finally {
      setChecking(false);
    }
  }, [keywordInput, appId, country, onError]);

  const clearRanks = useCallback(() => {
    setKeywordRanks([]);
  }, []);

  return {
    keywordInput,
    setKeywordInput,
    keywordRanks,
    checking,
    checkKeywordRank,
    clearRanks,
    error,
  };
}
