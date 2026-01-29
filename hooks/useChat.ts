import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage } from '@/lib/supabase';

interface UseChatProps {
  projectId: string;
  aiAnalysis?: string | null;
}

export function useChat({ projectId, aiAnalysis }: UseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

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

  // Send a message and get Claude's response
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !projectId) return;

    setIsLoading(true);

    // Optimistically add user message
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      project_id: projectId,
      role: 'user',
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: content.trim(),
        }),
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
      console.error('Error sending message:', err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Clear the conversation
  const clearConversation = useCallback(async () => {
    if (!projectId) return;

    if (!confirm('Clear all messages in this conversation?')) return;

    try {
      const res = await fetch(`/api/chat?projectId=${projectId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Error clearing conversation:', err);
      alert('Failed to clear conversation');
    }
  }, [projectId]);

  // Insert analysis as a user message (for context sharing)
  const insertAnalysis = useCallback(() => {
    if (!aiAnalysis) {
      alert('No AI analysis available for this project');
      return null;
    }

    // Return the analysis text so the ChatPanel can insert it into the input
    return aiAnalysis;
  }, [aiAnalysis]);

  return {
    messages,
    isLoading,
    initialLoading,
    sendMessage,
    loadMessages,
    clearConversation,
    insertAnalysis,
  };
}
