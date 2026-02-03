import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/supabase';
import { getOperationErrorMessage } from '@/lib/errors';

interface UseChatProps {
  projectId: string;
  aiAnalysis?: string | null;
  onError?: (message: string) => void;
  onInfo?: (message: string) => void;
}

// Client-side timeout matching server (2 minutes)
const CLIENT_TIMEOUT_MS = 120000;

export function useChat({ projectId, aiAnalysis, onError, onInfo }: UseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  // Load messages on mount
  const loadMessages = useCallback(async () => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/chat?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [projectId]);

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

  // Send a message and get Claude's response
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !projectId) return;

    // Cancel any existing request
    cancelRequest();

    setIsLoading(true);
    setError(null);

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Optimistically add user message
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      project_id: projectId,
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: content.trim(),
        }),
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

      console.error('Error sending message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      const message = getOperationErrorMessage('send', err);
      setError(message);
      onError?.(message);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [projectId, onError, cancelRequest]);

  // Clear the conversation
  const clearConversation = useCallback(async (confirmed?: boolean) => {
    if (!projectId) return;

    // If not pre-confirmed, this should be handled by the component
    if (!confirmed && typeof window !== 'undefined' && !window.confirm('Clear all messages in this conversation?')) {
      return;
    }

    try {
      const res = await fetch(`/api/chat?projectId=${projectId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Error clearing conversation:', err);
      const message = getOperationErrorMessage('delete', err);
      setError(message);
      onError?.(message);
    }
  }, [projectId, onError]);

  // Insert analysis as a user message (for context sharing)
  const insertAnalysis = useCallback(() => {
    if (!aiAnalysis) {
      onInfo?.('No AI analysis available for this project');
      return null;
    }

    // Return the analysis text so the ChatPanel can insert it into the input
    return aiAnalysis;
  }, [aiAnalysis, onInfo]);

  return {
    messages,
    isLoading,
    initialLoading,
    sendMessage,
    loadMessages,
    clearConversation,
    insertAnalysis,
    cancelRequest,
    error,
  };
}
