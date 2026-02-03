'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BlueprintTypography, BlueprintSection } from '@/lib/supabase';
import { FontPairingCard, FontPairingSwatch } from './FontPreview';

interface FontPairingOption {
  heading_font: string;
  body_font: string;
  heading_category?: string;
  body_category?: string;
  style?: string;
}

type LoadingStage = 'connecting' | 'fetching' | 'processing' | 'done' | 'error';

const LOADING_STAGES: { stage: LoadingStage; label: string; description: string }[] = [
  { stage: 'connecting', label: 'Connecting', description: 'Connecting to font service...' },
  { stage: 'fetching', label: 'Fetching', description: 'Fetching curated font pairings...' },
  { stage: 'processing', label: 'Processing', description: 'Processing font combinations...' },
];

// All available styles for filtering
const STYLE_OPTIONS = ['all', 'modern', 'professional', 'editorial', 'friendly', 'technical', 'bold', 'classic'] as const;
type StyleFilter = typeof STYLE_OPTIONS[number];

interface FontPickerModalProps {
  isOpen: boolean;
  currentTypography: BlueprintTypography | null;
  appCategory?: string;
  onClose: () => void;
  onSelect: (typography: BlueprintTypography, regenerateSections: BlueprintSection[]) => void;
  completedSections: BlueprintSection[];
}

// Sections that would need regeneration if typography changes
const TYPOGRAPHY_AFFECTED_SECTIONS: BlueprintSection[] = ['design_system', 'wireframes', 'aso'];

export default function FontPickerModal({
  isOpen,
  currentTypography,
  appCategory,
  onClose,
  onSelect,
  completedSections,
}: FontPickerModalProps) {
  const [pairings, setPairings] = useState<FontPairingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('connecting');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedPairing, setSelectedPairing] = useState<FontPairingOption | null>(null);
  const [regenerateSections, setRegenerateSections] = useState<BlueprintSection[]>([]);
  const [dataSource, setDataSource] = useState<'scraped' | 'fallback'>('fallback');
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Sections that are completed and would be affected by typography change
  const affectedCompletedSections = completedSections.filter(s =>
    TYPOGRAPHY_AFFECTED_SECTIONS.includes(s)
  );

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const fetchPairings = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setLoadingStage('connecting');
    setElapsedTime(0);
    startTimeRef.current = Date.now();

    // Start elapsed time counter
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    try {
      // Simulate stage progression for UX
      setTimeout(() => setLoadingStage('fetching'), 500);

      // Fetch all font pairings from API (up to 50)
      const response = await fetch('/api/blueprint/fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: appCategory,
          maxPairings: 50,
          forceRefresh,
        }),
        signal: AbortSignal.timeout(forceRefresh ? 30000 : 15000),
      });

      setLoadingStage('processing');

      if (response.ok) {
        const data = await response.json();
        // API now returns structured JSON directly
        if (data.pairings && data.pairings.length > 0) {
          setPairings(data.pairings);
          setDataSource(data.source || 'fallback');
          setTotalAvailable(data.totalAvailable || data.pairings.length);
        } else {
          setPairings(getFallbackPairings());
          setDataSource('fallback');
          setTotalAvailable(getFallbackPairings().length);
        }
        setLoadingStage('done');
      } else {
        // Use fallback pairings
        setPairings(getFallbackPairings());
        setDataSource('fallback');
        setTotalAvailable(getFallbackPairings().length);
        setLoadingStage('done');
      }
    } catch (error) {
      console.error('Failed to fetch font pairings:', error);
      setPairings(getFallbackPairings());
      setDataSource('fallback');
      setTotalAvailable(getFallbackPairings().length);
      setLoadingStage('error');
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLoading(false);
    }
  }, [appCategory]);

  useEffect(() => {
    if (isOpen) {
      fetchPairings(false);
    } else {
      // Reset state when modal closes
      setSelectedPairing(null);
      setRegenerateSections([]);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isOpen, fetchPairings]);

  const handleRefresh = () => {
    fetchPairings(true);
  };

  // Filter pairings by style
  const filteredPairings = styleFilter === 'all'
    ? pairings
    : pairings.filter(p => p.style === styleFilter);

  // Get unique styles from current pairings
  const availableStyles = ['all', ...Array.from(new Set(pairings.map(p => p.style).filter(Boolean)))] as StyleFilter[];

  const handleSelectPairing = (pairing: FontPairingOption) => {
    setSelectedPairing(pairing);
  };

  const handleConfirm = () => {
    if (selectedPairing) {
      onSelect(
        {
          heading_font: selectedPairing.heading_font,
          heading_category: selectedPairing.heading_category,
          body_font: selectedPairing.body_font,
          body_category: selectedPairing.body_category,
          font_pairing_style: selectedPairing.style,
        },
        regenerateSections
      );
    }
    onClose();
  };

  const toggleRegenerateSection = (section: BlueprintSection) => {
    setRegenerateSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Choose Typography
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Select a font pairing for your app design
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh font pairings from sources"
              >
                <svg
                  className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Current Typography */}
          {currentTypography && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Current Typography</p>
              <div className="flex items-center gap-3">
                <FontPairingSwatch
                  headingFont={currentTypography.heading_font}
                  bodyFont={currentTypography.body_font}
                  size="lg"
                />
                {currentTypography.font_pairing_style && (
                  <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
                    {currentTypography.font_pairing_style}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Source indicator */}
          {!loading && (
            <div className="px-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                  dataSource === 'scraped'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {dataSource === 'scraped' ? (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      From FontPair + Google Fonts
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Curated pairings
                    </>
                  )}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {totalAvailable} pairings available
              </span>
            </div>
          )}

          {/* Style Filter */}
          {!loading && pairings.length > 0 && (
            <div className="px-4 pt-2 pb-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Style:</span>
                {availableStyles.map(style => (
                  <button
                    key={style}
                    onClick={() => setStyleFilter(style)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors flex-shrink-0 capitalize ${
                      styleFilter === style
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {style === 'all' ? `All (${pairings.length})` : `${style} (${pairings.filter(p => p.style === style).length})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Font Pairing Grid */}
          <div className="p-4 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 px-4">
                {/* Progress Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Loading Font Pairings
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                    {elapsedTime}s
                  </span>
                </div>

                {/* Stage Progress */}
                <div className="space-y-3">
                  {LOADING_STAGES.map((stage, index) => {
                    const currentIndex = LOADING_STAGES.findIndex(s => s.stage === loadingStage);
                    const isComplete = index < currentIndex;
                    const isCurrent = stage.stage === loadingStage;

                    return (
                      <div key={stage.stage} className="flex items-center gap-3">
                        {/* Status Icon */}
                        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                          {isComplete ? (
                            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : isCurrent ? (
                            <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                          )}
                        </div>

                        {/* Stage Info */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${
                            isCurrent
                              ? 'text-blue-600 dark:text-blue-400'
                              : isComplete
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {stage.label}
                          </div>
                          {isCurrent && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {stage.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress Bar */}
                <div className="mt-4 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
                    style={{
                      width: `${
                        loadingStage === 'connecting' ? 15 :
                        loadingStage === 'fetching' ? 50 :
                        loadingStage === 'processing' ? 85 :
                        100
                      }%`
                    }}
                  />
                </div>
              </div>
            ) : filteredPairings.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                <p>No pairings found{styleFilter !== 'all' ? ` with "${styleFilter}" style` : ''}.</p>
                {styleFilter !== 'all' && (
                  <button
                    onClick={() => setStyleFilter('all')}
                    className="mt-2 text-blue-500 hover:text-blue-600 text-sm"
                  >
                    Show all pairings
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredPairings.map((pairing, i) => (
                  <FontPairingCard
                    key={`${pairing.heading_font}-${pairing.body_font}-${i}`}
                    headingFont={pairing.heading_font}
                    bodyFont={pairing.body_font}
                    headingCategory={pairing.heading_category}
                    bodyCategory={pairing.body_category}
                    style={pairing.style}
                    selected={
                      selectedPairing?.heading_font === pairing.heading_font &&
                      selectedPairing?.body_font === pairing.body_font
                    }
                    onClick={() => handleSelectPairing(pairing)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Regenerate Options */}
          {affectedCompletedSections.length > 0 && selectedPairing && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                Regenerate sections with new typography?
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mb-3">
                These sections have already been generated and reference your current typography.
              </p>
              <div className="flex flex-wrap gap-2">
                {affectedCompletedSections.map(section => (
                  <button
                    key={section}
                    type="button"
                    onClick={() => toggleRegenerateSection(section)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      regenerateSections.includes(section)
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400'
                    }`}
                  >
                    {getSectionName(section)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPairing}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {regenerateSections.length > 0
                ? `Apply & Regenerate (${regenerateSections.length})`
                : 'Apply Typography'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSectionName(section: BlueprintSection): string {
  const names: Record<BlueprintSection, string> = {
    pareto: 'Strategy',
    identity: 'App Identity',
    design_system: 'Design System',
    wireframes: 'Wireframes',
    tech_stack: 'Tech Stack',
    xcode_setup: 'Xcode Setup',
    prd: 'PRD',
    aso: 'ASO',
    manifest: 'Build Manifest',
  };
  return names[section] || section;
}

function getFallbackPairings(): FontPairingOption[] {
  return [
    // Modern/Clean
    { heading_font: 'Inter', body_font: 'Inter', style: 'modern', heading_category: 'sans-serif', body_category: 'sans-serif' },
    { heading_font: 'Space Grotesk', body_font: 'Inter', style: 'modern', heading_category: 'sans-serif', body_category: 'sans-serif' },
    { heading_font: 'Plus Jakarta Sans', body_font: 'Inter', style: 'modern', heading_category: 'sans-serif', body_category: 'sans-serif' },
    { heading_font: 'Manrope', body_font: 'Inter', style: 'modern', heading_category: 'sans-serif', body_category: 'sans-serif' },

    // Professional
    { heading_font: 'Poppins', body_font: 'Open Sans', style: 'professional', heading_category: 'sans-serif', body_category: 'sans-serif' },
    { heading_font: 'Montserrat', body_font: 'Roboto', style: 'professional', heading_category: 'sans-serif', body_category: 'sans-serif' },

    // Editorial
    { heading_font: 'Playfair Display', body_font: 'Lato', style: 'editorial', heading_category: 'serif', body_category: 'sans-serif' },
    { heading_font: 'Merriweather', body_font: 'Open Sans', style: 'editorial', heading_category: 'serif', body_category: 'sans-serif' },

    // Friendly
    { heading_font: 'Nunito', body_font: 'Nunito', style: 'friendly', heading_category: 'sans-serif', body_category: 'sans-serif' },
    { heading_font: 'Quicksand', body_font: 'Open Sans', style: 'friendly', heading_category: 'sans-serif', body_category: 'sans-serif' },

    // Technical
    { heading_font: 'Space Grotesk', body_font: 'JetBrains Mono', style: 'technical', heading_category: 'sans-serif', body_category: 'monospace' },
    { heading_font: 'Inter', body_font: 'Fira Code', style: 'technical', heading_category: 'sans-serif', body_category: 'monospace' },
  ];
}
