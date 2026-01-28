'use client';

import { useState } from 'react';
import { useWireframeStore } from '@/hooks/useWireframeStore';
import { getComponentDefinition, ComponentType, PropertyField } from '@/lib/component-library';
import BehaviorEditor from './BehaviorEditor';

export default function ComponentInspector() {
  const {
    wireframeData,
    activeScreenId,
    selectedComponentId,
    updateComponent,
    setSelectedComponent,
  } = useWireframeStore();

  const [showBehaviorEditor, setShowBehaviorEditor] = useState(false);

  const activeScreen = activeScreenId
    ? wireframeData.screens[activeScreenId]
    : null;
  const selectedComponent = activeScreen?.components.find(
    (c) => c.id === selectedComponentId
  );
  const definition = selectedComponent
    ? getComponentDefinition(selectedComponent.type as ComponentType)
    : null;

  if (!selectedComponent || !definition) {
    return (
      <div className="w-72 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Properties
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Select a component to edit its properties
          </p>
        </div>
      </div>
    );
  }

  const handlePropertyChange = (key: string, value: unknown) => {
    if (!activeScreenId || !selectedComponentId) return;

    updateComponent(activeScreenId, selectedComponentId, {
      props: {
        ...selectedComponent.props,
        [key]: value,
      },
    });
  };

  const handlePositionChange = (key: 'x' | 'y' | 'width' | 'height', value: number) => {
    if (!activeScreenId || !selectedComponentId) return;

    updateComponent(activeScreenId, selectedComponentId, {
      [key]: value,
    });
  };

  const renderPropertyField = (field: PropertyField) => {
    const value = selectedComponent.props[field.key] ?? field.defaultValue;

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handlePropertyChange(field.key, e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={Number(value)}
            onChange={(e) => handlePropertyChange(field.key, Number(e.target.value))}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        );

      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e) => handlePropertyChange(field.key, e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handlePropertyChange(field.key, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Enabled
            </span>
          </label>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-72 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {definition.name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {definition.category}
          </p>
        </div>
        <button
          onClick={() => setSelectedComponent(null)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          title="Deselect"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Position & Size */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Position & Size
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">X</label>
              <input
                type="number"
                value={selectedComponent.x}
                onChange={(e) => handlePositionChange('x', Number(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Y</label>
              <input
                type="number"
                value={selectedComponent.y}
                onChange={(e) => handlePositionChange('y', Number(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Width</label>
              <input
                type="number"
                value={selectedComponent.width}
                onChange={(e) => handlePositionChange('width', Number(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Height</label>
              <input
                type="number"
                value={selectedComponent.height}
                onChange={(e) => handlePositionChange('height', Number(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Properties */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Properties
          </h3>
          <div className="space-y-3">
            {definition.propertyFields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {field.label}
                </label>
                {renderPropertyField(field)}
              </div>
            ))}
          </div>
        </div>

        {/* Behavior */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Behavior
          </h3>
          <button
            onClick={() => setShowBehaviorEditor(true)}
            className="w-full px-3 py-2 text-sm text-left bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">On Tap</span>
              <span className="text-xs text-gray-500">
                {selectedComponent.behavior?.onTap?.navigateTo
                  ? `→ ${selectedComponent.behavior.onTap.navigateTo.substring(0, 15)}...`
                  : selectedComponent.behavior?.onTap?.action
                  ? 'Custom'
                  : 'None'}
              </span>
            </div>
          </button>
        </div>

        {/* System Implications */}
        {definition.systemImplications && definition.systemImplications.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              System Requirements
            </h3>
            <ul className="space-y-1">
              {definition.systemImplications.map((imp, i) => (
                <li
                  key={i}
                  className="text-xs text-amber-600 dark:text-amber-400 flex items-start"
                >
                  <svg className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {imp}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showBehaviorEditor && (
        <BehaviorEditor
          component={selectedComponent}
          screenId={activeScreenId!}
          onClose={() => setShowBehaviorEditor(false)}
        />
      )}
    </div>
  );
}
