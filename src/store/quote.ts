import { create } from 'zustand';
import { useEditorStore } from './editor';

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
  loadedItemId?: string | null; // Track which item has been loaded to prevent duplicates
  isLoadingItem?: boolean; // Track if we're currently loading an item
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
  overlayImages?: Array<{
    name: string;
    url: string;
    fileKey: string;
    position: { x: number; y: number }; // Percentage-based position (0-100)
    aspectRatio?: number; // width / height of the original image
    scale: number; // Scale factor (1 = 100%)
  }>; // NEW: Support multiple overlay images
  canvaDesignId?: string;              // Canva design ID for re-editing
  imageScale?: number;                 // Background image scale (for uploaded images)
  imagePosition?: { x: number; y: number }; // Background image position (for uploaded images)
  set: (partial: Partial<QuoteState>) => void;
  setFromQuickQuote: (params: QuickQuoteParams) => void;
  loadFromCartItem: (item: any, editingItemId?: string) => void;
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
  loadedItemId: null,
  isLoadingItem: false,
  file: undefined,
  overlayImages: undefined,
  imageScale: 1,
  imagePosition: { x: 0, y: 0 },
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
    
    // Log grommet changes for debugging
    if (updates.grommets !== undefined) {
      console.log('🏪 [QUOTE STORE] Grommets being updated to:', updates.grommets);
      console.log('🏪 [QUOTE STORE] Previous grommets value:', get().grommets);
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
  loadFromCartItem: (item: any, editingItemId?: string) => {
    console.log('🔍🔍🔍 LOAD FROM CART - FULL ITEM:', JSON.stringify(item, null, 2));
    console.log('🔍🔍🔍 item.overlay_image:', item.overlay_image);
    console.log('🔍🔍🔍 item.file_url:', item.file_url);
    console.log('🔍🔍🔍 item.file_key:', item.file_key);
    console.log('🔍 QUOTE STORE: loadFromCartItem called with item:', item);
    console.log('🔍 QUOTE STORE: item.image_scale:', item.image_scale);
    console.log('🔍 QUOTE STORE: item.image_position:', item.image_position);
    console.log('🔍 QUOTE STORE: item.overlay_image:', item.overlay_image);
    if (item.overlay_image) {
      console.log('🔍 QUOTE STORE: overlay_image.url:', item.overlay_image.url);
      console.log('🔍 QUOTE STORE: overlay_image.name:', item.overlay_image.name);
      console.log('🔍 QUOTE STORE: overlay_image.fileKey:', item.overlay_image.fileKey);
    }
    console.log('🔍 QUOTE STORE: item.text_elements:', item.text_elements);
    console.log('🔍 QUOTE STORE: item.text_elements type:', typeof item.text_elements);
    console.log('🔍 QUOTE STORE: item.text_elements isArray:', Array.isArray(item.text_elements));
    
    // CRITICAL FIX: Ensure text_elements is a proper array
    // PostgreSQL/Neon sometimes returns JSON arrays as objects with numeric keys
    let textElementsArray = item.text_elements || [];
    if (!Array.isArray(textElementsArray) && typeof textElementsArray === 'object') {
      console.log('⚠️ QUOTE STORE: text_elements is not an array, converting from object');
      textElementsArray = Object.values(textElementsArray);
    }
    console.log('🔍 QUOTE STORE: textElementsArray after conversion:', textElementsArray);
    
    // Migrate text elements to ensure they have xPercent and yPercent
    const migratedTextElements = textElementsArray.map((textEl: any) => {
      // If xPercent/yPercent are missing, calculate from x/y (legacy format)
      // or default to center if both are missing
      const xPercent = textEl.xPercent ?? (textEl.x != null ? (textEl.x / item.width_in) * 100 : 50);
      const yPercent = textEl.yPercent ?? (textEl.y != null ? (textEl.y / item.height_in) * 100 : 50);
      
      return {
        ...textEl,
        xPercent,
        yPercent,
      };
    });
    
    console.log('🔍 QUOTE STORE: Migrated text elements:', migratedTextElements);
    
    const newState = {
      ...get(),
      widthIn: item.width_in,
      heightIn: item.height_in,
      quantity: item.quantity,
      material: item.material,
      grommets: item.grommets || 'none',
      polePockets: item.pole_pocket_position || item.pole_pockets || 'none',
      polePocketSize: item.pole_pocket_size || '2',
      addRope: item.rope_feet > 0,
      textElements: migratedTextElements,
      editingItemId: editingItemId || null, // Preserve editingItemId if provided
      // CRITICAL FIX: Don't load file as background if there's an overlay_image OR text elements
      // overlay_image is the uploaded image positioned on the canvas
      // text elements mean the file_url is actually the thumbnail with text baked in
      // In both cases, file would create a duplicate/composite background layer
      file: (() => {
        const hasOverlayImage = !!item.overlay_image;
        const hasOverlayImages = item.overlay_images && Array.isArray(item.overlay_images) && item.overlay_images.length > 0;
        const hasTextElements = textElementsArray && textElementsArray.length > 0;
        const shouldSkipFile = hasOverlayImage || hasOverlayImages || hasTextElements;
        
        console.log('───────────────────────────────────────────────────────');
        console.log('🔍 [FILE LOAD DECISION]');
        console.log('  hasOverlayImage:', hasOverlayImage);
        console.log('  hasOverlayImages:', hasOverlayImages, 'count:', item.overlay_images?.length || 0);
        console.log('  hasTextElements:', hasTextElements, 'count:', textElementsArray?.length || 0);
        console.log('  shouldSkipFile:', shouldSkipFile);
        console.log('───────────────────────────────────────────────────────');
        
        if (shouldSkipFile) {
          console.log('✅ [FILE LOAD] SKIPPING file load - would create duplicate/composite layer');
          console.log('   Reason:', hasOverlayImage ? 'HAS_OVERLAY_IMAGE' : hasOverlayImages ? 'HAS_OVERLAY_IMAGES' : 'HAS_TEXT_ELEMENTS');
          return undefined;
        }
        
        console.log('⚠️ [FILE LOAD] LOADING file - no overlay/text detected');
        
        return ((item.file_key || item.file_url || item.web_preview_url) ? (() => {
        let fileUrl: string;
        let extractedFileKey = item.file_key;
        
        if (item.file_key) {
          // We have the file_key, use it to construct the original URL
          fileUrl = `https://res.cloudinary.com/dtrxl120u/image/upload/${item.file_key}`;
        } else {
          // No file_key - try to extract it from the URL
          const urlToCheck = item.web_preview_url || item.print_ready_url || item.file_url || '';
          console.log('🔍 Extracting fileKey from URL:', urlToCheck);
          
          // Try to extract the public_id from the Cloudinary URL
          const uploadMatch = urlToCheck.match(/\/upload\/(.+?)(?:\?|$)/);
          if (uploadMatch) {
            let pathAfterUpload = uploadMatch[1];
            console.log('📍 Path after /upload/:', pathAfterUpload);
            
            // Remove transformation parameters
            const versionMatch = pathAfterUpload.match(/(v\d+\/.+)/);
            if (versionMatch) {
              extractedFileKey = versionMatch[1];
              fileUrl = `https://res.cloudinary.com/dtrxl120u/image/upload/${extractedFileKey}`;
              console.log('✅ Extracted fileKey:', extractedFileKey);
            } else {
              // No version number, try removing transformation params
              const cleanPath = pathAfterUpload.replace(/^[^/]*\//, '');
              if (cleanPath !== pathAfterUpload) {
                extractedFileKey = cleanPath;
                fileUrl = `https://res.cloudinary.com/dtrxl120u/image/upload/${extractedFileKey}`;
                console.log('✅ Extracted fileKey (no version):', extractedFileKey);
              } else {
                fileUrl = urlToCheck;
                console.log('⚠️ Could not extract fileKey, using URL as-is');
              }
            }
          } else {
            // Not a Cloudinary URL, use as-is
            fileUrl = urlToCheck;
            console.log('⚠️ Not a Cloudinary URL, using as-is');
          }
        }
        
        const fileObject = {
          name: item.file_name || 'Uploaded file',
          type: item.is_pdf ? 'application/pdf' : 'image/*',
          size: 1024,
          url: fileUrl,
          fileKey: extractedFileKey,
          isPdf: item.is_pdf,
          isAI: !!item.aiDesign,
          artworkWidth: item.artwork_width,
          artworkHeight: item.artwork_height,
        };
        console.log('📦 [FILE LOAD] Created file object:', { url: fileUrl?.substring(0, 60) + '...', fileKey: extractedFileKey });
        return fileObject;
      })() : undefined);
      })(),

      imageScale: item.image_scale || 1,
      imagePosition: item.image_position || { x: 0, y: 0 },
      // CRITICAL FIX: Single source of truth = overlayImages (array)
      overlayImages: (() => {
        // NEW: Load multiple overlay images
        if (item.overlay_images && Array.isArray(item.overlay_images)) {
          console.log('🖼️ [MULTI-IMAGE] Loading overlay images array:', item.overlay_images.length);
          return item.overlay_images.map((img: any) => ({
            ...img,
            position: img.position || { x: 50, y: 50 }
          }));
        }
        // BACKWARD COMPATIBILITY: Convert single overlayImage to array
        else if (item.overlay_image) {
          console.log('🔄 [BACKWARD COMPAT] Converting single overlay_image to array');
          return [{
            ...item.overlay_image,
            position: item.overlay_image.position || { x: 50, y: 50 }
          }];
        }
        return undefined;
      })(),
      // CRITICAL FIX: Clear singular overlayImage to prevent double loading
      overlayImage: undefined,
    };
    
    console.log('🔍 QUOTE STORE: Setting new state with imageScale:', newState.imageScale);
    console.log('🔍 QUOTE STORE: Setting new state with imagePosition:', newState.imagePosition);
    console.log('🔍 QUOTE STORE: Setting new state with overlayImage:', newState.overlayImage);
    console.log('�� QUOTE STORE: Setting new state with textElements:', newState.textElements);
    
    set(newState);
    
    // CRITICAL: Load canvas background color into editor store
    if (item.canvas_background_color) {
      console.log('🎨 QUOTE STORE: Loading canvas background color:', item.canvas_background_color);
      useEditorStore.getState().setCanvasBackgroundColor(item.canvas_background_color);
    }
    
    // Verify the state was set correctly
    const currentState = get();
    console.log('✅ QUOTE STORE: After set, imageScale is:', currentState.imageScale);
    console.log('✅ QUOTE STORE: After set, imagePosition is:', currentState.imagePosition);
    console.log('✅ QUOTE STORE: After set, overlayImage is:', currentState.overlayImage);
    console.log('✅ QUOTE STORE: After set, textElements is:', currentState.textElements);
  },
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
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 [RESET] resetDesign() called - clearing ALL state');
    console.log('═══════════════════════════════════════════════════════');
    
    // Also clear editor canvas objects
    useEditorStore.getState().reset();
    
    const resetState = {
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
    loadedItemId: null,
    isLoadingItem: false,
    file: undefined,
    overlayImage: undefined,
    overlayImages: undefined,
    imageScale: 1,
    imagePosition: { x: 0, y: 0 },
  };
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 [RESET] State reset complete - all cleared:');
    console.log('  file: UNDEFINED');
    console.log('  overlayImage: UNDEFINED');
    console.log('  overlayImages: UNDEFINED');
    console.log('  textElements: EMPTY ARRAY');
    console.log('  editingItemId: NULL');
    console.log('═══════════════════════════════════════════════════════');
    
    return set(resetState);
  }
}));
