'use client';

interface FontPreviewProps {
  headingFont: string;
  bodyFont: string;
  style?: string;
  className?: string;
}

/**
 * Preview a font pairing with sample text
 */
export function FontPreview({
  headingFont,
  bodyFont,
  style,
  className = ''
}: FontPreviewProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div
        className="text-lg font-semibold text-gray-900 dark:text-white truncate"
        style={{ fontFamily: `"${headingFont}", sans-serif` }}
        title={headingFont}
      >
        {headingFont}
      </div>
      <div
        className="text-sm text-gray-600 dark:text-gray-400 truncate"
        style={{ fontFamily: `"${bodyFont}", sans-serif` }}
        title={bodyFont}
      >
        {bodyFont}
      </div>
      {style && (
        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
          {style}
        </span>
      )}
    </div>
  );
}

interface FontPairingSwatchProps {
  headingFont: string;
  bodyFont: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Compact font pairing display for buttons/badges
 */
export function FontPairingSwatch({
  headingFont,
  bodyFont,
  size = 'md',
  className = ''
}: FontPairingSwatchProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span
        className={`${sizeClasses[size]} font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[80px]`}
        style={{ fontFamily: `"${headingFont}", sans-serif` }}
        title={headingFont}
      >
        {headingFont}
      </span>
      <span className="text-gray-400">/</span>
      <span
        className={`${sizeClasses[size]} text-gray-500 dark:text-gray-400 truncate max-w-[80px]`}
        style={{ fontFamily: `"${bodyFont}", sans-serif` }}
        title={bodyFont}
      >
        {bodyFont}
      </span>
    </div>
  );
}

interface FontPairingCardProps {
  headingFont: string;
  bodyFont: string;
  headingCategory?: string;
  bodyCategory?: string;
  style?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Clickable font pairing card for selection
 */
export function FontPairingCard({
  headingFont,
  bodyFont,
  headingCategory,
  bodyCategory,
  style,
  selected = false,
  onClick,
  className = ''
}: FontPairingCardProps) {
  const borderClass = selected
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 p-4 rounded-lg border-2 transition-all text-left w-full ${borderClass} ${className}`}
    >
      {/* Heading Font Preview */}
      <div>
        <div
          className="text-xl font-bold text-gray-900 dark:text-white leading-tight"
          style={{ fontFamily: `"${headingFont}", sans-serif` }}
        >
          {headingFont}
        </div>
        {headingCategory && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {headingCategory}
          </span>
        )}
      </div>

      {/* Body Font Preview */}
      <div>
        <div
          className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed"
          style={{ fontFamily: `"${bodyFont}", sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
            style={{ fontFamily: `"${bodyFont}", sans-serif` }}
          >
            {bodyFont}
          </span>
          {bodyCategory && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({bodyCategory})
            </span>
          )}
        </div>
      </div>

      {/* Style Tag */}
      {style && (
        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
            {style}
          </span>
        </div>
      )}
    </button>
  );
}
