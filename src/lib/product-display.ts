/**
 * Product Display Utilities
 * 
 * Centralized helpers for generating product-specific display names,
 * labels, and descriptions. Used across cart, checkout, emails, admin, 
 * and invoice to ensure consistent product identification.
 */

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
    return `Custom Yard Sign 24" × 18"`;
  }
  const w = item.width_in ?? 0;
  const h = item.height_in ?? 0;
  return `Custom Banner ${w}" × ${h}"`;
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
    return 'Custom Yard Sign 24"×18"';
  }
  return `Custom Banner ${item.width_in}"×${item.height_in}"`;
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
      'Material: Corrugated Plastic',
      `Print: ${item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}`,
    ];
    if (item.yard_sign_design_count) {
      parts.push(`Designs: ${item.yard_sign_design_count} files uploaded`);
    }
    if (item.yard_sign_step_stakes_qty && item.yard_sign_step_stakes_qty > 0) {
      parts.push(`Step Stakes: ${item.yard_sign_step_stakes_qty}`);
    }
    if (item.file_key) parts.push(`File: ${item.file_key}`);
    if (item.design_service_enabled) parts.push('⚡ Design Service Order');
    return parts.filter(Boolean).join(' • ');
  }

  // Banner options
  const parts: (string | null)[] = [
    `Material: ${item.material}`,
    item.grommets && item.grommets !== 'none' ? `Grommets: ${item.grommets}` : null,
    item.rope_feet && item.rope_feet > 0 ? `Rope: ${item.rope_feet.toFixed(1)} ft` : null,
    (item.pole_pocket_position && item.pole_pocket_position !== 'none')
      ? `Pole Pockets: ${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
      : (item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== 'false')
        ? 'Pole Pockets: Yes'
        : null,
    item.file_key ? `File: ${item.file_key}` : null,
    item.design_service_enabled ? '⚡ Design Service Order' : null,
  ];
  return parts.filter(Boolean).join(' • ');
}
