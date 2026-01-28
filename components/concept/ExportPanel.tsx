'use client';

import { useState, useMemo } from 'react';
import { WireframeData, AppProject, WireframeScreen } from '@/lib/supabase';
import { generateExportSpec } from '@/lib/wireframe-export';
import WireframeComponentRenderer from '../wireframe/WireframeComponentRenderer';
import { ComponentType } from '@/lib/component-library';

interface ExportPanelProps {
  conceptName: string;
  conceptDescription?: string;
  linkedProjects: AppProject[];
  wireframeData: WireframeData;
}

export default function ExportPanel({
  conceptName,
  conceptDescription,
  linkedProjects,
  wireframeData,
}: ExportPanelProps) {
  const [mode, setMode] = useState<'preview' | 'spec'>('preview');
  const [previewScreenIndex, setPreviewScreenIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const screens = useMemo(
    () => Object.values(wireframeData.screens).sort((a, b) => a.order - b.order),
    [wireframeData]
  );

  const spec = useMemo(
    () =>
      generateExportSpec({
        conceptName,
        conceptDescription,
        linkedProjects,
        wireframeData,
      }),
    [conceptName, conceptDescription, linkedProjects, wireframeData]
  );

  const currentScreen = screens[previewScreenIndex];

  const handleCopySpec = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleNavigate = (targetScreenId: string) => {
    const index = screens.findIndex((s) => s.id === targetScreenId);
    if (index !== -1) {
      setPreviewScreenIndex(index);
    }
  };

  if (screens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <svg
          className="w-16 h-16 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No wireframes to export
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Create screens and add components to generate an export spec.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMode('preview')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'preview'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Preview Mode
          </button>
          <button
            onClick={() => setMode('spec')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'spec'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Export Spec
          </button>
        </div>

        {mode === 'spec' && (
          <button
            onClick={handleCopySpec}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>
        )}
      </div>

      {mode === 'preview' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-100 dark:bg-gray-900">
          {/* Phone Frame Preview */}
          <div className="relative bg-gray-900 rounded-[50px] p-3 shadow-2xl mb-6">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[30px] bg-gray-900 rounded-b-[20px] z-10" />

            {/* Screen */}
            <div
              className="relative bg-white rounded-[40px] overflow-hidden"
              style={{ width: 320, height: 693 }}
            >
              {/* Status bar */}
              <div className="absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-6 z-20 pointer-events-none">
                <span className="text-xs font-semibold text-gray-900">9:41</span>
                <div className="w-5 h-2 bg-gray-900 rounded-sm" />
              </div>

              {/* Screen Content */}
              <div className="absolute inset-0 pt-10 pb-6 overflow-hidden">
                {currentScreen?.components.map((component) => (
                  <div
                    key={component.id}
                    style={{
                      position: 'absolute',
                      left: component.x * (320 / 375),
                      top: component.y * (693 / 812),
                      width: component.width * (320 / 375),
                      height: component.height * (693 / 812),
                      cursor: component.behavior?.onTap?.navigateTo ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (component.behavior?.onTap?.navigateTo) {
                        handleNavigate(component.behavior.onTap.navigateTo);
                      }
                    }}
                    className={
                      component.behavior?.onTap?.navigateTo
                        ? 'hover:ring-2 hover:ring-blue-400 rounded transition-all'
                        : ''
                    }
                  >
                    <WireframeComponentRenderer
                      type={component.type as ComponentType}
                      props={component.props}
                      width={component.width * (320 / 375)}
                      height={component.height * (693 / 812)}
                    />
                  </div>
                ))}
              </div>

              {/* Home indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1 bg-gray-900 rounded-full" />
            </div>
          </div>

          {/* Screen Navigation */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setPreviewScreenIndex(Math.max(0, previewScreenIndex - 1))}
              disabled={previewScreenIndex === 0}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center space-x-2">
              {screens.map((screen, index) => (
                <button
                  key={screen.id}
                  onClick={() => setPreviewScreenIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === previewScreenIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                  }`}
                  title={screen.name}
                />
              ))}
            </div>

            <button
              onClick={() =>
                setPreviewScreenIndex(Math.min(screens.length - 1, previewScreenIndex + 1))
              }
              disabled={previewScreenIndex === screens.length - 1}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {currentScreen?.name || 'No screen'} ({previewScreenIndex + 1} of {screens.length})
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Click interactive components to navigate
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Export Specification
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Copy this spec and paste into Claude Code to build your demo
                </p>
              </div>
              <div className="p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto">
                  {spec}
                </pre>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 dark:text-blue-200 mb-2">
                How to use this spec
              </h4>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
                <li>1. Click "Copy to Clipboard" above</li>
                <li>2. Open Claude Code or claude.ai</li>
                <li>3. Paste the spec and ask: "Build a functional demo app from this spec"</li>
                <li>4. Claude will create a working prototype you can run locally</li>
                <li>5. Record a TikTok demo of the working app to validate demand</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
