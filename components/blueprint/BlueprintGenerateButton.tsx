'use client';

import type { BlueprintSection, BlueprintSectionStatus } from '@/lib/supabase';

interface BlueprintGenerateButtonProps {
  section: BlueprintSection;
  status: BlueprintSectionStatus;
  isGenerating: boolean;
  canGenerate: boolean;
  disabledReason?: string;
  onGenerate: () => void;
  onCancel: () => void;
}

export default function BlueprintGenerateButton({
  status,
  isGenerating,
  canGenerate,
  disabledReason,
  onGenerate,
  onCancel,
}: BlueprintGenerateButtonProps) {
  if (isGenerating) {
    return (
      <button
        onClick={onCancel}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Cancel
      </button>
    );
  }

  const isRegenerate = status === 'completed';

  return (
    <button
      onClick={onGenerate}
      disabled={!canGenerate}
      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
        canGenerate
          ? isRegenerate
            ? 'bg-orange-600 hover:bg-orange-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
          : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
      }`}
      title={!canGenerate ? disabledReason : undefined}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      {isRegenerate ? 'Regenerate' : 'Generate'}
    </button>
  );
}
