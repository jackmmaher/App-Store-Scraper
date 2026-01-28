'use client';

import { useState } from 'react';
import { useWireframeStore } from '@/hooks/useWireframeStore';
import { WireframeComponent } from '@/lib/supabase';

interface BehaviorEditorProps {
  component: WireframeComponent;
  screenId: string;
  onClose: () => void;
}

export default function BehaviorEditor({
  component,
  screenId,
  onClose,
}: BehaviorEditorProps) {
  const { wireframeData, updateComponent } = useWireframeStore();
  const screens = Object.values(wireframeData.screens).sort(
    (a, b) => a.order - b.order
  );

  const [behaviorType, setBehaviorType] = useState<'none' | 'navigate' | 'modal' | 'custom'>(
    component.behavior?.onTap?.navigateTo
      ? 'navigate'
      : component.behavior?.onTap?.showModal
      ? 'modal'
      : component.behavior?.onTap?.action
      ? 'custom'
      : 'none'
  );
  const [navigateTo, setNavigateTo] = useState(
    component.behavior?.onTap?.navigateTo || ''
  );
  const [showModal, setShowModal] = useState(
    component.behavior?.onTap?.showModal || ''
  );
  const [customAction, setCustomAction] = useState(
    component.behavior?.onTap?.action || ''
  );

  const handleSave = () => {
    let behavior: WireframeComponent['behavior'] = {};

    if (behaviorType === 'navigate' && navigateTo) {
      behavior = { onTap: { navigateTo } };
    } else if (behaviorType === 'modal' && showModal) {
      behavior = { onTap: { showModal } };
    } else if (behaviorType === 'custom' && customAction) {
      behavior = { onTap: { action: customAction } };
    }

    updateComponent(screenId, component.id, { behavior });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Edit Behavior
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              On Tap Action
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="behaviorType"
                  checked={behaviorType === 'none'}
                  onChange={() => setBehaviorType('none')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-white">None</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="behaviorType"
                  checked={behaviorType === 'navigate'}
                  onChange={() => setBehaviorType('navigate')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-white">
                  Navigate to Screen
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="behaviorType"
                  checked={behaviorType === 'modal'}
                  onChange={() => setBehaviorType('modal')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-white">
                  Show Modal
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="behaviorType"
                  checked={behaviorType === 'custom'}
                  onChange={() => setBehaviorType('custom')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-white">
                  Custom Action
                </span>
              </label>
            </div>
          </div>

          {behaviorType === 'navigate' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Screen
              </label>
              <select
                value={navigateTo}
                onChange={(e) => setNavigateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a screen...</option>
                {screens.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {behaviorType === 'modal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Modal Type
              </label>
              <input
                type="text"
                value={showModal}
                onChange={(e) => setShowModal(e.target.value)}
                placeholder="e.g., confirmation, paywall, settings"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {behaviorType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Action Description
              </label>
              <textarea
                value={customAction}
                onChange={(e) => setCustomAction(e.target.value)}
                placeholder="Describe what should happen when tapped..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be included in the export spec for implementation.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
