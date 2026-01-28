import { useState, useCallback } from 'react';

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
}

export function useKeywordRanking({ appId, country }: UseKeywordRankingProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordRanks, setKeywordRanks] = useState<KeywordRank[]>([]);
  const [checking, setChecking] = useState(false);

  const checkKeywordRank = useCallback(async (keyword?: string) => {
    const searchKeyword = keyword || keywordInput.trim();
    if (!searchKeyword) return;

    setChecking(true);

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
      alert('Failed to check keyword ranking');
    } finally {
      setChecking(false);
    }
  }, [keywordInput, appId, country]);

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
  };
}
