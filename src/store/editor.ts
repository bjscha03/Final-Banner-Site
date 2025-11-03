import { create } from 'zustand';
import { useQuoteStore } from './quote';

// Types
export type CanvasObjectType = 'image' | 'text' | 'shape';
export type ShapeType = 'rect' | 'circle' | 'triangle' | 'line' | 'arrow';
export type TextEffect = 'none' | 'curved' | 'outline' | 'shadow';

export interface BaseCanvasObject {
  id: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  zIndex: number;
}

export interface ImageObject extends BaseCanvasObject {
  type: 'image';
  cloudinaryPublicId?: string;
  url: string;
  originalWidth: number;
  originalHeight: number;
  effectivePPI: number;
  isPDF?: boolean;
}

export interface TextObject extends BaseCanvasObject {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  effect: TextEffect;
}

export interface ShapeObject extends BaseCanvasObject {
  type: 'shape';
  shapeType: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
}

export type CanvasObject = ImageObject | TextObject | ShapeObject;

export interface HistoryState {
  objects: CanvasObject[];
  timestamp: number;
}

interface EditorState {
  objects: CanvasObject[];
  selectedIds: string[];
  history: HistoryState[];
  historyIndex: number;
  maxHistorySteps: number;
  brandColors: string[];
  customSwatches: any[];
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  showBleed: boolean;
  showSafeZone: boolean;
  showGrommets: boolean;
  showContextPreview: boolean;
  contextPreviewType: 'storefront' | 'fence' | 'wall';
  canvasBackgroundColor: string;
  isExporting: boolean;
  exportProgress: number;
  exportUrls: any;
  projectId: string | null;
  projectTitle: string;
  isSaving: boolean;
  lastSaved: Date | null;
  isDirty: boolean;
  canvasThumbnail: string | null;
  
  addObject: (object: Partial<CanvasObject>) => void;
  updateObject: (id: string, updates: Partial<CanvasObject>) => void;
  deleteObject: (id: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  selectObject: (id: string, addToSelection?: boolean) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  getSelectedObjects: () => CanvasObject[];
  moveSelected: (dx: number, dy: number) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  lockObject: (id: string, locked: boolean) => void;
  toggleVisibility: (id: string) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setShowGrid: (show: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setShowBleed: (show: boolean) => void;
  setShowSafeZone: (show: boolean) => void;
  setShowGrommets: (show: boolean) => void;
  setCanvasBackgroundColor: (color: string) => void;
  setCanvasThumbnail: (thumbnail: string | null) => void;
  getBannerDimensions: () => { widthIn: number; heightIn: number };
  getBleedSize: () => number;
  getSafeZoneMargin: () => number;
  loadFromJSON: (json: string) => void;
  exportToJSON: () => string;
  reset: () => void;
}

const BLEED_SIZE = 0.25;
const SAFE_ZONE_MARGIN = 0.75;

export const useEditorStore = create<EditorState>((set, get) => ({
  objects: [],
  selectedIds: [],
  history: [],
  historyIndex: -1,
  maxHistorySteps: 50,
  brandColors: ['#18448D', '#ff6b35', '#f7931e'],
  customSwatches: [],
  showGrid: true,
  snapToGrid: false,
  gridSize: 1,
  showRulers: false,
  showBleed: true,
  showSafeZone: true,
  showGrommets: true,
  showContextPreview: false,
  contextPreviewType: 'storefront',
  canvasBackgroundColor: '#FFFFFF',
  canvasThumbnail: null,
  isExporting: false,
  exportProgress: 0,
  exportUrls: {},
  projectId: null,
  projectTitle: 'Untitled Banner',
  isSaving: false,
  lastSaved: null,
  isDirty: false,
  
  addObject: (object) => {
    const newObject = {
      ...object,
      id: `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      zIndex: get().objects.length,
    } as CanvasObject;
    set({ objects: [...get().objects, newObject], isDirty: true });
    get().pushHistory();
  },
  
  updateObject: (id, updates) => {
    set({
      objects: get().objects.map(obj =>
        obj.id === id ? { ...obj, ...updates } : obj
      ),
      isDirty: true,
    });
    get().pushHistory();
  },
  
  deleteObject: (id) => {
    set({
      objects: get().objects.filter(obj => obj.id !== id),
      selectedIds: get().selectedIds.filter(sid => sid !== id),
      isDirty: true,
    });
    get().pushHistory();
  },
  
  deleteSelected: () => {
    const { selectedIds } = get();
    set({
      objects: get().objects.filter(obj => !selectedIds.includes(obj.id)),
      selectedIds: [],
      isDirty: true,
    });
    get().pushHistory();
  },
  
  duplicateSelected: () => {
    const { selectedIds, objects } = get();
    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    const newObjects = selectedObjects.map(obj => ({
      ...obj,
      id: `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x: obj.x + 0.5,
      y: obj.y + 0.5,
      zIndex: objects.length + selectedObjects.indexOf(obj),
    }));
    set({
      objects: [...objects, ...newObjects],
      selectedIds: newObjects.map(obj => obj.id),
      isDirty: true,
    });
    get().pushHistory();
  },
  
  selectObject: (id, addToSelection = false) => {
    if (addToSelection) {
      const { selectedIds } = get();
      if (selectedIds.includes(id)) {
        set({ selectedIds: selectedIds.filter(sid => sid !== id) });
      } else {
        set({ selectedIds: [...selectedIds, id] });
      }
    } else {
      set({ selectedIds: [id] });
    }
  },
  
  selectMultiple: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),
  
  getSelectedObjects: () => {
    const { objects, selectedIds } = get();
    return objects.filter(obj => selectedIds.includes(obj.id));
  },
  
  moveSelected: (dx, dy) => {
    const { selectedIds } = get();
    set({
      objects: get().objects.map(obj =>
        selectedIds.includes(obj.id)
          ? { ...obj, x: obj.x + dx, y: obj.y + dy }
          : obj
      ),
      isDirty: true,
    });
  },
  
  bringToFront: (id) => {
    const { objects } = get();
    const maxZ = Math.max(...objects.map(obj => obj.zIndex));
    set({
      objects: objects.map(obj =>
        obj.id === id ? { ...obj, zIndex: maxZ + 1 } : obj
      ),
      isDirty: true,
    });
  },
  
  sendToBack: (id) => {
    const { objects } = get();
    const minZ = Math.min(...objects.map(obj => obj.zIndex));
    set({
      objects: objects.map(obj =>
        obj.id === id ? { ...obj, zIndex: minZ - 1 } : obj
      ),
      isDirty: true,
    });
  },
  
  bringForward: (id) => {
    set({
      objects: get().objects.map(o =>
        o.id === id ? { ...o, zIndex: o.zIndex + 1 } : o
      ),
      isDirty: true,
    });
  },
  
  sendBackward: (id) => {
    set({
      objects: get().objects.map(o =>
        o.id === id ? { ...o, zIndex: o.zIndex - 1 } : o
      ),
      isDirty: true,
    });
  },
  
  lockObject: (id, locked) => {
    set({
      objects: get().objects.map(obj =>
        obj.id === id ? { ...obj, locked } : obj
      ),
      isDirty: true,
    });
  },
  
  toggleVisibility: (id) => {
    set({
      objects: get().objects.map(obj =>
        obj.id === id ? { ...obj, visible: !obj.visible } : obj
      ),
      isDirty: true,
    });
  },
  
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      set({
        objects: state.objects,
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },
  
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      set({
        objects: state.objects,
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },
  
  pushHistory: () => {
    const { objects, history, historyIndex, maxHistorySteps } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      objects: JSON.parse(JSON.stringify(objects)),
      timestamp: Date.now(),
    });
    
    if (newHistory.length > maxHistorySteps) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
  
  canUndo: () => get().historyIndex > 0,
  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },
  
  setShowGrid: (show) => set({ showGrid: show }),
  setShowRulers: (show) => set({ showRulers: show }),
  setShowBleed: (show) => set({ showBleed: show }),
  setShowSafeZone: (show) => set({ showSafeZone: show }),
  setShowGrommets: (show) => set({ showGrommets: show }),
  
  setCanvasBackgroundColor: (color) => set({ canvasBackgroundColor: color }),
  setCanvasThumbnail: (thumbnail) => set({ canvasThumbnail: thumbnail }),
  
  getBannerDimensions: () => {
    const quote = useQuoteStore.getState();
    return { widthIn: quote.widthIn, heightIn: quote.heightIn };
  },
  
  getBleedSize: () => BLEED_SIZE,
  getSafeZoneMargin: () => SAFE_ZONE_MARGIN,
  
  loadFromJSON: (json) => {
    try {
      const data = JSON.parse(json);
      set({
        objects: data.objects || [],
        customSwatches: data.customSwatches || [],
        isDirty: false,
      });
      get().pushHistory();
    } catch (error) {
      console.error('Failed to load from JSON:', error);
    }
  },
  
  exportToJSON: () => {
    const { objects, customSwatches } = get();
    return JSON.stringify({ objects, customSwatches }, null, 2);
  },
  
  reset: () => {
    set({
      objects: [],
      selectedIds: [],
      history: [],
      historyIndex: -1,
      customSwatches: [],
      isDirty: false,
    });
  },
}));
