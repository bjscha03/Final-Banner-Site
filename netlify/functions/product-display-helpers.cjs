/**
 * Product Display Helpers for Netlify Functions (CommonJS)
 * 
 * Shared helpers for generating product-specific display names in emails,
 * notifications, and admin views from the backend.
 */

/**
 * Get the display name for a line item based on product_type.
 */
function getItemDisplayName(item) {
  if (item.product_type === 'yard_sign') {
    return 'Custom Yard Sign 24"×18"';
  }
  return `Custom Banner ${item.width_in}"×${item.height_in}"`;
}

/**
 * Get a short product label (no dimensions).
 */
function getProductLabel(productType) {
  if (productType === 'yard_sign') return 'Yard Sign';
  return 'Banner';
}

/**
 * Check if an item is a yard sign.
 */
function isYardSignItem(item) {
  return item.product_type === 'yard_sign';
}

/**
 * Get item options string for email.
 * Yard signs: material, print side, designs, step stakes.
 * Banners: material, grommets, rope, pole pockets.
 */
function getEmailItemOptions(item) {
  if (item.product_type === 'yard_sign') {
    const parts = [
      'Material: Corrugated Plastic',
      `Print: ${item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}`,
    ];
    if (item.yard_sign_design_count) {
      parts.push(`Designs: ${item.yard_sign_design_count} files uploaded`);
    }
    if (item.quantity) {
      parts.push(`Total Signs: ${item.quantity}`);
    }
    if (item.yard_sign_step_stakes_qty && item.yard_sign_step_stakes_qty > 0) {
      parts.push(`Step Stakes: ${item.yard_sign_step_stakes_qty}`);
    }
    if (item.file_key) parts.push(`File: ${item.file_key}`);
    if (item.design_service_enabled) parts.push('⚡ Design Service Order');
    return parts.filter(Boolean).join(' • ');
  }

  // Banner options (default)
  const parts = [
    `Material: ${item.material}`,
    item.grommets && item.grommets !== 'none' ? `Grommets: ${item.grommets}` : null,
    item.rope_feet && item.rope_feet > 0 ? `Rope: ${Number(item.rope_feet).toFixed(1)} ft` : null,
    (item.pole_pocket_position && item.pole_pocket_position !== 'none')
      ? `Pole Pockets: ${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
      : (item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== false && item.pole_pockets !== 'false')
        ? 'Pole Pockets: Yes'
        : null,
    item.file_key ? `File: ${item.file_key}` : null,
    item.design_service_enabled ? '⚡ Design Service Order' : null,
  ];
  return parts.filter(Boolean).join(' • ');
}

/**
 * Get the PayPal order description.
 */
function getPayPalDescription(items) {
  const hasYardSigns = items && items.some(i => i.product_type === 'yard_sign');
  const hasBanners = items && items.some(i => i.product_type !== 'yard_sign');
  if (hasYardSigns && hasBanners) return 'Custom Order - Banners On The Fly';
  if (hasYardSigns) return 'Custom Yard Sign Order - Banners On The Fly';
  return 'Custom Banner Order - Banners On The Fly';
}

module.exports = {
  getItemDisplayName,
  getProductLabel,
  isYardSignItem,
  getEmailItemOptions,
  getPayPalDescription,
};
