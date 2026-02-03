'use client';

import { useState, useEffect } from 'react';

// Inline SVG icons to avoid external dependency
const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

const TypeIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

interface FontOption {
  family: string;
  category: string;
  weights: string[];
}

interface FontPairing {
  headingFont: string;
  bodyFont: string;
  headingCategory: string;
  bodyCategory: string;
  style?: string;
}

interface FontPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: {
    headingFont: string;
    bodyFont: string;
    headingWeights: string[];
    bodyWeights: string[];
  }) => void;
  category?: string;
  currentHeadingFont?: string;
  currentBodyFont?: string;
}

// Curated font list (fallback/default)
const DEFAULT_FONTS: FontOption[] = [
  { family: 'Inter', category: 'sans-serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'Roboto', category: 'sans-serif', weights: ['300', '400', '500', '700'] },
  { family: 'Open Sans', category: 'sans-serif', weights: ['300', '400', '600', '700'] },
  { family: 'Poppins', category: 'sans-serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'Montserrat', category: 'sans-serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'Lato', category: 'sans-serif', weights: ['300', '400', '700'] },
  { family: 'DM Sans', category: 'sans-serif', weights: ['400', '500', '700'] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'Playfair Display', category: 'serif', weights: ['400', '500', '600', '700'] },
  { family: 'Merriweather', category: 'serif', weights: ['300', '400', '700'] },
  { family: 'Lora', category: 'serif', weights: ['400', '500', '600', '700'] },
  { family: 'Crimson Pro', category: 'serif', weights: ['300', '400', '500', '600', '700'] },
  { family: 'JetBrains Mono', category: 'monospace', weights: ['300', '400', '500', '700'] },
  { family: 'Fira Code', category: 'monospace', weights: ['300', '400', '500', '700'] },
];

const DEFAULT_PAIRINGS: FontPairing[] = [
  { headingFont: 'Inter', bodyFont: 'Inter', headingCategory: 'sans-serif', bodyCategory: 'sans-serif', style: 'modern' },
  { headingFont: 'Space Grotesk', bodyFont: 'Inter', headingCategory: 'sans-serif', bodyCategory: 'sans-serif', style: 'modern' },
  { headingFont: 'Poppins', bodyFont: 'Open Sans', headingCategory: 'sans-serif', bodyCategory: 'sans-serif', style: 'professional' },
  { headingFont: 'Montserrat', bodyFont: 'Roboto', headingCategory: 'sans-serif', bodyCategory: 'sans-serif', style: 'professional' },
  { headingFont: 'Playfair Display', bodyFont: 'Lato', headingCategory: 'serif', bodyCategory: 'sans-serif', style: 'editorial' },
  { headingFont: 'Merriweather', bodyFont: 'Open Sans', headingCategory: 'serif', bodyCategory: 'sans-serif', style: 'editorial' },
  { headingFont: 'DM Sans', bodyFont: 'DM Sans', headingCategory: 'sans-serif', bodyCategory: 'sans-serif', style: 'modern' },
  { headingFont: 'Space Grotesk', bodyFont: 'JetBrains Mono', headingCategory: 'sans-serif', bodyCategory: 'monospace', style: 'technical' },
];

export function FontPickerModal({
  isOpen,
  onClose,
  onSelect,
  category,
  currentHeadingFont,
  currentBodyFont,
}: FontPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'pairings' | 'custom'>('pairings');
  const [fonts] = useState<FontOption[]>(DEFAULT_FONTS);
  const [pairings] = useState<FontPairing[]>(DEFAULT_PAIRINGS);
  const [selectedHeading, setSelectedHeading] = useState<string>(currentHeadingFont || 'Inter');
  const [selectedBody, setSelectedBody] = useState<string>(currentBodyFont || 'Inter');
  const [selectedWeights, setSelectedWeights] = useState<string[]>(['400', '500', '600', '700']);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentHeadingFont) setSelectedHeading(currentHeadingFont);
    if (currentBodyFont) setSelectedBody(currentBodyFont);
  }, [currentHeadingFont, currentBodyFont]);

  const handlePairingSelect = (pairing: FontPairing) => {
    setSelectedHeading(pairing.headingFont);
    setSelectedBody(pairing.bodyFont);
  };

  const handleConfirm = () => {
    setIsLoading(true);

    const headingFont = fonts.find(f => f.family === selectedHeading);
    const bodyFont = fonts.find(f => f.family === selectedBody);

    onSelect({
      headingFont: selectedHeading,
      bodyFont: selectedBody,
      headingWeights: headingFont?.weights || selectedWeights,
      bodyWeights: bodyFont?.weights || selectedWeights,
    });

    setIsLoading(false);
    onClose();
  };

  const toggleWeight = (weight: string) => {
    setSelectedWeights(prev =>
      prev.includes(weight)
        ? prev.filter(w => w !== weight)
        : [...prev, weight].sort()
    );
  };

  if (!isOpen) return null;

  const groupedFonts = fonts.reduce((acc, font) => {
    if (!acc[font.category]) acc[font.category] = [];
    acc[font.category].push(font);
    return acc;
  }, {} as Record<string, FontOption[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-3">
            <TypeIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Select Typography
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <XIcon className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setActiveTab('pairings')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'pairings'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <SparklesIcon className="w-4 h-4 inline-block mr-2" />
            Curated Pairings
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'custom'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Custom Selection
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          {activeTab === 'pairings' ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Professional font combinations for app design:
              </p>
              {pairings.map((pairing, index) => (
                <button
                  key={index}
                  onClick={() => handlePairingSelect(pairing)}
                  className={`w-full p-4 rounded-lg border transition-all text-left ${
                    selectedHeading === pairing.headingFont && selectedBody === pairing.bodyFont
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-lg font-semibold text-zinc-900 dark:text-white"
                          style={{ fontFamily: `"${pairing.headingFont}", sans-serif` }}
                        >
                          {pairing.headingFont}
                        </span>
                        <span className="text-zinc-400">+</span>
                        <span
                          className="text-lg text-zinc-700 dark:text-zinc-300"
                          style={{ fontFamily: `"${pairing.bodyFont}", sans-serif` }}
                        >
                          {pairing.bodyFont}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {pairing.style}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {pairing.headingCategory} / {pairing.bodyCategory}
                        </span>
                      </div>
                    </div>
                    {selectedHeading === pairing.headingFont && selectedBody === pairing.bodyFont && (
                      <CheckIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Heading Font */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Heading Font
                </label>
                <select
                  value={selectedHeading}
                  onChange={(e) => setSelectedHeading(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Object.entries(groupedFonts).map(([category, categoryFonts]) => (
                    <optgroup key={category} label={category}>
                      {categoryFonts.map((font) => (
                        <option key={font.family} value={font.family}>
                          {font.family}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Body Font */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Body Font
                </label>
                <select
                  value={selectedBody}
                  onChange={(e) => setSelectedBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Object.entries(groupedFonts).map(([category, categoryFonts]) => (
                    <optgroup key={category} label={category}>
                      {categoryFonts.map((font) => (
                        <option key={font.family} value={font.family}>
                          {font.family}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Font Weights */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Font Weights
                </label>
                <div className="flex flex-wrap gap-2">
                  {['300', '400', '500', '600', '700'].map((weight) => (
                    <button
                      key={weight}
                      onClick={() => toggleWeight(weight)}
                      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                        selectedWeights.includes(weight)
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      {weight}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Preview</p>
                <h3
                  className="text-2xl font-bold text-zinc-900 dark:text-white mb-2"
                  style={{ fontFamily: `"${selectedHeading}", sans-serif` }}
                >
                  Heading Text Example
                </h3>
                <p
                  className="text-base text-zinc-700 dark:text-zinc-300"
                  style={{ fontFamily: `"${selectedBody}", sans-serif` }}
                >
                  Body text example showing how your content will appear with the selected font pairing.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Selected: <span className="font-medium">{selectedHeading}</span> / <span className="font-medium">{selectedBody}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <Loader2Icon className="w-4 h-4 animate-spin" />}
              Apply Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FontPickerModal;
