'use client';

interface ColorSwatchProps {
  color: string; // Hex code with or without #
  size?: 'sm' | 'md' | 'lg';
  showHex?: boolean;
  className?: string;
}

/**
 * Single color swatch display
 */
export function ColorSwatch({
  color,
  size = 'md',
  showHex = false,
  className = ''
}: ColorSwatchProps) {
  const hex = color.startsWith('#') ? color : `#${color}`;

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`${sizeClasses[size]} rounded border border-gray-300 dark:border-gray-600 flex-shrink-0`}
        style={{ backgroundColor: hex }}
        title={hex}
      />
      {showHex && (
        <code className="text-xs font-mono text-gray-600 dark:text-gray-400">
          {hex}
        </code>
      )}
    </span>
  );
}

interface PaletteSwatchesProps {
  colors: string[]; // Array of hex codes
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

/**
 * Display a row of color swatches for a palette
 */
export function PaletteSwatches({
  colors,
  size = 'md',
  className = ''
}: PaletteSwatchesProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {colors.map((color, i) => {
        const hex = color.startsWith('#') ? color : `#${color}`;
        const roundedClass = i === 0 ? 'rounded-l' : i === colors.length - 1 ? 'rounded-r' : '';
        return (
          <span
            key={i}
            className={`${sizeClasses[size]} border border-gray-200 dark:border-gray-700 ${roundedClass}`}
            style={{ backgroundColor: hex }}
            title={hex}
          />
        );
      })}
    </div>
  );
}

interface PaletteCardProps {
  colors: string[];
  mood?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Clickable palette card for selection
 */
export function PaletteCard({
  colors,
  mood,
  selected = false,
  onClick,
  className = ''
}: PaletteCardProps) {
  const borderClass = selected
    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 p-3 rounded-lg border-2 transition-all ${borderClass} ${className}`}
    >
      <div className="flex gap-1">
        {colors.map((color, i) => {
          const hex = color.startsWith('#') ? color : `#${color}`;
          return (
            <div
              key={i}
              className="w-10 h-10 rounded"
              style={{ backgroundColor: hex }}
              title={hex}
            />
          );
        })}
      </div>
      {mood && (
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
          {mood}
        </span>
      )}
    </button>
  );
}
