/**
 * Product Display Helpers for Netlify Functions (CommonJS)
 * 
 * Shared helpers for generating product-specific display names in emails,
 * notifications, and admin views from the backend.
 */

/**
 * Get the display name for a line item based on product_type.
 */
const YARD_SIGN_SIZE = '24" × 18"';

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getDisplayMaterial(item) {
  if (item.product_type === 'yard_sign') return 'Corrugated Plastic';
  const raw = String(item.material || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'corrugated' || raw === 'corrugated plastic') return 'Corrugated Plastic';
  if (raw === '13oz' || raw === '13 oz' || raw === '13oz vinyl') return '13oz Vinyl';
  return toTitleCase(raw);
}

function getDisplaySize(item) {
  if (item.product_type === 'yard_sign') return YARD_SIGN_SIZE;
  if (item.width_in == null || item.height_in == null) return '';
  return `${item.width_in}" × ${item.height_in}"`;
}

function getDisplayGrommets(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'false') return '';
  const map = {
    '4-corners': '4 Corners',
    'every-2-3ft': 'Every 2 Feet',
    'every-1-2ft': 'Every 1–2 Feet',
    'top-corners': 'Top Corners',
  };
  return map[raw] || toTitleCase(raw.replace(/-/g, ' '));
}

function getItemDisplayName(item) {
  if (item.product_type === 'yard_sign') {
    return `Custom Yard Sign ${YARD_SIGN_SIZE}`;
  }
  return `Custom Banner ${getDisplaySize(item)}`;
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
      `Size: ${getDisplaySize(item)}`,
      'Material: Corrugated Plastic',
      `Print: ${item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}`,
    ];
    if (item.quantity != null) {
      parts.push(`Total Signs: ${item.quantity}`);
    }
    if (item.yard_sign_design_count != null && item.yard_sign_design_count > 0) {
      parts.push(`Uploaded Designs: ${item.yard_sign_design_count}`);
    }
    if (item.yard_sign_step_stakes_qty && item.yard_sign_step_stakes_qty > 0) {
      parts.push(`Step Stakes: ${item.yard_sign_step_stakes_qty}`);
    }
    if (item.design_service_enabled) parts.push('⚡ Design Service Order');
    return parts.filter(Boolean).join(' • ');
  }

  // Banner options (default)
  const parts = [
    `Size: ${getDisplaySize(item)}`,
    `Material: ${getDisplayMaterial(item) || '13oz Vinyl'}`,
    `Print: ${item.sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}`,
    item.quantity != null ? `Quantity: ${item.quantity}` : null,
    getDisplayGrommets(item.grommets) ? `Grommets: ${getDisplayGrommets(item.grommets)}` : null,
    item.rope_feet && item.rope_feet > 0 ? `Rope: ${Number(item.rope_feet).toFixed(1)} ft` : null,
    (item.pole_pocket_position && item.pole_pocket_position !== 'none')
      ? `Pole Pockets: ${item.pole_pocket_position}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
      : (item.pole_pockets && item.pole_pockets !== 'none' && item.pole_pockets !== false && item.pole_pockets !== 'false')
        ? 'Pole Pockets: Yes'
        : null,
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
