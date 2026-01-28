'use client';

import { useState } from 'react';
import { useWireframeStore } from '@/hooks/useWireframeStore';
import { clsx } from 'clsx';

export default function ScreenTabs() {
  const {
    wireframeData,
    activeScreenId,
    setActiveScreen,
    addScreen,
    updateScreen,
    deleteScreen,
  } = useWireframeStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const screens = Object.values(wireframeData.screens).sort(
    (a, b) => a.order - b.order
  );

  const handleAddScreen = () => {
    const screenNumber = screens.length + 1;
    addScreen(`Screen ${screenNumber}`);
  };

  const handleStartEdit = (screenId: string, currentName: string) => {
    setEditingId(screenId);
    setEditingName(currentName);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      updateScreen(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleDelete = (screenId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (screens.length <= 1) {
      alert('Cannot delete the last screen');
      return;
    }
    if (confirm('Delete this screen?')) {
      deleteScreen(screenId);
    }
  };

  return (
    <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {screens.map((screen) => (
        <div
          key={screen.id}
          onClick={() => setActiveScreen(screen.id)}
          className={clsx(
            'group flex items-center space-x-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors min-w-0',
            activeScreenId === screen.id
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          )}
        >
          {editingId === screen.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleKeyDown}
              className="w-24 px-1 py-0.5 text-sm bg-transparent border-b border-blue-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <>
              <span
                className="text-sm font-medium truncate max-w-[100px]"
                onDoubleClick={() => handleStartEdit(screen.id, screen.name)}
                title={screen.name}
              >
                {screen.name}
              </span>
              <button
                onClick={(e) => handleDelete(screen.id, e)}
                className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete screen"
              >
                <svg
                  className="w-3.5 h-3.5"
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
            </>
          )}
        </div>
      ))}

      <button
        onClick={handleAddScreen}
        className="flex items-center space-x-1 px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Add new screen"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-sm">Add Screen</span>
      </button>
    </div>
  );
}
