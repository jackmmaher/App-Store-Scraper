import { useState, useCallback, useRef } from 'react';
import type { BlueprintSection, ProjectBlueprint } from '@/lib/supabase';

interface UseBlueprintGenerateProps {
  blueprintId?: string;
  onComplete?: (section: BlueprintSection, content: string) => void;
  onBlueprintUpdate?: (blueprint: ProjectBlueprint) => void;
}

export function useBlueprintGenerate({
  blueprintId,
  onComplete,
  onBlueprintUpdate,
}: UseBlueprintGenerateProps = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentSection, setCurrentSection] = useState<BlueprintSection | null>(null);
  const [streamedContent, setStreamedContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate a section with streaming
  const generateSection = useCallback(async (
    section: BlueprintSection,
    bpId?: string
  ): Promise<string | null> => {
    const targetBlueprintId = bpId || blueprintId;
    if (!targetBlueprintId) {
      setError('Blueprint ID required');
      return null;
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsGenerating(true);
    setCurrentSection(section);
    setStreamedContent('');
    setError(null);

    let fullContent = '';

    try {
      const res = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId: targetBlueprintId, section }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to start generation');
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

              if (eventData.type === 'chunk') {
                fullContent += eventData.text;
                setStreamedContent(fullContent);
              }

              if (eventData.type === 'complete') {
                // Reload blueprint to get updated state
                const bpRes = await fetch(`/api/blueprint?id=${targetBlueprintId}`);
                if (bpRes.ok) {
                  const bpData = await bpRes.json();
                  onBlueprintUpdate?.(bpData.blueprint);
                }
                onComplete?.(section, fullContent);
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

      return fullContent;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsGenerating(false);
      setCurrentSection(null);
      abortControllerRef.current = null;
    }
  }, [blueprintId, onComplete, onBlueprintUpdate]);

  // Cancel generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setCurrentSection(null);
  }, []);

  return {
    // State
    isGenerating,
    currentSection,
    streamedContent,
    error,

    // Actions
    generateSection,
    cancelGeneration,
    clearError: () => setError(null),
    clearStreamedContent: () => setStreamedContent(''),
  };
}
