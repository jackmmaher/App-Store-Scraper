'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  COMPONENT_LIBRARY,
  ComponentDefinition,
  getComponentsByCategory,
} from '@/lib/component-library';

interface DraggablePaletteItemProps {
  definition: ComponentDefinition;
}

function DraggablePaletteItem({ definition }: DraggablePaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: {
      type: 'palette-item',
      componentType: definition.type,
      definition,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center space-x-2 p-2 rounded-lg cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
        isDragging ? 'opacity-50' : ''
      }`}
      title={definition.description}
    >
      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
        <svg
          className="w-4 h-4 text-gray-600 dark:text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d={definition.icon}
          />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {definition.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {definition.description}
        </p>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  title: string;
  components: ComponentDefinition[];
  defaultOpen?: boolean;
}

function CategorySection({ title, components, defaultOpen = true }: CategorySectionProps) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 mb-2">
        {title}
      </h3>
      <div className="space-y-1">
        {components.map((comp) => (
          <DraggablePaletteItem key={comp.type} definition={comp} />
        ))}
      </div>
    </div>
  );
}

export default function ComponentPalette() {
  const navigationComponents = getComponentsByCategory('navigation');
  const contentComponents = getComponentsByCategory('content');
  const inputComponents = getComponentsByCategory('input');
  const patternComponents = getComponentsByCategory('pattern');

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">Components</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drag to canvas
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <CategorySection title="Navigation" components={navigationComponents} />
        <CategorySection title="Content" components={contentComponents} />
        <CategorySection title="Inputs" components={inputComponents} />
        <CategorySection title="Patterns" components={patternComponents} />
      </div>

      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {COMPONENT_LIBRARY.length} components available
        </p>
      </div>
    </div>
  );
}
