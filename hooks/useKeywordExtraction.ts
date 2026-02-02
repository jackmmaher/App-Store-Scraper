import { useState, useCallback } from 'react';
import type { Review } from '@/lib/supabase';
import { getOperationErrorMessage } from '@/lib/errors';

export interface ExtractedKeyword {
  keyword: string;
  count: number;
  type: 'word' | 'phrase';
}

interface UseKeywordExtractionProps {
  appName: string;
  appDescription?: string;
  onError?: (message: string) => void;
}

export function useKeywordExtraction({ appName, appDescription, onError }: UseKeywordExtractionProps) {
  const [extractedKeywords, setExtractedKeywords] = useState<ExtractedKeyword[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractKeywords = useCallback(async (reviews: Review[]) => {
    if (reviews.length === 0) return;

    setExtracting(true);
    setError(null);

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
      const message = getOperationErrorMessage('analyze', err);
      setError(message);
      onError?.(message);
    } finally {
      setExtracting(false);
    }
  }, [appName, appDescription, onError]);

  const clearKeywords = useCallback(() => {
    setExtractedKeywords([]);
  }, []);

  return {
    extractedKeywords,
    extracting,
    extractKeywords,
    clearKeywords,
    error,
  };
}
