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
  file?: {
    name: string;
    type: string;
    size: number;
    url?: string;
    isPdf?: boolean;
    fileKey?: string;
    isAI?: boolean;
    aiMetadata?: {
      prompt?: string;
      styles?: string[];
      colors?: string[];
      model?: string;
      aspectRatio?: string;
    };
  };
  set: (partial: Partial<QuoteState>) => void;
  setFromQuickQuote: (params: QuickQuoteParams) => void;
}

export const useQuoteStore = create<QuoteState>((set) => ({
  widthIn: 48,
  heightIn: 24,
  quantity: 1,
  material: '13oz',
  grommets: 'none',
  polePockets: 'none',
  polePocketSize: '2',
  addRope: false,
  previewScalePct: 100,
  file: undefined,
  set: (partial) => set((state) => ({ ...state, ...partial })),
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
    addRope: false,
    file: undefined,
  })),
}));
