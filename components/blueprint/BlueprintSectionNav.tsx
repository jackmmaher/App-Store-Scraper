'use client';

import type { BlueprintSection, BlueprintSectionStatus } from '@/lib/supabase';

// Extended section type to include 'notes' pseudo-section
export type BlueprintNavSection = BlueprintSection | 'notes';

interface SectionInfo {
  id: BlueprintNavSection;
  label: string;
  shortLabel: string;
  number: number;
}

const SECTIONS: SectionInfo[] = [
  { id: 'notes', label: 'Your Notes', shortLabel: 'Notes', number: 0 },
  { id: 'pareto', label: 'Strategy', shortLabel: 'Strategy', number: 1 },
  { id: 'identity', label: 'App Identity', shortLabel: 'Identity', number: 2 },
  { id: 'design_system', label: 'Design System', shortLabel: 'Design', number: 3 },
  { id: 'wireframes', label: 'Wireframes', shortLabel: 'UI', number: 4 },
  { id: 'tech_stack', label: 'Tech Stack', shortLabel: 'Tech', number: 5 },
  { id: 'xcode_setup', label: 'Xcode Setup', shortLabel: 'Xcode', number: 6 },
  { id: 'prd', label: 'PRD', shortLabel: 'PRD', number: 7 },
  { id: 'aso', label: 'ASO', shortLabel: 'ASO', number: 8 },
  { id: 'manifest', label: 'Build Manifest', shortLabel: 'Build', number: 9 },
];

interface BlueprintSectionNavProps {
  activeSection: BlueprintNavSection;
  onSectionChange: (section: BlueprintNavSection) => void;
  statuses: Record<BlueprintSection, BlueprintSectionStatus>;
  generatingSection: BlueprintSection | null;
  hasNotes?: boolean;
  notesOutOfSync?: boolean;
}

function StatusIndicator({ status, isGenerating }: { status: BlueprintSectionStatus; isGenerating: boolean }) {
  if (isGenerating) {
    return (
      <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }

  switch (status) {
    case 'completed':
      return (
        <span className="w-2 h-2 rounded-full bg-green-500" title="Completed" />
      );
    case 'generating':
      return (
        <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      );
    case 'error':
      return (
        <span className="w-2 h-2 rounded-full bg-red-500" title="Error" />
      );
    case 'pending':
    default:
      return (
        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" title="Pending" />
      );
  }
}

export default function BlueprintSectionNav({
  activeSection,
  onSectionChange,
  statuses,
  generatingSection,
  hasNotes = false,
  notesOutOfSync = false,
}: BlueprintSectionNavProps) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        const isGenerating = section.id !== 'notes' && generatingSection === section.id;
        const isNotesSection = section.id === 'notes';

        // For notes section, show special indicator
        const notesIndicator = isNotesSection ? (
          hasNotes ? (
            notesOutOfSync ? (
              <span className="w-2 h-2 rounded-full bg-yellow-500" title="Notes changed since snapshot" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-blue-500" title="Notes captured" />
            )
          ) : (
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" title="No notes" />
          )
        ) : null;

        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="hidden sm:inline">{section.number}.</span>
            <span className="hidden sm:inline">{section.label}</span>
            <span className="sm:hidden">{section.number}. {section.shortLabel}</span>
            {isNotesSection ? notesIndicator : (
              <StatusIndicator status={statuses[section.id as BlueprintSection]} isGenerating={isGenerating} />
            )}
          </button>
        );
      })}
    </div>
  );
}
