'use client';

import { useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import { useState } from 'react';
import { useWireframeStore, useWireframeHistory } from '@/hooks/useWireframeStore';
import { WireframeData } from '@/lib/supabase';
import {
  createComponentInstance,
  ComponentType,
  getComponentDefinition,
} from '@/lib/component-library';
import ComponentPalette from './ComponentPalette';
import PhoneFrame from './PhoneFrame';
import ComponentInspector from './ComponentInspector';
import ScreenTabs from './ScreenTabs';

interface WireframeEditorProps {
  initialData: WireframeData;
  onSave: (data: WireframeData) => Promise<void>;
}

export default function WireframeEditor({ initialData, onSave }: WireframeEditorProps) {
  const {
    wireframeData,
    setWireframeData,
    activeScreenId,
    addComponent,
    moveComponent,
    isDirty,
    markClean,
  } = useWireframeStore();
  const { undo, redo, canUndo, canRedo } = useWireframeHistory();

  const [draggedItem, setDraggedItem] = useState<{
    type: 'palette' | 'placed';
    componentType?: ComponentType;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize store with data
  useEffect(() => {
    setWireframeData(initialData);
  }, [initialData, setWireframeData]);

  // Auto-save when dirty
  useEffect(() => {
    if (!isDirty) return;

    const timeout = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(wireframeData);
        markClean();
      } catch (error) {
        console.error('Error saving wireframe:', error);
      } finally {
        setSaving(false);
      }
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeout);
  }, [wireframeData, isDirty, onSave, markClean]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    if (data?.type === 'palette-item') {
      setDraggedItem({
        type: 'palette',
        componentType: data.componentType,
      });
    } else if (data?.type === 'placed-component') {
      setDraggedItem({
        type: 'placed',
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    const data = active.data.current;

    setDraggedItem(null);

    if (!over) return;

    // Handle dropping from palette onto canvas
    if (data?.type === 'palette-item' && over.id === 'phone-canvas') {
      if (!activeScreenId) return;

      const componentType = data.componentType as ComponentType;
      const definition = getComponentDefinition(componentType);
      if (!definition) return;

      // Calculate drop position - center the component
      // The canvas area starts at (0, 48) due to status bar
      const canvasRect = document.querySelector('[data-droppable-id="phone-canvas"]')?.getBoundingClientRect();
      if (!canvasRect) {
        // Default position if we can't get canvas rect
        const newComponent = createComponentInstance(
          componentType,
          24, // Default left margin
          100 // Default top position
        );
        if (newComponent) {
          addComponent(activeScreenId, newComponent);
        }
        return;
      }

      // Position at center of canvas with some offset
      const x = Math.max(0, Math.round((375 - definition.defaultWidth) / 2));
      const y = Math.max(0, 100); // Start below status bar area

      const newComponent = createComponentInstance(componentType, x, y);
      if (newComponent) {
        addComponent(activeScreenId, newComponent);
      }
    }

    // Handle moving existing component
    if (data?.type === 'placed-component') {
      const { component, screenId } = data;
      const newX = component.x + delta.x;
      const newY = component.y + delta.y;
      moveComponent(screenId, component.id, newX, newY);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <button
              onClick={undo}
              disabled={!canUndo()}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo()}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Shift+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
              </svg>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {saving ? (
              <span className="flex items-center text-sm text-gray-500">
                <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : isDirty ? (
              <span className="text-sm text-amber-600">Unsaved changes</span>
            ) : (
              <span className="text-sm text-green-600 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Screen Tabs */}
        <ScreenTabs />

        {/* Main Editor Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Component Palette */}
          <ComponentPalette />

          {/* Center: Phone Canvas */}
          <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
            <PhoneFrame />
          </div>

          {/* Right: Component Inspector */}
          <ComponentInspector />
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggedItem?.type === 'palette' && draggedItem.componentType && (
          <div className="px-3 py-2 bg-blue-600 text-white rounded-lg shadow-lg text-sm font-medium">
            {getComponentDefinition(draggedItem.componentType)?.name || 'Component'}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
