'use client';

import { useState, useEffect, useCallback } from 'react';

// Inline SVG icons to avoid external dependency
const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const Loader2Icon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const PaletteIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  </svg>
);

const RefreshCwIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface ColorShades {
  [shade: string]: string;
}

interface ColorSpectrum {
  primary: {
    hex: string;
    shades: ColorShades;
  };
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  complementary?: {
    complementary: string;
    analogous1: string;
    analogous2: string;
    triadic1: string;
    triadic2: string;
  };
}

interface ColorSpectrumGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (spectrum: ColorSpectrum) => void;
  initialColor?: string;
}

// Local color spectrum generation (matches Python implementation)
function hexToHsl(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }

  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hueToRgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hueToRgb(p, q, h + 1/3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function generateSpectrum(primaryHex: string): ColorSpectrum {
  const hex = primaryHex.replace('#', '').toUpperCase();
  const [h, s, l] = hexToHsl(hex);

  // Generate shades
  const shades: ColorShades = {};
  const shadeLevels = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  for (const shade of shadeLevels) {
    let newL: number;
    if (shade < 500) {
      const ratio = (500 - shade) / 500;
      newL = l + (95 - l) * ratio;
    } else if (shade > 500) {
      const ratio = (shade - 500) / 450;
      newL = l - (l - 5) * ratio;
    } else {
      newL = l;
    }

    // Adjust saturation at extremes
    let newS = s;
    if (shade <= 100) newS = s * 0.7;
    else if (shade >= 800) newS = s * 0.8;

    shades[String(shade)] = hslToHex(h, newS, newL);
  }

  return {
    primary: {
      hex: `#${hex}`,
      shades,
    },
    semantic: {
      success: hslToHex(142, 70, 45),
      warning: hslToHex(38, 90, 50),
      error: hslToHex(0, 75, 55),
      info: hslToHex(217, 80, 50),
    },
    complementary: {
      complementary: hslToHex((h + 180) % 360, s, l),
      analogous1: hslToHex((h + 30) % 360, s, l),
      analogous2: hslToHex((h - 30 + 360) % 360, s, l),
      triadic1: hslToHex((h + 120) % 360, s, l),
      triadic2: hslToHex((h + 240) % 360, s, l),
    },
  };
}

export function ColorSpectrumGenerator({
  isOpen,
  onClose,
  onApply,
  initialColor = '#3B82F6',
}: ColorSpectrumGeneratorProps) {
  const [colorInput, setColorInput] = useState(initialColor.replace('#', ''));
  const [spectrum, setSpectrum] = useState<ColorSpectrum | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateColors = useCallback(() => {
    const hex = colorInput.replace('#', '');

    // Validate hex
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
      setError('Please enter a valid 6-digit hex color');
      return;
    }

    setError(null);
    setIsLoading(true);

    // Generate locally (instant)
    const newSpectrum = generateSpectrum(hex);
    setSpectrum(newSpectrum);
    setIsLoading(false);
  }, [colorInput]);

  useEffect(() => {
    if (isOpen && colorInput) {
      generateColors();
    }
  }, [isOpen]); // Only on open

  const handleColorChange = (value: string) => {
    // Remove # if pasted
    const cleaned = value.replace('#', '').slice(0, 6);
    setColorInput(cleaned);
  };

  const copyToClipboard = async (color: string) => {
    try {
      await navigator.clipboard.writeText(color);
      setCopiedColor(color);
      setTimeout(() => setCopiedColor(null), 1500);
    } catch {
      console.error('Failed to copy color');
    }
  };

  const handleApply = () => {
    if (spectrum) {
      onApply(spectrum);
      onClose();
    }
  };

  if (!isOpen) return null;

  const sortedShades = spectrum
    ? Object.entries(spectrum.primary.shades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <PaletteIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Color Spectrum Generator
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <XIcon className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Color Input */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Primary Color (Hex)
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">#</span>
                  <input
                    type="text"
                    value={colorInput}
                    onChange={(e) => handleColorChange(e.target.value)}
                    placeholder="3B82F6"
                    maxLength={6}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <input
                  type="color"
                  value={`#${colorInput}`}
                  onChange={(e) => handleColorChange(e.target.value)}
                  className="w-12 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                />
                <button
                  onClick={generateColors}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading ? (
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="w-4 h-4" />
                  )}
                  Generate
                </button>
              </div>
              {error && (
                <p className="text-sm text-red-500 mt-1">{error}</p>
              )}
            </div>
          </div>

          {spectrum && (
            <>
              {/* Shade Spectrum */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Shade Spectrum
                </h3>
                <div className="flex rounded-lg overflow-hidden">
                  {sortedShades.map(([shade, color]) => (
                    <button
                      key={shade}
                      onClick={() => copyToClipboard(color)}
                      className="flex-1 h-16 relative group transition-transform hover:scale-105 hover:z-10"
                      style={{ backgroundColor: color }}
                      title={`${shade}: ${color}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        {copiedColor === color ? (
                          <CheckIcon className="w-4 h-4 text-white" />
                        ) : (
                          <CopyIcon className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex mt-1">
                  {sortedShades.map(([shade]) => (
                    <div key={shade} className="flex-1 text-center text-xs text-zinc-500">
                      {shade}
                    </div>
                  ))}
                </div>
              </div>

              {/* Semantic Colors */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Semantic Colors
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(spectrum.semantic).map(([name, color]) => (
                    <button
                      key={name}
                      onClick={() => copyToClipboard(color)}
                      className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors group"
                    >
                      <div
                        className="w-full h-10 rounded-md mb-2 relative"
                        style={{ backgroundColor: color }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-md">
                          {copiedColor === color ? (
                            <CheckIcon className="w-4 h-4 text-white" />
                          ) : (
                            <CopyIcon className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize">
                        {name}
                      </p>
                      <p className="text-xs text-zinc-500 font-mono">{color}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Complementary Colors */}
              {spectrum.complementary && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                    Color Relationships
                  </h3>
                  <div className="grid grid-cols-5 gap-3">
                    {Object.entries(spectrum.complementary).map(([name, color]) => (
                      <button
                        key={name}
                        onClick={() => copyToClipboard(color)}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors group"
                      >
                        <div
                          className="w-full h-10 rounded-md mb-2 relative"
                          style={{ backgroundColor: color }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-md">
                            {copiedColor === color ? (
                              <CheckIcon className="w-4 h-4 text-white" />
                            ) : (
                              <CopyIcon className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize truncate">
                          {name.replace(/([A-Z])/g, ' $1').replace(/(\d)/g, ' $1').trim()}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono">{color}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!spectrum || isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply to Design System
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ColorSpectrumGenerator;
