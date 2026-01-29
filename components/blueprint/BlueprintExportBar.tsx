'use client';

import type { ProjectBlueprint } from '@/lib/supabase';

interface BlueprintExportBarProps {
  blueprint: ProjectBlueprint;
  exportUrl: string | null;
}

export default function BlueprintExportBar({ blueprint, exportUrl }: BlueprintExportBarProps) {
  const completedCount = [
    blueprint.pareto_status,
    blueprint.ui_wireframes_status,
    blueprint.tech_stack_status,
    blueprint.prd_status,
  ].filter((s) => s === 'completed').length;

  const handleExport = () => {
    if (exportUrl) {
      window.open(exportUrl, '_blank');
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Progress:</span>
          <div className="flex gap-1">
            {[
              blueprint.pareto_status,
              blueprint.ui_wireframes_status,
              blueprint.tech_stack_status,
              blueprint.prd_status,
            ].map((status, idx) => (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full ${
                  status === 'completed'
                    ? 'bg-green-500'
                    : status === 'generating'
                    ? 'bg-blue-500 animate-pulse'
                    : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            {completedCount}/4 sections
          </span>
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={completedCount === 0}
        className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
          completedCount > 0
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export ZIP
      </button>
    </div>
  );
}
