import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuoteState, MaterialKey, Grommets } from './quote';
import { calculateTax, calculateTotalWithTax, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';

export interface CartItem {
  id: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material: MaterialKey;
  grommets: Grommets;
  pole_pockets: string;
  rope_feet: number;
  area_sqft: number;
  unit_price_cents: number;
  line_total_cents: number;
  file_key?: string;
  file_name?: string;
  file_url?: string;
  // Add-on relationship tracking
  parent_item_id?: string; // For add-on items, references the main banner item
  addon_type?: 'grommets' | 'rope' | 'pole_pockets'; // Type of add-on
  addon_details?: {
    // For grommets
    grommet_placement?: string;
    // For pole pockets
    pole_pocket_config?: string;
    pole_pocket_size?: string;
    // For rope
    linear_feet?: number;
  };
  // AI Design metadata (optional)
  aiDesign?: {
    prompt: string;
    styles: string[];
    colors: string[];
    size: { wIn: number; hIn: number };
    material: string;
    options: {
      grommets: string;
      polePockets: string;
      addRope: boolean;
    };
    ai: {
      provider: string;
      seed?: number;
      draftPublicId: string;
    };
    layers: {
      headline?: string;
      subheadline?: string;
      cta?: string;
    };
    assets: {
      proofUrl: string;
      finalUrl?: string;
    };
  };
  created_at: string;
}

export interface UpsellOption {
  id: 'grommets' | 'rope' | 'polePockets';
  label: string;
  description: string;
  price: number;
  selected: boolean;
  grommetSelection?: string;
  polePocketSelection?: string;
  polePocketSize?: string;
}

export interface CartState {
  items: CartItem[];
  addFromQuote: (quote: QuoteState, aiMetadata?: any) => void;
  addFromQuoteWithUpsells: (quote: QuoteState, upsellOptions: UpsellOption[], aiMetadata?: any) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getSubtotalCents: () => number;
  getTaxCents: () => number;
  getTotalCents: () => number;
  getItemCount: () => number;
  getMainItems: () => CartItem[];
  getAddonsForItem: (parentId: string) => CartItem[];
}

// Helper function to create add-on items
const createAddonItem = (
  parentItem: CartItem, 
  option: UpsellOption, 
  baseId: string
): CartItem => {
  const addonId = `${baseId}-addon-${option.id}`;
  
  switch (option.id) {
    case 'grommets':
      return {
        id: addonId,
        width_in: 0, // Add-ons don't have dimensions
        height_in: 0,
        quantity: parentItem.quantity,
        material: parentItem.material,
        grommets: 'none',
        pole_pockets: 'none',
        rope_feet: 0,
        area_sqft: 0,
        unit_price_cents: 0, // Grommets are free
        line_total_cents: 0,
        parent_item_id: parentItem.id,
        addon_type: 'grommets',
        addon_details: {
          grommet_placement: option.grommetSelection || 'every-2-3ft'
        },
        created_at: new Date().toISOString()
      };
    
    case 'rope':
      const ropeFeet = parentItem.width_in / 12;
      return {
        id: addonId,
        width_in: 0,
        height_in: 0,
        quantity: parentItem.quantity,
        material: parentItem.material,
        grommets: 'none',
        pole_pockets: 'none',
        rope_feet: ropeFeet,
        area_sqft: 0,
        unit_price_cents: Math.round(option.price * 100 / parentItem.quantity), // Price per unit
        line_total_cents: Math.round(option.price * 100),
        parent_item_id: parentItem.id,
        addon_type: 'rope',
        addon_details: {
          linear_feet: ropeFeet
        },
        created_at: new Date().toISOString()
      };
    
    case 'polePockets':
      return {
        id: addonId,
        width_in: 0,
        height_in: 0,
        quantity: parentItem.quantity,
        material: parentItem.material,
        grommets: 'none',
        pole_pockets: option.polePocketSelection || 'top-bottom',
        rope_feet: 0,
        area_sqft: 0,
        unit_price_cents: Math.round(option.price * 100 / parentItem.quantity), // Price per unit
        line_total_cents: Math.round(option.price * 100),
        parent_item_id: parentItem.id,
        addon_type: 'pole_pockets',
        addon_details: {
          pole_pocket_config: option.polePocketSelection || 'top-bottom',
          pole_pocket_size: option.polePocketSize || '2'
        },
        created_at: new Date().toISOString()
      };
    
    default:
      throw new Error(`Unknown addon type: ${option.id}`);
  }
};