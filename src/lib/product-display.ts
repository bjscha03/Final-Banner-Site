/**
 * Product Display Utilities
 * 
 * Centralized helpers for generating product-specific display names,
 * labels, and descriptions. Used across cart, checkout, emails, admin, 
 * and invoice to ensure consistent product identification.
 */

const YARD_SIGN_SIZE = '24" × 18"';

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getDisplayMaterial(item: { product_type?: string; material?: string }): string {
  if (item.product_type === 'yard_sign') return 'Corrugated Plastic';
  const raw = String(item.material || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'corrugated' || raw === 'corrugated plastic') return 'Corrugated Plastic';
  if (raw === '13oz' || raw === '13 oz' || raw === '13oz vinyl') return '13oz Vinyl';
  return toTitleCase(raw);
}

export function getDisplaySize(item: {
  product_type?: string;
  width_in?: number;
  height_in?: number;
}): string {
  if (item.product_type === 'yard_sign') return YARD_SIGN_SIZE;
  if (item.width_in == null || item.height_in == null) return '';
  return `${item.width_in}" × ${item.height_in}"`;
}

export function getDisplayGrommets(value?: string | null): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'false') return '';
  const map: Record<string, string> = {
    '4-corners': '4 Corners',
    'every-2-3ft': 'Every 2 Feet',
    'every-1-2ft': 'Every 1–2 Feet',
    'top-corners': 'Top Corners',
  };
  return map[raw] || toTitleCase(raw.replace(/-/g, ' '));
}

/**
 * Get the display name for a line item based on product_type.
 * 
 * Yard signs: "Custom Yard Sign 24" × 18""
 * Banners:    "Custom Banner 48" × 24""
 */
export function getItemDisplayName(item: {
  product_type?: string;
  width_in?: number;
  height_in?: number;
}): string {
  if (item.product_type === 'yard_sign') {
    return `Custom Yard Sign ${YARD_SIGN_SIZE}`;
  }
  return `Custom Banner ${getDisplaySize(item)}`;
}

/**
 * Get a short product label (no dimensions).
 */
export function getProductLabel(productType?: string): string {
  if (productType === 'yard_sign') return 'Yard Sign';
  return 'Banner';
}

/**
 * Get the product category name for analytics.
 */
export function getProductCategory(productType?: string): string {
  if (productType === 'yard_sign') return 'Yard Signs';
  return 'Banner';
}

/**
 * Get the full product type name for display.
 */
export function getProductTypeName(productType?: string): string {
  if (productType === 'yard_sign') return 'Custom Yard Signs';
  return 'Custom Banner';
}

/**
 * Get invoice subtitle text.
 */
export function getInvoiceSubtitle(items: Array<{ product_type?: string }>): string {
  const hasYardSigns = items.some(i => i.product_type === 'yard_sign');
  const hasBanners = items.some(i => i.product_type !== 'yard_sign');
  if (hasYardSigns && hasBanners) return 'Custom Order Invoice';
  if (hasYardSigns) return 'Custom Yard Sign Invoice';
  return 'Custom Banner Invoice';
}

/**
 * Check if an item is a yard sign.
 */
export function isYardSignItem(item: { product_type?: string }): boolean {
  return item.product_type === 'yard_sign';
}

/**
 * Get the formatted item name for email payloads (no special characters issues).
 */
export function getEmailItemName(item: {
  product_type?: string;
  width_in?: number;
  height_in?: number;
}): string {
  if (item.product_type === 'yard_sign') {
    return `Custom Yard Sign ${YARD_SIGN_SIZE}`;
  }
  return `Custom Banner ${getDisplaySize(item)}`;
}

/**
 * Get the item options string for email display.
 * Yard signs show sidedness, material=corrugated, step stakes.
 * Banners show material, grommets, rope, pole pockets.
 */
export function getEmailItemOptions(item: {
  product_type?: string;
  material?: string;
  grommets?: string;
  rope_feet?: number;
  pole_pockets?: string;
  pole_pocket_position?: string;
  pole_pocket_size?: string;
  file_key?: string;
  design_service_enabled?: boolean;
  // Yard sign specific
  yard_sign_sidedness?: string;
  yard_sign_step_stakes_qty?: number;
  yard_sign_design_count?: number;
}): string {
  if (item.product_type === 'yard_sign') {
    const parts: string[] = [
      `Size: ${getDisplaySize(item)}`,
      'Material: Corrugated Plastic',
      `Print: ${item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}`,
    ];
    if (item.yard_sign_design_count != null && item.yard_sign_design_count > 0) {
      parts.push(`Uploaded Designs: ${item.yard_sign_design_count}`);
    }
    if (item.yard_sign_step_stakes_qty && item.yard_sign_step_stakes_qty > 0) {
      parts.push(`Step Stakes: ${item.yard_sign_step_stakes_qty}`);
    }
    if (item.design_service_enabled) parts.push('⚡ Design Service Order');
    return parts.filter(Boolean).join(' • ');
  }

  // Banner options
  const parts: (string | null)[] = [
    `Size: ${getDisplaySize(item)}`,
    `Material: ${getDisplayMaterial(item) || '13oz Vinyl'}`,
    getDisplayGrommets(item.grommets) ? `Grommets: ${getDisplayGrommets(item.grommets)}` : null,
    item.rope_feet && item.rope_feet > 0 ? `Rope: ${item.rope_feet.toFixed(1)} ft` : null,
    (item.pole_pocket_position && item.pole_pocket_position !== 'none')
      ? `Pole Pockets: ${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
      : (item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== 'false')
        ? 'Pole Pockets: Yes'
        : null,
    item.design_service_enabled ? '⚡ Design Service Order' : null,
  ];
  return parts.filter(Boolean).join(' • ');
}
