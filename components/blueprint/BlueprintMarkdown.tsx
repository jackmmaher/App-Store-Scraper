'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReactNode, Children, isValidElement, cloneElement } from 'react';

interface BlueprintMarkdownProps {
  content: string;
}

// Regex to match hex color codes: #XXXXXX or #XXX (with word boundaries that work)
// This pattern matches # followed by exactly 6 or 3 hex chars, not followed by more hex chars
const HEX_PATTERN = /#([A-Fa-f0-9]{6})(?![A-Fa-f0-9])|#([A-Fa-f0-9]{3})(?![A-Fa-f0-9])/g;

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
                  className="inline-block w-4 h-4 rounded border border-gray-300 dark:border-gray-600 align-middle flex-shrink-0"
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

        // Process all text-containing elements
        p: ({ children, ...props }) => <p {...props}>{processChildrenForHex(children)}</p>,
        td: ({ children, ...props }) => <td {...props}>{processChildrenForHex(children)}</td>,
        th: ({ children, ...props }) => <th {...props}>{processChildrenForHex(children)}</th>,
        li: ({ children, ...props }) => <li {...props}>{processChildrenForHex(children)}</li>,
        strong: ({ children, ...props }) => <strong {...props}>{processChildrenForHex(children)}</strong>,
        em: ({ children, ...props }) => <em {...props}>{processChildrenForHex(children)}</em>,
        h1: ({ children, ...props }) => <h1 {...props}>{processChildrenForHex(children)}</h1>,
        h2: ({ children, ...props }) => <h2 {...props}>{processChildrenForHex(children)}</h2>,
        h3: ({ children, ...props }) => <h3 {...props}>{processChildrenForHex(children)}</h3>,
        h4: ({ children, ...props }) => <h4 {...props}>{processChildrenForHex(children)}</h4>,
        h5: ({ children, ...props }) => <h5 {...props}>{processChildrenForHex(children)}</h5>,
        h6: ({ children, ...props }) => <h6 {...props}>{processChildrenForHex(children)}</h6>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Recursively process children to find and render hex codes with swatches
 */
function processChildrenForHex(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    // If it's a string, process for hex codes
    if (typeof child === 'string') {
      return renderHexWithSwatches(child);
    }

    // If it's a valid React element with children, recursively process
    if (isValidElement(child) && child.props.children) {
      return cloneElement(child, {
        ...child.props,
        children: processChildrenForHex(child.props.children),
      });
    }

    // Return as-is
    return child;
  });
}

/**
 * Render a string with hex codes replaced by swatch + code
 */
function renderHexWithSwatches(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  // Reset regex state
  HEX_PATTERN.lastIndex = 0;

  let match;
  while ((match = HEX_PATTERN.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Get the full hex code (either 6-digit or 3-digit)
    const hex = match[0];

    parts.push(
      <span key={`${match.index}-${hex}`} className="inline-flex items-center gap-1 mx-0.5">
        <span
          className="inline-block w-4 h-4 rounded border border-gray-300 dark:border-gray-600 align-middle flex-shrink-0"
          style={{ backgroundColor: hex }}
          title={hex}
        />
        <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
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

  // Return original text if no hex codes found
  if (parts.length === 0) {
    return text;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
