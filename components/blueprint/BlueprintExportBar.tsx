'use client';

import { useState } from 'react';
import type { ProjectBlueprint } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { getOperationErrorMessage } from '@/lib/errors';

interface BlueprintExportBarProps {
  blueprint: ProjectBlueprint;
  exportUrl: string | null;
}

export default function BlueprintExportBar({ blueprint, exportUrl }: BlueprintExportBarProps) {
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  const completedCount = [
    blueprint.pareto_status,
    blueprint.ui_wireframes_status,
    blueprint.tech_stack_status,
    blueprint.prd_status,
    blueprint.build_manifest_status,
  ].filter((s) => s === 'completed').length;

  const handleExport = async () => {
    if (!exportUrl || isExporting) return;

    setIsExporting(true);
    try {
      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'blueprint.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Blueprint exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(getOperationErrorMessage('export', error));
    } finally {
      setIsExporting(false);
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
              blueprint.build_manifest_status,
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
            {completedCount}/5 sections
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={completedCount === 0 || isExporting}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
            isExporting
              ? 'bg-blue-600 text-white cursor-wait'
              : completedCount > 0
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isExporting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          {isExporting ? 'Exporting...' : 'Export ZIP'}
        </button>
      </div>
    </div>
  );
}
