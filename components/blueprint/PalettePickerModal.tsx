'use client';

import { useState, useEffect } from 'react';
import { BlueprintColorPalette, BlueprintSection } from '@/lib/supabase';
import { PaletteCard, PaletteSwatches } from './ColorSwatch';

interface PaletteOption {
  colors: string[];
  mood?: string;
  source_url?: string;
}

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
  const [loading, setLoading] = useState(false);
  const [selectedPalette, setSelectedPalette] = useState<PaletteOption | null>(null);
  const [regenerateSections, setRegeneateSections] = useState<BlueprintSection[]>([]);

  // Sections that are completed and would be affected by palette change
  const affectedCompletedSections = completedSections.filter(s =>
    PALETTE_AFFECTED_SECTIONS.includes(s)
  );

  useEffect(() => {
    if (isOpen) {
      fetchPalettes();
    }
  }, [isOpen, appCategory]);

  const fetchPalettes = async () => {
    setLoading(true);
    try {
      // Try to fetch from crawl service
      const response = await fetch('/api/blueprint/palettes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: appCategory,
          max_palettes: 10,
          force_refresh: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPalettes(data.palettes || []);
      } else {
        // Use fallback palettes
        setPalettes(getFallbackPalettes());
      }
    } catch (error) {
      console.error('Failed to fetch palettes:', error);
      setPalettes(getFallbackPalettes());
    } finally {
      setLoading(false);
    }
  };

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
                Select a new palette for your app design
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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

          {/* Palette Grid */}
          <div className="p-4 max-h-[40vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {palettes.map((palette, i) => (
                  <PaletteCard
                    key={i}
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
