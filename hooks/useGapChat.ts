import { useState, useCallback, useEffect } from 'react';
import type { GapAnalysisChatMessage } from '@/lib/supabase';

interface UseGapChatProps {
  sessionId: string;
}

export function useGapChat({ sessionId }: UseGapChatProps) {
  const [messages, setMessages] = useState<GapAnalysisChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load messages on mount
  const loadMessages = useCallback(async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/gap-analysis/${sessionId}/chat`);
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

  // Send a message and get Claude's response
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !sessionId) return;

    setIsLoading(true);

    // Optimistically add user message
    const tempUserMessage: GapAnalysisChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const res = await fetch(`/api/gap-analysis/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const data = await res.json();

      // Replace temp message with real ones
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMessage.id);
        return [...filtered, data.userMessage, data.assistantMessage];
      });
    } catch (err) {
      console.error('Error sending gap chat message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Clear the conversation
  const clearConversation = useCallback(async () => {
    if (!sessionId) return;

    if (!confirm('Clear all messages in this conversation?')) return;

    try {
      const res = await fetch(`/api/gap-analysis/${sessionId}/chat`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Error clearing gap chat conversation:', err);
      alert('Failed to clear conversation');
    }
  }, [sessionId]);

  return {
    messages,
    isLoading,
    initialLoading,
    sendMessage,
    loadMessages,
    clearConversation,
  };
}
