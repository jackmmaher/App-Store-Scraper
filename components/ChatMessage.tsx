'use client';

import { useState } from 'react';
import type { ChatMessage as ChatMessageType } from '@/lib/supabase';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [showTimestamp, setShowTimestamp] = useState(false);
  const isUser = message.role === 'user';

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Simple markdown rendering for assistant messages
  const renderContent = (content: string) => {
    if (isUser) {
      return <span className="whitespace-pre-wrap">{content}</span>;
    }

    // Basic markdown: bold, headers, lists, code
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    lines.forEach((line, i) => {
      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${i}`} className="bg-gray-100 dark:bg-gray-800 rounded p-2 my-2 overflow-x-auto text-xs">
              <code>{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
        }
        inCodeBlock = !inCodeBlock;
        return;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }

      // Headers
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(3)}</h3>
        );
        return;
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} className="font-bold text-base mt-3 mb-1">{line.slice(2)}</h2>
        );
        return;
      }

      // Bullet points
      if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={i} className="ml-4 list-disc">{renderInlineMarkdown(line.slice(2))}</li>
        );
        return;
      }

      // Numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numberedMatch) {
        elements.push(
          <li key={i} className="ml-4 list-decimal">{renderInlineMarkdown(numberedMatch[2])}</li>
        );
        return;
      }

      // Empty lines
      if (line.trim() === '') {
        elements.push(<br key={i} />);
        return;
      }

      // Regular paragraph
      elements.push(
        <p key={i} className="my-1">{renderInlineMarkdown(line)}</p>
      );
    });

    return <div className="space-y-0">{elements}</div>;
  };

  // Render inline markdown (bold, italic, code)
  const renderInlineMarkdown = (text: string): React.ReactNode => {
    // Simple pattern matching for **bold** and `code`
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIndex = 0;

    while (remaining.length > 0) {
      // Check for bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Check for inline code
      const codeMatch = remaining.match(/`([^`]+)`/);

      // Find which comes first
      const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
      const codeIndex = codeMatch ? remaining.indexOf(codeMatch[0]) : -1;

      if (boldIndex === -1 && codeIndex === -1) {
        parts.push(remaining);
        break;
      }

      const firstMatch = (codeIndex !== -1 && (boldIndex === -1 || codeIndex < boldIndex)) ? 'code' : 'bold';

      if (firstMatch === 'code' && codeMatch) {
        if (codeIndex > 0) {
          parts.push(remaining.slice(0, codeIndex));
        }
        parts.push(
          <code key={keyIndex++} className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeIndex + codeMatch[0].length);
      } else if (boldMatch) {
        if (boldIndex > 0) {
          parts.push(remaining.slice(0, boldIndex));
        }
        parts.push(<strong key={keyIndex++}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldIndex + boldMatch[0].length);
      }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div
        className={`relative max-w-[85%] px-3 py-2 rounded-lg text-sm ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
        }`}
      >
        {renderContent(message.content)}

        {/* Timestamp tooltip */}
        {showTimestamp && (
          <div
            className={`absolute ${isUser ? 'right-0' : 'left-0'} -bottom-5 text-xs text-gray-400 whitespace-nowrap`}
          >
            {formatTimestamp(message.created_at)}
          </div>
        )}
      </div>
    </div>
  );
}
