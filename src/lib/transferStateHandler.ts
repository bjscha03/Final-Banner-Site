/**
 * Quick Quote → /design transfer state handler.
 *
 * Carries CONFIGURATION (productType, size, material, qty, add-ons) only.
 * NEVER carries a price or total — /design must always recompute from the
 * shared pricingEngine so numbers cannot drift out of sync.
 */

export type TransferProductType = 'banner' | 'car_magnet' | 'yard_sign';

export interface BannerTransferState {
  productType: 'banner';
  widthIn: number;
  heightIn: number;
  quantity: number;
  material: string;
  grommets?: string;
  polePockets?: string;
  addRope?: boolean;
}

export interface CarMagnetTransferState {
  productType: 'car_magnet';
  widthIn: number;
  heightIn: number;
  quantity: number;
  roundedCorners?: string;
}

export interface YardSignTransferState {
  productType: 'yard_sign';
  size: string; // e.g. "24x18"
  printSide: 'single' | 'double';
  quantity: number;
  material?: string;
  stepStakes?: boolean;
  stepStakeQty?: number;
}

export type QuickQuoteTransferState =
  | BannerTransferState
  | CarMagnetTransferState
  | YardSignTransferState;

const PRODUCT_PARAM_KEYS = ['productType', 'product', 'tab'] as const;

function normalizeProduct(value: string | null | undefined): TransferProductType | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === 'yard-sign' || v === 'yard_sign' || v === 'yard-signs') return 'yard_sign';
  if (v === 'car-magnet' || v === 'car-magnets' || v === 'car_magnet' || v === 'car_magnets') return 'car_magnet';
  if (v === 'banner' || v === 'banners') return 'banner';
  return null;
}

/** Serialize a Quick Quote state into URLSearchParams for /design. */
export function serializeQuickQuote(state: QuickQuoteTransferState): URLSearchParams {
  const params = new URLSearchParams();

  switch (state.productType) {
    case 'banner': {
      params.set('productType', 'banner');
      params.set('width', String(state.widthIn));
      params.set('height', String(state.heightIn));
      params.set('qty', String(state.quantity));
      params.set('material', state.material);
      params.set('grommets', state.grommets ?? 'none');
      params.set('polePockets', state.polePockets ?? 'none');
      params.set('addRope', state.addRope ? '1' : '0');
      return params;
    }
    case 'car_magnet': {
      params.set('product', 'car-magnets');
      params.set('size', `${state.widthIn}x${state.heightIn}`);
      params.set('material', 'magnetic');
      params.set('qty', String(state.quantity));
      const corners = state.roundedCorners ?? 'none';
      params.set('corners', corners);
      params.set('roundedCorners', corners);
      return params;
    }
    case 'yard_sign': {
      params.set('tab', 'yard-sign');
      params.set('productType', 'yard-sign');
      params.set('size', state.size);
      params.set('printSide', state.printSide);
      params.set('qty', String(state.quantity));
      params.set('material', state.material ?? 'corrugated-plastic');
      params.set('stepStakes', state.stepStakes ? '1' : '0');
      params.set('stepStakeQty', String(state.stepStakeQty ?? 0));
      return params;
    }
  }
}

/** Parse URLSearchParams from /design back into a Quick Quote transfer state. */
export function parseQuickQuote(params: URLSearchParams): QuickQuoteTransferState | null {
  let productType: TransferProductType | null = null;
  for (const key of PRODUCT_PARAM_KEYS) {
    const v = normalizeProduct(params.get(key));
    if (v) {
      productType = v;
      break;
    }
  }
  if (!productType) return null;

  const qty = Math.max(1, parseInt(params.get('qty') || '1', 10) || 1);

  if (productType === 'banner') {
    const width = parseFloat(params.get('width') || '0');
    const height = parseFloat(params.get('height') || '0');
    if (!(width > 0) || !(height > 0)) return null;
    return {
      productType: 'banner',
      widthIn: width,
      heightIn: height,
      quantity: qty,
      material: params.get('material') || '13oz',
      grommets: params.get('grommets') || 'none',
      polePockets: params.get('polePockets') || 'none',
      addRope: params.get('addRope') === '1',
    };
  }

  if (productType === 'car_magnet') {
    const size = params.get('size') || '';
    const [w, h] = size.split('x').map((s) => parseFloat(s));
    if (!(w > 0) || !(h > 0)) return null;
    return {
      productType: 'car_magnet',
      widthIn: w,
      heightIn: h,
      quantity: qty,
      roundedCorners: params.get('corners') || params.get('roundedCorners') || 'none',
    };
  }

  // yard_sign
  const printSide = (params.get('printSide') === 'double' ? 'double' : 'single') as 'single' | 'double';
  return {
    productType: 'yard_sign',
    size: params.get('size') || '24x18',
    printSide,
    quantity: qty,
    material: params.get('material') || 'corrugated-plastic',
    stepStakes: params.get('stepStakes') === '1',
    stepStakeQty: parseInt(params.get('stepStakeQty') || '0', 10) || 0,
  };
}
