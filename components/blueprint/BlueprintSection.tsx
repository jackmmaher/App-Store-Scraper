'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BlueprintSection as BlueprintSectionType, BlueprintSectionStatus, BlueprintAttachment } from '@/lib/supabase';
import BlueprintGenerateButton from './BlueprintGenerateButton';
import BlueprintImageUpload from './BlueprintImageUpload';
import BlueprintProgressTracker from './BlueprintProgressTracker';

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
  wireframes: {
    title: 'UI Wireframes',
    description: 'Detailed screen-by-screen specifications for the app UI, from onboarding to settings.',
    dependencies: ['pareto'],
  },
  tech_stack: {
    title: 'Tech Stack',
    description: 'Native iOS stack recommendations including Swift/SwiftUI, iPhone APIs, backend services, and third-party SDKs.',
    dependencies: ['pareto', 'wireframes'],
  },
  prd: {
    title: 'Product Requirements Document',
    description: 'Complete PRD synthesizing all previous sections into executive summary, requirements, metrics, and timeline.',
    dependencies: ['pareto', 'wireframes', 'tech_stack'],
  },
};

interface BlueprintSectionProps {
  section: BlueprintSectionType;
  content: string | null;
  status: BlueprintSectionStatus;
  generatedAt: string | null;
  isGenerating: boolean;
  streamedContent: string;
  statuses: Record<BlueprintSectionType, BlueprintSectionStatus>;
  attachments: BlueprintAttachment[];
  onGenerate: () => void;
  onCancel: () => void;
  onUploadAttachment: (file: File, screenLabel?: string) => Promise<BlueprintAttachment | null>;
  onDeleteAttachment: (attachmentId: string) => Promise<boolean>;
}

export default function BlueprintSection({
  section,
  content,
  status,
  generatedAt,
  isGenerating,
  streamedContent,
  statuses,
  attachments,
  onGenerate,
  onCancel,
  onUploadAttachment,
  onDeleteAttachment,
}: BlueprintSectionProps) {
  const meta = SECTION_META[section];

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
          <div className="prose dark:prose-invert max-w-none">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 max-h-[600px] overflow-y-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
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
