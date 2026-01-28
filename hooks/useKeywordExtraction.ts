import { useState, useCallback } from 'react';
import type { Review } from '@/lib/supabase';

export interface ExtractedKeyword {
  keyword: string;
  count: number;
  type: 'word' | 'phrase';
}

interface UseKeywordExtractionProps {
  appName: string;
  appDescription?: string;
}

export function useKeywordExtraction({ appName, appDescription }: UseKeywordExtractionProps) {
  const [extractedKeywords, setExtractedKeywords] = useState<ExtractedKeyword[]>([]);
  const [extracting, setExtracting] = useState(false);

  const extractKeywords = useCallback(async (reviews: Review[]) => {
    if (reviews.length === 0) return;

    setExtracting(true);

    try {
      const res = await fetch('/api/keywords/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews,
          appName,
          appDescription,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to extract keywords');
      }

      const data = await res.json();
      setExtractedKeywords(data.allKeywords || []);
    } catch (err) {
      console.error('Error extracting keywords:', err);
      alert('Failed to extract keywords from reviews');
    } finally {
      setExtracting(false);
    }
  }, [appName, appDescription]);

  const clearKeywords = useCallback(() => {
    setExtractedKeywords([]);
  }, []);

  return {
    extractedKeywords,
    extracting,
    extractKeywords,
    clearKeywords,
  };
}
