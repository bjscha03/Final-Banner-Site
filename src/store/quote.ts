import { create } from 'zustand';

export type MaterialKey = '13oz' | '15oz' | '18oz' | 'mesh';
export type Grommets =
  | 'none'
  | 'every-2-3ft'
  | 'every-1-2ft'
  | '4-corners'
  | 'top-corners'
  | 'right-corners'
  | 'left-corners';

export interface QuickQuoteParams {
  widthIn: number;
  heightIn: number;
  quantity: number;
  material: MaterialKey;
}

export type PolePocketSize = '1' | '2' | '3' | '4';

export interface TextElement {
  id: string;
  content: string;
  xPercent: number; // Position as percentage from left (0-100)
  yPercent: number; // Position as percentage from top (0-100)
  fontSize: number; // Font size in points
  fontFamily: string;
  color: string; // Hex color
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number; // Line height multiplier (1.0 = normal, 1.5 = 1.5x spacing)
  // Legacy fields for backward compatibility - will be migrated to percentages
  x?: number; // DEPRECATED: Position in inches from left
  y?: number; // DEPRECATED: Position in inches from top
}

export interface QuoteState {
  widthIn: number;
  heightIn: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  polePockets: string;
  polePocketSize: PolePocketSize;
  addRope: boolean;
  previewScalePct: number;
  textElements: TextElement[];
  editingItemId?: string | null; // ID of cart item being edited, if any
  editingItemId?: string | null; // ID of cart item being edited, if any
  file?: {
    name: string;
    type: string;
    size: number;
    url?: string;
    isPdf?: boolean;
    fileKey?: string;
    isAI?: boolean;
    originalPdfFile?: File;
    artworkWidth?: number;
    artworkHeight?: number;    aiMetadata?: {
      prompt?: string;
      styles?: string[];
      colors?: string[];
      model?: string;
      aspectRatio?: string;
    };
  };
  overlayImage?: {
    name: string;
    url: string;
    fileKey: string;
    position: { x: number; y: number }; // Percentage-based position (0-100)
    aspectRatio?: number; // width / height of the original image
    scale: number; // Scale factor (1 = 100%)
  };
  set: (partial: Partial<QuoteState>) => void;
  setFromQuickQuote: (params: QuickQuoteParams) => void;
  loadFromCartItem: (item: any) => void;
  addTextElement: (element: Omit<TextElement, 'id'>) => void;
  updateTextElement: (id: string, updates: Partial<TextElement>) => void;
  deleteTextElement: (id: string) => void;
  resetDesign: () => void;
  // Computed properties for validation
  getSquareFootage: () => number;
  isOverSizeLimit: () => boolean;
  getSizeLimitMessage: () => string | null;
}
// Helper functions for order size validation
export const calculateSquareFootage = (widthIn: number, heightIn: number): number => {
  return (widthIn * heightIn) / 144; // Convert square inches to square feet
};

export const ORDER_SIZE_LIMIT_SQFT = 1000;

export const getSizeLimitMessage = (sqft: number): string | null => {
  if (sqft > ORDER_SIZE_LIMIT_SQFT) {
    return `Orders over 1,000 sq ft require a custom quote. Please contact us at (555) 123-4567 or support@bannersonthefly.com before placing your order.`;
  }
  return null;
};

export const useQuoteStore = create<QuoteState>((set, get) => ({
  widthIn: 48,
  heightIn: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  polePockets: 'none',
  polePocketSize: '2',
  addRope: false, // Preserve rope selection
  previewScalePct: 100,
  textElements: [],
  editingItemId: null,
  file: undefined,
  set: (partial) => set((state) => {
    // Handle mutual exclusivity between grommets and pole pockets
    const updates = { ...partial };
    
    // If grommets is being set to a non-'none' value, reset pole pockets
    if (updates.grommets && updates.grommets !== 'none') {
      updates.polePockets = 'none';
    }
    
    // If pole pockets is being set to a non-'none' value, reset grommets
    if (updates.polePockets && updates.polePockets !== 'none') {
      updates.grommets = 'none' as Grommets;
    }
    
    return { ...state, ...updates };
  }),
  setFromQuickQuote: (params) => set((state) => ({
    ...state,
    widthIn: params.widthIn,
    heightIn: params.heightIn,
    quantity: params.quantity,
    material: params.material,
    // Reset other options to defaults when coming from quick quote
    grommets: 'none' as Grommets,
    polePockets: 'none',
    polePocketSize: '2',
    addRope: state.addRope, // Preserve rope selection
    file: undefined,
  })),
  loadFromCartItem: (item: any) => {
    console.log('🔍 QUOTE STORE: loadFromCartItem called with item:', item);
    console.log('🔍 QUOTE STORE: item.overlay_image:', item.overlay_image);
    return set((state) => ({
      ...state,
      widthIn: item.width_in,
      heightIn: item.height_in,
      quantity: item.quantity,
      material: item.material,
      grommets: item.grommets || 'none',
      polePockets: item.pole_pocket_position || item.pole_pockets || 'none',
      polePocketSize: item.pole_pocket_size || '2',
      addRope: item.rope_feet > 0,
      textElements: item.text_elements || [],
      file: item.file_key || item.file_url || item.web_preview_url ? {
        name: item.file_name || 'Uploaded file',
        type: item.is_pdf ? 'application/pdf' : 'image/*',
        size: 1024, // Non-zero to indicate file exists
        url: item.file_url || item.web_preview_url || item.print_ready_url,
        fileKey: item.file_key,
        isPdf: item.is_pdf,
        isAI: !!item.aiDesign,
      } : undefined,
      overlayImage: item.overlay_image,
    }));
    console.log('🔍 QUOTE STORE: After set, overlayImage is now:', get().overlayImage);
  },
  // Computed validation methods
  getSquareFootage: () => {
    const state = get();
    return calculateSquareFootage(state.widthIn, state.heightIn);
  },
  isOverSizeLimit: () => {
    const sqft = get().getSquareFootage();
    return sqft > ORDER_SIZE_LIMIT_SQFT;
  },
  getSizeLimitMessage: () => {
    const sqft = get().getSquareFootage();
    return getSizeLimitMessage(sqft);
  },
  addTextElement: (element) => set((state) => ({
    ...state,
    textElements: [
      ...state.textElements,
      {
        ...element,
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
    ]
  })),
  updateTextElement: (id, updates) => set((state) => ({
    ...state,
    textElements: state.textElements.map(el =>
      el.id === id ? { ...el, ...updates } : el
    )
  })),
  deleteTextElement: (id) => set((state) => ({
    ...state,
    textElements: state.textElements.filter(el => el.id !== id)
  })),
  // Reset design area to default values
  resetDesign: () => {
    console.log('🔄 QUOTE STORE: resetDesign() called');
    console.log('🔄 QUOTE STORE: Setting file to undefined');
    return set({
    widthIn: 48,
    heightIn: 24,
    quantity: 1,
    material: '13oz',
    grommets: 'none',
    polePockets: 'none',
    polePocketSize: '2',
    addRope: false,
    previewScalePct: 100,
    textElements: [],
    editingItemId: null,
    file: undefined,
    overlayImage: undefined,
  });
  }
}));
