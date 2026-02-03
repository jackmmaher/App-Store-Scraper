import { useState, useCallback, useEffect, useRef } from 'react';
import type { GapAnalysisChatMessage } from '@/lib/supabase';
import { getOperationErrorMessage } from '@/lib/errors';

interface UseGapChatProps {
  sessionId: string;
  onError?: (message: string) => void;
}

// Client-side timeout matching server (2 minutes)
const CLIENT_TIMEOUT_MS = 120000;

export function useGapChat({ sessionId, onError }: UseGapChatProps) {
  const [messages, setMessages] = useState<GapAnalysisChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track active request for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  // Load messages on mount (using query param)
  const loadMessages = useCallback(async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/gap-analysis?id=${sessionId}&action=chat-history`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Error loading gap chat messages:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Cancel any ongoing request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // Send a message and get Claude's response (using query param)
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !sessionId) return;

    // Cancel any existing request
    cancelRequest();

    setIsLoading(true);
    setError(null);

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Optimistically add user message
    const tempUserMessage: GapAnalysisChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    // Set up client-side timeout
    timeoutIdRef.current = setTimeout(() => {
      abortController.abort();
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      const message = 'Request timed out. Please try again.';
      setError(message);
      onError?.(message);
      setIsLoading(false);
    }, CLIENT_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/gap-analysis?id=${sessionId}&action=chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim() }),
        signal: abortController.signal,
      });

      // Clear timeout on response
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      // Safe JSON parsing to prevent stuck state
      let data;
      try {
        data = await res.json();
      } catch (parseError) {
        throw new Error('Failed to parse response');
      }

      // Replace temp message with real ones
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
        // Guard against undefined messages from malformed response
        if (!data.userMessage || !data.assistantMessage) {
          console.error('Malformed response: missing message data');
          return filtered;
        }
        return [...filtered, data.userMessage, data.assistantMessage];
      });
    } catch (err) {
      // Clear timeout if not already cleared
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      // Don't show error for intentional cancellation
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
        return;
      }

      console.error('Error sending gap chat message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      const message = getOperationErrorMessage('send', err);
      setError(message);
      onError?.(message);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [sessionId, onError, cancelRequest]);

  // Clear the conversation (using query param)
  const clearConversation = useCallback(async (confirmed?: boolean) => {
    if (!sessionId) return;

    // If not pre-confirmed, this should be handled by the component
    if (!confirmed && typeof window !== 'undefined' && !window.confirm('Clear all messages in this conversation?')) {
      return;
    }

    try {
      const res = await fetch(`/api/gap-analysis?id=${sessionId}&action=clear-chat`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Error clearing gap chat conversation:', err);
      const message = getOperationErrorMessage('delete', err);
      setError(message);
      onError?.(message);
    }
  }, [sessionId, onError]);

  return {
    messages,
    isLoading,
    initialLoading,
    sendMessage,
    loadMessages,
    clearConversation,
    cancelRequest,
    error,
  };
}
