'use client';

import { useDroppable } from '@dnd-kit/core';
import { useWireframeStore } from '@/hooks/useWireframeStore';
import DraggableComponent from './DraggableComponent';

const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 812;
const SCALE = 0.85;

export default function PhoneFrame() {
  const { activeScreenId, wireframeData, setSelectedComponent, selectedComponentId } =
    useWireframeStore();
  const activeScreen = activeScreenId
    ? wireframeData.screens[activeScreenId]
    : null;

  const { setNodeRef, isOver } = useDroppable({
    id: 'phone-canvas',
    data: { type: 'canvas' },
  });

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only deselect if clicking directly on canvas, not on a component
    if (e.target === e.currentTarget) {
      setSelectedComponent(null);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-4">
      <div
        className="relative bg-gray-900 rounded-[50px] p-3 shadow-2xl"
        style={{
          transform: `scale(${SCALE})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[30px] bg-gray-900 rounded-b-[20px] z-10" />

        {/* Screen bezel */}
        <div
          ref={setNodeRef}
          onClick={handleCanvasClick}
          className={`relative bg-white dark:bg-gray-100 rounded-[40px] overflow-hidden transition-colors ${
            isOver ? 'ring-4 ring-blue-400 ring-opacity-50' : ''
          }`}
          style={{
            width: PHONE_WIDTH,
            height: PHONE_HEIGHT,
          }}
        >
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-20 pointer-events-none">
            <span className="text-sm font-semibold text-gray-900">9:41</span>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.01 21.49L23.64 7c-.45-.34-4.93-4-11.64-4C5.28 3 .81 6.66.36 7l11.63 14.49.01.01.01-.01z" />
              </svg>
              <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2 22h20V2z" />
              </svg>
              <div className="w-6 h-3 bg-gray-900 rounded-sm" />
            </div>
          </div>

          {/* Canvas content area */}
          <div className="absolute inset-0 pt-12 pb-8">
            {!activeScreen ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <p className="text-sm">Add a screen to start</p>
                </div>
              </div>
            ) : activeScreen.components.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <p className="text-sm">Drag components here</p>
                </div>
              </div>
            ) : (
              activeScreen.components.map((component) => (
                <DraggableComponent
                  key={component.id}
                  component={component}
                  screenId={activeScreen.id}
                  isSelected={selectedComponentId === component.id}
                />
              ))
            )}
          </div>

          {/* Home indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 rounded-full" />
        </div>
      </div>
    </div>
  );
}
