'use client';

import { useState } from 'react';
import type { BlueprintSection as BlueprintSectionType, BlueprintSectionStatus, BlueprintAttachment, BlueprintColorPalette, BlueprintTypography } from '@/lib/supabase';
import BlueprintGenerateButton from './BlueprintGenerateButton';
import BlueprintImageUpload from './BlueprintImageUpload';
import BlueprintProgressTracker from './BlueprintProgressTracker';
import { BlueprintMarkdown } from './BlueprintMarkdown';
import { PaletteSwatches } from './ColorSwatch';
import { FontPairingSwatch } from './FontPreview';

interface SectionMeta {
  title: string;
  description: string;
  dependencies: BlueprintSectionType[];
}

const SECTION_META: Record<BlueprintSectionType, SectionMeta> = {
  pareto: {
    title: 'Pareto Strategy',
    description: 'Identify the 20% of features that deliver 80% of the value, plus onboarding, monetization, and architecture decisions.',
    dependencies: [],
  },
  identity: {
    title: 'App Identity',
    description: 'App name options, availability checklist, icon design specs, and visual identity guidelines.',
    dependencies: ['pareto'],
  },
  design_system: {
    title: 'Design System',
    description: 'Colors, typography, spacing, borders, shadows, and component styles with light/dark mode variants.',
    dependencies: ['identity'],
  },
  wireframes: {
    title: 'UI Wireframes',
    description: 'Detailed screen-by-screen specifications for the app UI, using the design system tokens.',
    dependencies: ['pareto', 'design_system'],
  },
  tech_stack: {
    title: 'Tech Stack',
    description: 'Native iOS stack recommendations including Swift/SwiftUI, iPhone APIs, and native Apple services.',
    dependencies: ['pareto', 'wireframes'],
  },
  xcode_setup: {
    title: 'Xcode Setup',
    description: 'Project structure, bundle ID, Info.plist, entitlements, code signing, and App Store Connect setup.',
    dependencies: ['tech_stack', 'identity'],
  },
  prd: {
    title: 'Product Requirements Document',
    description: 'Complete PRD synthesizing strategy, wireframes, and tech stack into requirements, metrics, and timeline.',
    dependencies: ['pareto', 'wireframes', 'tech_stack'],
  },
  aso: {
    title: 'App Store Optimization',
    description: 'Title, subtitle, keywords, description, screenshot strategy, and pricing recommendations.',
    dependencies: ['prd', 'identity', 'design_system'],
  },
  manifest: {
    title: 'Build Manifest',
    description: '50-100 atomic tasks for an AI assistant to build the complete app step-by-step. Each task produces one file or change.',
    dependencies: ['pareto', 'wireframes', 'tech_stack', 'prd'],
  },
};

// Sections that use color palette
const COLOR_SECTIONS: BlueprintSectionType[] = ['identity', 'design_system', 'wireframes', 'aso'];

// Sections that use typography
const TYPOGRAPHY_SECTIONS: BlueprintSectionType[] = ['design_system', 'wireframes', 'aso'];

interface BlueprintSectionProps {
  section: BlueprintSectionType;
  blueprintId: string;
  content: string | null;
  status: BlueprintSectionStatus;
  generatedAt: string | null;
  isGenerating: boolean;
  streamedContent: string;
  statuses: Record<BlueprintSectionType, BlueprintSectionStatus>;
  attachments: BlueprintAttachment[];
  colorPalette?: BlueprintColorPalette | null;
  typography?: BlueprintTypography | null;
  onGenerate: () => void;
  onCancel: () => void;
  onUploadAttachment: (file: File, screenLabel?: string) => Promise<BlueprintAttachment | null>;
  onDeleteAttachment: (attachmentId: string) => Promise<boolean>;
  onChangePalette?: () => void;
  onChangeTypography?: () => void;
  onRefreshAttachments?: () => void;
}

export default function BlueprintSection({
  section,
  blueprintId,
  content,
  status,
  generatedAt,
  isGenerating,
  streamedContent,
  statuses,
  attachments,
  colorPalette,
  typography,
  onGenerate,
  onCancel,
  onUploadAttachment,
  onDeleteAttachment,
  onChangePalette,
  onChangeTypography,
  onRefreshAttachments,
}: BlueprintSectionProps) {
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  const meta = SECTION_META[section];
  const hasPalette = colorPalette?.colors?.length;
  const showPalette = COLOR_SECTIONS.includes(section) && hasPalette;
  // Show "Choose Palette" button on identity section before generation if no palette yet
  const showChoosePalette = section === 'identity' && !hasPalette && statuses.pareto === 'completed';

  // Typography display
  const hasTypography = typography?.heading_font && typography?.body_font;
  const showTypography = TYPOGRAPHY_SECTIONS.includes(section) && hasTypography;
  // Show "Choose Typography" button on design_system section before generation if no typography yet
  const showChooseTypography = section === 'design_system' && !hasTypography && statuses.identity === 'completed';

  // Check if icon already generated (for identity section)
  const iconAttachment = section === 'identity'
    ? attachments.find(a => a.section === 'identity' && a.screen_label?.includes('App Icon'))
    : null;

  // Generate icon handler
  const handleGenerateIcon = async () => {
    setIsGeneratingIcon(true);
    setIconError(null);

    try {
      const response = await fetch('/api/blueprint/generate-icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate icon');
      }

      // Refresh attachments to show the new icon
      onRefreshAttachments?.();
    } catch (error) {
      setIconError(error instanceof Error ? error.message : 'Failed to generate icon');
    } finally {
      setIsGeneratingIcon(false);
    }
  };

  // Check if dependencies are met
  const dependenciesMet = meta.dependencies.every((dep) => statuses[dep] === 'completed');
  const missingDeps = meta.dependencies.filter((dep) => statuses[dep] !== 'completed');

  // Get disabled reason
  let disabledReason: string | undefined;
  if (!dependenciesMet) {
    const depNames = missingDeps.map((d) => SECTION_META[d].title).join(', ');
    disabledReason = `Generate ${depNames} first`;
  }

  // Only show saved content (not streaming content - we show progress tracker instead)
  const displayContent = content;

  // Section-specific attachments
  const sectionAttachments = attachments.filter((a) => a.section === section);

  return (
    <div>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {meta.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {meta.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Choose Palette Button (before generation) */}
          {showChoosePalette && (
            <button
              type="button"
              onClick={onChangePalette}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-colors"
              title="Choose a color palette before generating"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              <span className="text-sm font-medium">Choose Palette</span>
            </button>
          )}
          {/* Color Palette Display (after palette is set) */}
          {showPalette && colorPalette && (
            <button
              type="button"
              onClick={onChangePalette}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Change color palette"
            >
              <PaletteSwatches colors={colorPalette.colors} size="sm" />
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          {/* Choose Typography Button (before generation) */}
          {showChooseTypography && (
            <button
              type="button"
              onClick={onChangeTypography}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 transition-colors"
              title="Choose typography before generating"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              <span className="text-sm font-medium">Choose Fonts</span>
            </button>
          )}
          {/* Typography Display (after typography is set) */}
          {showTypography && typography && (
            <button
              type="button"
              onClick={onChangeTypography}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Change typography"
            >
              <FontPairingSwatch headingFont={typography.heading_font} bodyFont={typography.body_font} size="sm" />
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <BlueprintGenerateButton
            section={section}
            status={status}
            isGenerating={isGenerating}
            canGenerate={dependenciesMet && !isGenerating}
            disabledReason={disabledReason}
            onGenerate={onGenerate}
            onCancel={onCancel}
          />
        </div>
      </div>

      {/* Dependencies Warning */}
      {!dependenciesMet && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {disabledReason}
          </p>
        </div>
      )}

      {/* Image Upload (only for wireframes section) */}
      {section === 'wireframes' && (
        <BlueprintImageUpload
          section={section}
          attachments={sectionAttachments}
          onUpload={onUploadAttachment}
          onDelete={onDeleteAttachment}
        />
      )}

      {/* Content Area */}
      <div className="relative">
        {isGenerating ? (
          /* Progress Tracker - shown while generating */
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg">
            <BlueprintProgressTracker section={section} isGenerating={isGenerating} />
          </div>
        ) : displayContent ? (
          <div>
            <div className="analysis-report bg-gray-50 dark:bg-gray-900 rounded-lg p-4 sm:p-6 max-h-[50vh] sm:max-h-[600px] overflow-y-auto overflow-x-auto">
              <BlueprintMarkdown content={displayContent} />
            </div>

            {/* Icon Generation for Identity Section */}
            {section === 'identity' && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-4">
                  {/* Icon Preview */}
                  {iconAttachment ? (
                    <div className="flex-shrink-0">
                      <img
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blueprint-attachments/${iconAttachment.storage_path}`}
                        alt="Generated App Icon"
                        className="w-24 h-24 rounded-2xl shadow-lg"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  {/* Generate Button */}
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                      {iconAttachment ? 'App Icon Generated' : 'Generate App Icon'}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {iconAttachment
                        ? 'Icon generated with DALL-E 3. Click to regenerate a new version.'
                        : 'Generate a professional app icon using DALL-E 3 based on the icon prompt above.'}
                    </p>

                    {iconError && (
                      <p className="text-sm text-red-600 dark:text-red-400 mb-2">{iconError}</p>
                    )}

                    <button
                      onClick={handleGenerateIcon}
                      disabled={isGeneratingIcon}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isGeneratingIcon
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                      }`}
                    >
                      {isGeneratingIcon ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          {iconAttachment ? 'Regenerate Icon' : 'Generate Icon with DALL-E'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {generatedAt && (
              <p className="text-xs text-gray-400 mt-2">
                Generated on {new Date(generatedAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : status === 'error' ? (
          <div className="text-center py-12 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <svg className="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-600 dark:text-red-400 mb-2">Generation failed</p>
            <p className="text-sm text-gray-500">Click "Generate" to try again</p>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No content generated yet
            </p>
            {dependenciesMet && (
              <p className="text-sm text-gray-400">
                Click "Generate" to create this section
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
