import { create } from 'zustand';
import { temporal } from 'zundo';
import { WireframeComponent, WireframeScreen, WireframeData } from '@/lib/supabase';

interface WireframeState {
  // Data
  wireframeData: WireframeData;
  activeScreenId: string | null;
  selectedComponentId: string | null;
  isDirty: boolean;

  // Actions
  setWireframeData: (data: WireframeData) => void;
  setActiveScreen: (screenId: string | null) => void;
  setSelectedComponent: (componentId: string | null) => void;

  // Screen operations
  addScreen: (name: string) => string;
  updateScreen: (screenId: string, updates: Partial<WireframeScreen>) => void;
  deleteScreen: (screenId: string) => void;
  reorderScreens: (orderedIds: string[]) => void;

  // Component operations
  addComponent: (screenId: string, component: WireframeComponent) => void;
  updateComponent: (
    screenId: string,
    componentId: string,
    updates: Partial<WireframeComponent>
  ) => void;
  deleteComponent: (screenId: string, componentId: string) => void;
  moveComponent: (
    screenId: string,
    componentId: string,
    x: number,
    y: number
  ) => void;
  resizeComponent: (
    screenId: string,
    componentId: string,
    width: number,
    height: number
  ) => void;

  // Utility
  markClean: () => void;
  getActiveScreen: () => WireframeScreen | null;
  getSelectedComponent: () => WireframeComponent | null;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const initialWireframeData: WireframeData = {
  version: '1.0',
  screens: {},
  settings: {
    deviceFrame: 'iphone-14-pro',
    gridSize: 8,
  },
};

export const useWireframeStore = create<WireframeState>()(
  temporal(
    (set, get) => ({
      wireframeData: initialWireframeData,
      activeScreenId: null,
      selectedComponentId: null,
      isDirty: false,

      setWireframeData: (data) => {
        set({
          wireframeData: data,
          activeScreenId:
            Object.keys(data.screens).length > 0
              ? Object.values(data.screens).sort((a, b) => a.order - b.order)[0]?.id || null
              : null,
          selectedComponentId: null,
          isDirty: false,
        });
      },

      setActiveScreen: (screenId) => {
        set({ activeScreenId: screenId, selectedComponentId: null });
      },

      setSelectedComponent: (componentId) => {
        set({ selectedComponentId: componentId });
      },

      addScreen: (name) => {
        const id = `screen-${generateId()}`;
        const { wireframeData } = get();
        const order = Object.keys(wireframeData.screens).length;

        const newScreen: WireframeScreen = {
          id,
          name,
          order,
          components: [],
        };

        set({
          wireframeData: {
            ...wireframeData,
            screens: {
              ...wireframeData.screens,
              [id]: newScreen,
            },
          },
          activeScreenId: id,
          isDirty: true,
        });

        return id;
      },

      updateScreen: (screenId, updates) => {
        const { wireframeData } = get();
        const screen = wireframeData.screens[screenId];
        if (!screen) return;

        set({
          wireframeData: {
            ...wireframeData,
            screens: {
              ...wireframeData.screens,
              [screenId]: { ...screen, ...updates },
            },
          },
          isDirty: true,
        });
      },

      deleteScreen: (screenId) => {
        const { wireframeData, activeScreenId } = get();
        const { [screenId]: removed, ...remainingScreens } = wireframeData.screens;

        // Reorder remaining screens
        const orderedScreens = Object.values(remainingScreens).sort(
          (a, b) => a.order - b.order
        );
        const reorderedScreens: Record<string, WireframeScreen> = {};
        orderedScreens.forEach((screen, index) => {
          reorderedScreens[screen.id] = { ...screen, order: index };
        });

        const newActiveScreen =
          activeScreenId === screenId
            ? orderedScreens[0]?.id || null
            : activeScreenId;

        set({
          wireframeData: {
            ...wireframeData,
            screens: reorderedScreens,
          },
          activeScreenId: newActiveScreen,
          selectedComponentId: null,
          isDirty: true,
        });
      },

      reorderScreens: (orderedIds) => {
        const { wireframeData } = get();
        const reorderedScreens: Record<string, WireframeScreen> = {};

        orderedIds.forEach((id, index) => {
          const screen = wireframeData.screens[id];
          if (screen) {
            reorderedScreens[id] = { ...screen, order: index };
          }
        });

        set({
          wireframeData: {
            ...wireframeData,
            screens: reorderedScreens,
          },
          isDirty: true,
        });
      },

      addComponent: (screenId, component) => {
        const { wireframeData } = get();
        const screen = wireframeData.screens[screenId];
        if (!screen) return;

        set({
          wireframeData: {
            ...wireframeData,
            screens: {
              ...wireframeData.screens,
              [screenId]: {
                ...screen,
                components: [...screen.components, component],
              },
            },
          },
          selectedComponentId: component.id,
          isDirty: true,
        });
      },

      updateComponent: (screenId, componentId, updates) => {
        const { wireframeData } = get();
        const screen = wireframeData.screens[screenId];
        if (!screen) return;

        const componentIndex = screen.components.findIndex(
          (c) => c.id === componentId
        );
        if (componentIndex === -1) return;

        const newComponents = [...screen.components];
        newComponents[componentIndex] = {
          ...newComponents[componentIndex],
          ...updates,
        };

        set({
          wireframeData: {
            ...wireframeData,
            screens: {
              ...wireframeData.screens,
              [screenId]: {
                ...screen,
                components: newComponents,
              },
            },
          },
          isDirty: true,
        });
      },

      deleteComponent: (screenId, componentId) => {
        const { wireframeData, selectedComponentId } = get();
        const screen = wireframeData.screens[screenId];
        if (!screen) return;

        set({
          wireframeData: {
            ...wireframeData,
            screens: {
              ...wireframeData.screens,
              [screenId]: {
                ...screen,
                components: screen.components.filter((c) => c.id !== componentId),
              },
            },
          },
          selectedComponentId:
            selectedComponentId === componentId ? null : selectedComponentId,
          isDirty: true,
        });
      },

      moveComponent: (screenId, componentId, x, y) => {
        const { wireframeData } = get();
        const gridSize = wireframeData.settings.gridSize;

        // Snap to grid
        const snappedX = Math.round(x / gridSize) * gridSize;
        const snappedY = Math.round(y / gridSize) * gridSize;

        get().updateComponent(screenId, componentId, {
          x: Math.max(0, snappedX),
          y: Math.max(0, snappedY),
        });
      },

      resizeComponent: (screenId, componentId, width, height) => {
        const { wireframeData } = get();
        const gridSize = wireframeData.settings.gridSize;

        // Snap to grid
        const snappedWidth = Math.round(width / gridSize) * gridSize;
        const snappedHeight = Math.round(height / gridSize) * gridSize;

        get().updateComponent(screenId, componentId, {
          width: Math.max(gridSize * 2, snappedWidth),
          height: Math.max(gridSize * 2, snappedHeight),
        });
      },

      markClean: () => {
        set({ isDirty: false });
      },

      getActiveScreen: () => {
        const { wireframeData, activeScreenId } = get();
        if (!activeScreenId) return null;
        return wireframeData.screens[activeScreenId] || null;
      },

      getSelectedComponent: () => {
        const { wireframeData, activeScreenId, selectedComponentId } = get();
        if (!activeScreenId || !selectedComponentId) return null;
        const screen = wireframeData.screens[activeScreenId];
        if (!screen) return null;
        return screen.components.find((c) => c.id === selectedComponentId) || null;
      },
    }),
    {
      limit: 50, // Keep 50 states in history
      partialize: (state) => {
        // Only track wireframeData changes for undo/redo
        const { wireframeData } = state;
        return { wireframeData };
      },
    }
  )
);

// Hook for undo/redo controls
export const useWireframeHistory = () => {
  const store = useWireframeStore;
  return {
    undo: () => store.temporal.getState().undo(),
    redo: () => store.temporal.getState().redo(),
    canUndo: () => store.temporal.getState().pastStates.length > 0,
    canRedo: () => store.temporal.getState().futureStates.length > 0,
  };
};
