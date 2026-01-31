'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReactNode } from 'react';

interface BlueprintMarkdownProps {
  content: string;
}

// Regex to match hex color codes: #XXXXXX or #XXX
const HEX_PATTERN = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;

/**
 * Custom markdown renderer that displays hex color codes as inline swatches
 */
export function BlueprintMarkdown({ content }: BlueprintMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Custom code renderer for inline hex codes
        code: ({ children, className, ...props }) => {
          const text = String(children).trim();

          // Check if this is a hex color code
          if (/^#[A-Fa-f0-9]{6}$/.test(text) || /^#[A-Fa-f0-9]{3}$/.test(text)) {
            return (
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-4 h-4 rounded border border-gray-300 dark:border-gray-600 align-middle"
                  style={{ backgroundColor: text }}
                  title={text}
                />
                <code className={className} {...props}>
                  {children}
                </code>
              </span>
            );
          }

          // Default code rendering
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },

        // Custom paragraph renderer to catch hex codes in plain text
        p: ({ children, ...props }) => {
          return <p {...props}>{processChildrenForHex(children)}</p>;
        },

        // Custom table cell renderer
        td: ({ children, ...props }) => {
          return <td {...props}>{processChildrenForHex(children)}</td>;
        },

        // Custom list item renderer
        li: ({ children, ...props }) => {
          return <li {...props}>{processChildrenForHex(children)}</li>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Process children to find and render hex codes with swatches
 */
function processChildrenForHex(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    return renderHexWithSwatches(children);
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{renderHexWithSwatches(child)}</span>;
      }
      return child;
    });
  }

  return children;
}

/**
 * Render a string with hex codes replaced by swatch + code
 */
function renderHexWithSwatches(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex state
  HEX_PATTERN.lastIndex = 0;

  while ((match = HEX_PATTERN.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const hex = match[0];
    parts.push(
      <span key={match.index} className="inline-flex items-center gap-1">
        <span
          className="inline-block w-3.5 h-3.5 rounded border border-gray-300 dark:border-gray-600 align-middle"
          style={{ backgroundColor: hex }}
          title={hex}
        />
        <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
          {hex}
        </code>
      </span>
    );

    lastIndex = HEX_PATTERN.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}
