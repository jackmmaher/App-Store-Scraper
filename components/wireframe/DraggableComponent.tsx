'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useWireframeStore } from '@/hooks/useWireframeStore';
import { WireframeComponent } from '@/lib/supabase';
import { getComponentDefinition, ComponentType } from '@/lib/component-library';
import WireframeComponentRenderer from './WireframeComponentRenderer';

interface DraggableComponentProps {
  component: WireframeComponent;
  screenId: string;
  isSelected: boolean;
}

export default function DraggableComponent({
  component,
  screenId,
  isSelected,
}: DraggableComponentProps) {
  const { setSelectedComponent, deleteComponent } = useWireframeStore();

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: component.id,
      data: {
        type: 'placed-component',
        component,
        screenId,
      },
    });

  const definition = getComponentDefinition(component.type as ComponentType);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: component.x,
    top: component.y,
    width: component.width,
    height: component.height,
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 1000 : isSelected ? 100 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.8 : 1,
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedComponent(component.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteComponent(screenId, component.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      {...attributes}
      {...listeners}
      className={`group ${
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-1'
          : 'hover:ring-2 hover:ring-blue-300 hover:ring-offset-1'
      }`}
    >
      {/* Component content */}
      <WireframeComponentRenderer
        type={component.type as ComponentType}
        props={component.props}
        width={component.width}
        height={component.height}
      />

      {/* Selection handles */}
      {isSelected && (
        <>
          {/* Delete button */}
          <button
            onClick={handleDelete}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="Delete component"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Corner resize handles (visual only for now) */}
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-sm cursor-sw-resize" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-sm cursor-ne-resize" />
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-sm cursor-nw-resize" />
        </>
      )}

      {/* Behavior indicator */}
      {component.behavior?.onTap?.navigateTo && (
        <div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] rounded whitespace-nowrap"
          title={`Navigates to: ${component.behavior.onTap.navigateTo}`}
        >
          → {component.behavior.onTap.navigateTo.substring(0, 10)}
        </div>
      )}
    </div>
  );
}
