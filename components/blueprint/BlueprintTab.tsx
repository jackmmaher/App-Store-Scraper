'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BlueprintSection as BlueprintSectionType, BlueprintAttachment, ProjectBlueprint } from '@/lib/supabase';
import { useBlueprint } from '@/hooks/useBlueprint';
import { useBlueprintGenerate } from '@/hooks/useBlueprintGenerate';
import BlueprintSectionNav from './BlueprintSectionNav';
import BlueprintSectionComponent from './BlueprintSection';
import BlueprintExportBar from './BlueprintExportBar';

interface BlueprintTabProps {
  projectId: string;
}

export default function BlueprintTab({ projectId }: BlueprintTabProps) {
  const [activeSection, setActiveSection] = useState<BlueprintSectionType>('pareto');

  const {
    blueprint,
    attachments,
    loading,
    error,
    uploadAttachment,
    deleteAttachment,
    getExportUrl,
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
    if (blueprint) {
      generateSection(activeSection, blueprint.id);
    }
  }, [blueprint, activeSection, generateSection]);

  // Handle upload
  const handleUpload = useCallback(async (file: File, screenLabel?: string): Promise<BlueprintAttachment | null> => {
    return uploadAttachment(activeSection, file, screenLabel);
  }, [activeSection, uploadAttachment]);

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
      case 'wireframes':
        return blueprint.ui_wireframes;
      case 'tech_stack':
        return blueprint.tech_stack;
      case 'prd':
        return blueprint.prd_content;
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
      case 'wireframes':
        return blueprint.ui_wireframes_generated_at;
      case 'tech_stack':
        return blueprint.tech_stack_generated_at;
      case 'prd':
        return blueprint.prd_generated_at;
      case 'manifest':
        return blueprint.build_manifest_generated_at;
      default:
        return null;
    }
  };

  const statuses = {
    pareto: blueprint.pareto_status,
    wireframes: blueprint.ui_wireframes_status,
    tech_stack: blueprint.tech_stack_status,
    prd: blueprint.prd_status,
    manifest: blueprint.build_manifest_status,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Section Navigation */}
      <BlueprintSectionNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        statuses={statuses}
        generatingSection={currentSection}
      />

      {/* Error Display */}
      {generateError && (
        <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
        </div>
      )}

      {/* Section Content */}
      <div className="flex-1 p-6 overflow-auto">
        <BlueprintSectionComponent
          section={activeSection}
          content={getSectionContent(activeSection)}
          status={statuses[activeSection]}
          generatedAt={getSectionGeneratedAt(activeSection)}
          isGenerating={isGenerating && currentSection === activeSection}
          streamedContent={currentSection === activeSection ? streamedContent : ''}
          statuses={statuses}
          attachments={attachments}
          onGenerate={handleGenerate}
          onCancel={cancelGeneration}
          onUploadAttachment={handleUpload}
          onDeleteAttachment={deleteAttachment}
        />
      </div>

      {/* Export Bar */}
      <BlueprintExportBar blueprint={blueprint} exportUrl={getExportUrl()} />
    </div>
  );
}
