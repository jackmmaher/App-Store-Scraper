'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BlueprintSection as BlueprintSectionType, BlueprintAttachment, ProjectBlueprint, BlueprintColorPalette, BlueprintTypography } from '@/lib/supabase';
import { useBlueprint } from '@/hooks/useBlueprint';
import { useBlueprintGenerate } from '@/hooks/useBlueprintGenerate';
import BlueprintSectionNav, { type BlueprintNavSection } from './BlueprintSectionNav';
import BlueprintSectionComponent from './BlueprintSection';
import BlueprintExportBar from './BlueprintExportBar';
import PalettePickerModal from './PalettePickerModal';
import FontPickerModal from './FontPickerModal';
import BlueprintNotesSection from './BlueprintNotesSection';

interface BlueprintTabProps {
  projectId: string;
}

export default function BlueprintTab({ projectId }: BlueprintTabProps) {
  const [activeSection, setActiveSection] = useState<BlueprintNavSection>('pareto');
  const [paletteModalOpen, setPaletteModalOpen] = useState(false);
  const [typographyModalOpen, setTypographyModalOpen] = useState(false);

  const {
    blueprint,
    attachments,
    projectNotes,
    loading,
    error,
    uploadAttachment,
    deleteAttachment,
    refreshAttachments,
    getExportUrl,
    syncNotesSnapshot,
    setBlueprint,
  } = useBlueprint({ projectId });

  const {
    isGenerating,
    currentSection,
    streamedContent,
    error: generateError,
    generateSection,
    cancelGeneration,
    clearStreamedContent,
  } = useBlueprintGenerate({
    blueprintId: blueprint?.id,
    onComplete: useCallback((section: BlueprintSectionType) => {
      console.log(`Completed generating ${section}`);
    }, []),
    onBlueprintUpdate: useCallback((updatedBlueprint: ProjectBlueprint) => {
      setBlueprint(updatedBlueprint);
    }, [setBlueprint]),
  });

  // Clear streamed content when changing sections
  useEffect(() => {
    clearStreamedContent();
  }, [activeSection, clearStreamedContent]);

  // Handle generate
  const handleGenerate = useCallback(() => {
    if (blueprint && activeSection !== 'notes') {
      generateSection(activeSection as BlueprintSectionType, blueprint.id);
    }
  }, [blueprint, activeSection, generateSection]);

  // Handle upload
  const handleUpload = useCallback(async (file: File, screenLabel?: string): Promise<BlueprintAttachment | null> => {
    if (activeSection === 'notes') return null;
    return uploadAttachment(activeSection as BlueprintSectionType, file, screenLabel);
  }, [activeSection, uploadAttachment]);

  // Handle palette change
  const handlePaletteChange = useCallback(async (
    palette: BlueprintColorPalette,
    sectionsToRegenerate: BlueprintSectionType[]
  ) => {
    if (!blueprint) return;

    // Update palette via API route (uses service key to bypass RLS)
    try {
      const response = await fetch('/api/blueprint/palette', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintId: blueprint.id,
          palette,
          source: 'user_selected',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Failed to update palette:', data.error);
        return;
      }

      const { blueprint: updated } = await response.json();
      setBlueprint(updated);

      // Regenerate selected sections
      for (const section of sectionsToRegenerate) {
        // Small delay between regenerations
        await new Promise(resolve => setTimeout(resolve, 500));
        generateSection(section, blueprint.id);
      }
    } catch (error) {
      console.error('Error updating palette:', error);
    }
  }, [blueprint, setBlueprint, generateSection]);

  // Handle typography change
  const handleTypographyChange = useCallback(async (
    typography: BlueprintTypography,
    sectionsToRegenerate: BlueprintSectionType[]
  ) => {
    if (!blueprint) return;

    // Update typography via API route
    try {
      const response = await fetch('/api/blueprint/typography', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintId: blueprint.id,
          typography,
          source: 'user_selected',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('Failed to update typography:', data.error);
        return;
      }

      const { blueprint: updated } = await response.json();
      setBlueprint(updated);

      // Regenerate selected sections
      for (const section of sectionsToRegenerate) {
        // Small delay between regenerations
        await new Promise(resolve => setTimeout(resolve, 500));
        generateSection(section, blueprint.id);
      }
    } catch (error) {
      console.error('Error updating typography:', error);
    }
  }, [blueprint, setBlueprint, generateSection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || !blueprint) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 inline-block">
          <p className="text-red-600 dark:text-red-400">
            {error || 'Failed to load blueprint'}
          </p>
        </div>
      </div>
    );
  }

  // Get section content based on active section
  const getSectionContent = (section: BlueprintSectionType): string | null => {
    switch (section) {
      case 'pareto':
        return blueprint.pareto_strategy;
      case 'identity':
        return blueprint.app_identity;
      case 'design_system':
        return blueprint.design_system;
      case 'wireframes':
        return blueprint.ui_wireframes;
      case 'tech_stack':
        return blueprint.tech_stack;
      case 'xcode_setup':
        return blueprint.xcode_setup;
      case 'prd':
        return blueprint.prd_content;
      case 'aso':
        return blueprint.aso_content;
      case 'manifest':
        return blueprint.build_manifest;
      default:
        return null;
    }
  };

  const getSectionGeneratedAt = (section: BlueprintSectionType): string | null => {
    switch (section) {
      case 'pareto':
        return blueprint.pareto_generated_at;
      case 'identity':
        return blueprint.app_identity_generated_at;
      case 'design_system':
        return blueprint.design_system_generated_at;
      case 'wireframes':
        return blueprint.ui_wireframes_generated_at;
      case 'tech_stack':
        return blueprint.tech_stack_generated_at;
      case 'xcode_setup':
        return blueprint.xcode_setup_generated_at;
      case 'prd':
        return blueprint.prd_generated_at;
      case 'aso':
        return blueprint.aso_generated_at;
      case 'manifest':
        return blueprint.build_manifest_generated_at;
      default:
        return null;
    }
  };

  const statuses = {
    pareto: blueprint.pareto_status,
    identity: blueprint.app_identity_status,
    design_system: blueprint.design_system_status,
    wireframes: blueprint.ui_wireframes_status,
    tech_stack: blueprint.tech_stack_status,
    xcode_setup: blueprint.xcode_setup_status,
    prd: blueprint.prd_status,
    aso: blueprint.aso_status,
    manifest: blueprint.build_manifest_status,
  };

  // Get completed sections for palette modal
  const completedSections = Object.entries(statuses)
    .filter(([, status]) => status === 'completed')
    .map(([section]) => section as BlueprintSectionType);

  // Check if notes are out of sync
  const hasNotes = Boolean(projectNotes?.trim());
  const hasSnapshot = Boolean(blueprint.notes_snapshot?.trim());
  const notesOutOfSync = hasSnapshot && projectNotes !== blueprint.notes_snapshot;

  // Check if this is first generation (no sections completed yet)
  const isFirstGeneration = Object.values(statuses).every(s => s !== 'completed');

  return (
    <div className="flex flex-col h-full">
      {/* Section Navigation */}
      <BlueprintSectionNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        statuses={statuses}
        generatingSection={currentSection}
        hasNotes={hasNotes || hasSnapshot}
        notesOutOfSync={notesOutOfSync}
      />

      {/* Error Display */}
      {generateError && (
        <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
        </div>
      )}

      {/* Section Content */}
      <div className="flex-1 p-6 overflow-auto">
        {activeSection === 'notes' ? (
          <BlueprintNotesSection
            projectNotes={projectNotes}
            notesSnapshot={blueprint.notes_snapshot}
            notesSnapshotAt={blueprint.notes_snapshot_at}
            onSyncNotes={syncNotesSnapshot}
            isFirstGeneration={isFirstGeneration}
          />
        ) : (
          <BlueprintSectionComponent
            section={activeSection as BlueprintSectionType}
            blueprintId={blueprint.id}
            content={getSectionContent(activeSection as BlueprintSectionType)}
            status={statuses[activeSection as BlueprintSectionType]}
            generatedAt={getSectionGeneratedAt(activeSection as BlueprintSectionType)}
            isGenerating={isGenerating && currentSection === activeSection}
            streamedContent={currentSection === activeSection ? streamedContent : ''}
            statuses={statuses}
            attachments={attachments}
            colorPalette={blueprint.color_palette}
            typography={blueprint.typography}
            onGenerate={handleGenerate}
            onCancel={cancelGeneration}
            onUploadAttachment={handleUpload}
            onDeleteAttachment={deleteAttachment}
            onChangePalette={() => setPaletteModalOpen(true)}
            onChangeTypography={() => setTypographyModalOpen(true)}
            onRefreshAttachments={refreshAttachments}
          />
        )}
      </div>

      {/* Export Bar */}
      <BlueprintExportBar blueprint={blueprint} exportUrl={getExportUrl()} />

      {/* Palette Picker Modal */}
      <PalettePickerModal
        isOpen={paletteModalOpen}
        currentPalette={blueprint.color_palette}
        onClose={() => setPaletteModalOpen(false)}
        onSelect={handlePaletteChange}
        completedSections={completedSections}
      />

      {/* Font Picker Modal */}
      <FontPickerModal
        isOpen={typographyModalOpen}
        currentTypography={blueprint.typography}
        onClose={() => setTypographyModalOpen(false)}
        onSelect={handleTypographyChange}
        completedSections={completedSections}
      />
    </div>
  );
}
