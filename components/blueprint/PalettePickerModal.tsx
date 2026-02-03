'use client';

import { useState, useEffect, useRef } from 'react';
import { BlueprintColorPalette, BlueprintSection } from '@/lib/supabase';
import { PaletteCard, PaletteSwatches } from './ColorSwatch';

interface PaletteOption {
  colors: string[];
  mood?: string;
  source_url?: string;
}

interface PaletteApiResponse {
  palettes: PaletteOption[];
  totalCached: number;
  source: 'crawl_service' | 'fallback' | 'error';
  category?: string;
  mood?: string;
}

type LoadingStage = 'connecting' | 'fetching' | 'processing' | 'done' | 'error';

const LOADING_STAGES: { stage: LoadingStage; label: string; description: string }[] = [
  { stage: 'connecting', label: 'Connecting', description: 'Connecting to palette service...' },
  { stage: 'fetching', label: 'Fetching', description: 'Fetching trending palettes from Coolors...' },
  { stage: 'processing', label: 'Processing', description: 'Processing color combinations...' },
];

// All available moods for filtering
const MOOD_OPTIONS = ['all', 'professional', 'calm', 'playful', 'dark', 'bold', 'warm', 'cool', 'light', 'neutral'] as const;
type MoodFilter = typeof MOOD_OPTIONS[number];

interface PalettePickerModalProps {
  isOpen: boolean;
  currentPalette: BlueprintColorPalette | null;
  appCategory?: string;
  onClose: () => void;
  onSelect: (palette: BlueprintColorPalette, regenerateSections: BlueprintSection[]) => void;
  completedSections: BlueprintSection[];
}

// Sections that would need regeneration if palette changes
const PALETTE_AFFECTED_SECTIONS: BlueprintSection[] = ['identity', 'design_system', 'wireframes', 'aso'];

export default function PalettePickerModal({
  isOpen,
  currentPalette,
  appCategory,
  onClose,
  onSelect,
  completedSections,
}: PalettePickerModalProps) {
  const [palettes, setPalettes] = useState<PaletteOption[]>([]);
  const [totalCached, setTotalCached] = useState(0);
  const [dataSource, setDataSource] = useState<'crawl_service' | 'fallback' | 'error'>('crawl_service');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('connecting');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedPalette, setSelectedPalette] = useState<PaletteOption | null>(null);
  const [regenerateSections, setRegeneateSections] = useState<BlueprintSection[]>([]);
  const [moodFilter, setMoodFilter] = useState<MoodFilter>('all');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Sections that are completed and would be affected by palette change
  const affectedCompletedSections = completedSections.filter(s =>
    PALETTE_AFFECTED_SECTIONS.includes(s)
  );

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPalettes();
    } else {
      // Reset state when modal closes
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isOpen, appCategory]);

  const fetchPalettes = async (forceRefresh = false) => {
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

      // Fetch all cached palettes (up to 50)
      const response = await fetch('/api/blueprint/palettes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: appCategory,
          max_palettes: 50,
          force_refresh: forceRefresh,
        }),
        signal: AbortSignal.timeout(forceRefresh ? 25000 : 15000),
      });

      setLoadingStage('processing');

      if (response.ok) {
        const data: PaletteApiResponse = await response.json();
        setPalettes(data.palettes || []);
        setTotalCached(data.totalCached || data.palettes?.length || 0);
        setDataSource(data.source || 'crawl_service');
        setLoadingStage('done');
      } else {
        // Use fallback palettes
        setPalettes(getFallbackPalettes());
        setTotalCached(getFallbackPalettes().length);
        setDataSource('fallback');
        setLoadingStage('done');
      }
    } catch (error) {
      console.error('Failed to fetch palettes:', error);
      setPalettes(getFallbackPalettes());
      setTotalCached(getFallbackPalettes().length);
      setDataSource('fallback');
      setLoadingStage('error');
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchPalettes(true);
  };

  // Filter palettes by mood
  const filteredPalettes = moodFilter === 'all'
    ? palettes
    : palettes.filter(p => p.mood === moodFilter);

  // Get unique moods from current palettes
  const availableMoods = ['all', ...Array.from(new Set(palettes.map(p => p.mood).filter(Boolean)))] as MoodFilter[];

  const handleSelectPalette = (palette: PaletteOption) => {
    setSelectedPalette(palette);
  };

  const handleConfirm = () => {
    if (selectedPalette) {
      onSelect(
        {
          colors: selectedPalette.colors,
          mood: selectedPalette.mood,
          source_url: selectedPalette.source_url,
        },
        regenerateSections
      );
    }
    onClose();
  };

  const toggleRegenerateSection = (section: BlueprintSection) => {
    setRegeneateSections(prev =>
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
        <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Change Color Palette
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalCached > 0 ? (
                  <>
                    {totalCached} palettes available
                    {dataSource === 'crawl_service' && (
                      <span className="ml-1 text-green-600 dark:text-green-400">(from Coolors)</span>
                    )}
                    {dataSource === 'fallback' && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">(curated)</span>
                    )}
                  </>
                ) : (
                  'Select a new palette for your app design'
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!loading && (
                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                  title="Refresh palettes from Coolors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
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

          {/* Current Palette */}
          {currentPalette && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Current Palette</p>
              <div className="flex items-center gap-3">
                <PaletteSwatches colors={currentPalette.colors} size="lg" />
                {currentPalette.mood && (
                  <span className="text-sm text-gray-600 dark:text-gray-300 capitalize">
                    {currentPalette.mood}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Mood Filter */}
          {!loading && palettes.length > 0 && (
            <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Filter:</span>
                {availableMoods.map(mood => (
                  <button
                    key={mood}
                    onClick={() => setMoodFilter(mood)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors flex-shrink-0 ${
                      moodFilter === mood
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {mood === 'all' ? `All (${palettes.length})` : `${mood} (${palettes.filter(p => p.mood === mood).length})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Palette Grid */}
          <div className="p-4 max-h-[50vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 px-4">
                {/* Progress Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Loading Palettes
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
                    const isPending = index > currentIndex;

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

                {/* Helpful Message */}
                {elapsedTime > 5 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
                    Fetching fresh palettes from Coolors.co...
                  </p>
                )}
                {elapsedTime > 15 && (
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-1 text-center">
                    Taking longer than usual. Will fall back to curated palettes if needed.
                  </p>
                )}
              </div>
            ) : filteredPalettes.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                <p>No palettes found{moodFilter !== 'all' ? ` with "${moodFilter}" mood` : ''}.</p>
                {moodFilter !== 'all' && (
                  <button
                    onClick={() => setMoodFilter('all')}
                    className="mt-2 text-blue-500 hover:text-blue-600 text-sm"
                  >
                    Show all palettes
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredPalettes.map((palette, i) => (
                  <PaletteCard
                    key={`${palette.colors.join('-')}-${i}`}
                    colors={palette.colors}
                    mood={palette.mood}
                    selected={selectedPalette?.colors.join() === palette.colors.join()}
                    onClick={() => handleSelectPalette(palette)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Regenerate Options */}
          {affectedCompletedSections.length > 0 && selectedPalette && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                Regenerate sections with new palette?
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mb-3">
                These sections have already been generated and use colors from your current palette.
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
              disabled={!selectedPalette}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {regenerateSections.length > 0
                ? `Apply & Regenerate (${regenerateSections.length})`
                : 'Apply Palette'
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

function getFallbackPalettes(): PaletteOption[] {
  return [
    { colors: ['264653', '2A9D8F', 'E9C46A', 'F4A261', 'E76F51'], mood: 'professional' },
    { colors: ['003049', 'D62828', 'F77F00', 'FCBF49', 'EAE2B7'], mood: 'bold' },
    { colors: ['1D3557', '457B9D', 'A8DADC', 'F1FAEE', 'E63946'], mood: 'professional' },
    { colors: ['606C38', '283618', 'FEFAE0', 'DDA15E', 'BC6C25'], mood: 'calm' },
    { colors: ['CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD', 'D4A373'], mood: 'calm' },
    { colors: ['0D1B2A', '1B263B', '415A77', '778DA9', 'E0E1DD'], mood: 'dark' },
    { colors: ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'], mood: 'playful' },
    { colors: ['F72585', 'B5179E', '7209B7', '560BAD', '480CA8'], mood: 'bold' },
    { colors: ['03045E', '0077B6', '00B4D8', '90E0EF', 'CAF0F8'], mood: 'cool' },
    { colors: ['FFBE0B', 'FB5607', 'FF006E', '8338EC', '3A86FF'], mood: 'playful' },
  ];
}
