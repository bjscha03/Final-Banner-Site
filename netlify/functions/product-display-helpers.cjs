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

function getCarMagnetRoundedCornersLabel(value) {
  if (!value || value === 'none') return 'None';
  if (value === '0.5') return '1/2"';
  if (value === '1') return '1"';
  return String(value);
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getDisplayMaterial(item) {
  if (item.product_type === 'yard_sign') return 'Corrugated Plastic';
  if (item.product_type === 'car_magnet') return 'Premium Magnetic Material';
  const raw = String(item.material || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'corrugated' || raw === 'corrugated plastic') return 'Corrugated Plastic';
  if (raw === 'magnetic' || raw === 'premium magnetic material') return 'Premium Magnetic Material';
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
  const key = raw.replace(/[_\s]+/g, '-');
  const map = {
    '4-corners': '4 Corners Only',
    'every-2-3ft': 'Every 2–3 Feet',
    'every-1-2ft': 'Every 1–2 Feet',
    'top-corners': 'Top Corners Only',
    'bottom-corners': 'Bottom Corners Only',
    'left-corners': 'Left Side Only',
    'right-corners': 'Right Side Only',
    'four-corners': '4 Corners Only',
    'every-2-3-feet': 'Every 2–3 Feet',
    'every-1-2-feet': 'Every 1–2 Feet',
    'left-side': 'Left Side Only',
    'right-side': 'Right Side Only',
  };
  return map[key] || toTitleCase(key.replace(/-/g, ' '));
}


function formatOptionValue(value) {
  if (typeof value === 'boolean') return value ? 'Included' : 'None';
  const raw = String(value || '').trim();
  if (!raw) return 'None';
  const lower = raw.toLowerCase();
  if (lower === 'none' || lower === 'false' || lower === 'null' || lower === 'undefined') return 'None';
  return raw;
}

function getDisplayPlacement(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'false') return '';
  const key = raw.replace(/[_\s]+/g, '-');
  const map = {
    'top': 'Top Only',
    'top-only': 'Top Only',
    'bottom': 'Bottom Only',
    'bottom-only': 'Bottom Only',
    'top-bottom': 'Top & Bottom',
    'both': 'Top & Bottom',
    'left': 'Left Only',
    'left-only': 'Left Only',
    'right': 'Right Only',
    'right-only': 'Right Only',
  };
  return map[key] || toTitleCase(key.replace(/-/g, ' '));
}

function getItemDisplayName(item) {
  if (item.product_type === 'yard_sign') {
    return `Custom Yard Sign ${YARD_SIGN_SIZE}`;
  }
  if (item.product_type === 'car_magnet') {
    return `Car Magnets ${getDisplaySize(item)}`;
  }
  return `Custom Banner ${getDisplaySize(item)}`;
}

/**
 * Get a short product label (no dimensions).
 */
function getProductLabel(productType) {
  if (productType === 'yard_sign') return 'Yard Sign';
  if (productType === 'car_magnet') return 'Car Magnets';
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
  const normalized = normalizeOrderItemDisplay(item);
  if (item.product_type === 'yard_sign') {
    const parts = [
      `Size: ${normalized.sizeDisplay}`,
      `Material: ${normalized.materialDisplay}`,
      `Print: ${normalized.printDisplay}`,
    ];
    if (normalized.qtyDisplay) {
      parts.push(`Qty: ${normalized.qtyDisplay}`);
    }
    if (normalized.uploadedDesignsCount) {
      parts.push(`Uploaded Designs: ${normalized.uploadedDesignsCount}`);
    }
    if (normalized.stepStakesQty) {
      parts.push(`Step Stakes: ${normalized.stepStakesQty}`);
    }
    if (item.design_service_enabled) parts.push('⚡ Design Service Order');
    return parts.filter(Boolean).join(' • ');
  }

  if (item.product_type === 'car_magnet') {
    const parts = [
      `Size: ${normalized.sizeDisplay}`,
      `Material: ${normalized.materialDisplay}`,
      `Print: ${normalized.printDisplay}`,
      normalized.qtyDisplay ? `Qty: ${normalized.qtyDisplay}` : null,
      `Rounded Corners: ${normalized.roundedCornersDisplay || 'None'}`,
      item.design_service_enabled ? '⚡ Design Service Order' : null,
    ];
    return parts.filter(Boolean).join(' • ');
  }

  // Banner options (default)
  const parts = [
    `Size: ${normalized.sizeDisplay}`,
    `Material: ${normalized.materialDisplay}`,
    `Print: ${normalized.printDisplay}`,
    normalized.qtyDisplay ? `Qty: ${normalized.qtyDisplay}` : null,
    `Grommets: ${formatOptionValue(normalized.grommetsDisplay)}`,
    `Pole Pockets: ${formatOptionValue(normalized.polePocketsDisplay)}`,
    `Rope: ${formatOptionValue(normalized.ropeDisplay)}`,
    'Hemming: Always included',
    item.design_service_enabled ? '⚡ Design Service Order' : null,
  ];
  return parts.filter(Boolean).join(' • ');
}

function normalizeOrderItemDisplay(item) {
  const isYardSign = item.product_type === 'yard_sign';
  const isCarMagnet = item.product_type === 'car_magnet';
  const qty = Number(item.quantity || 0);
  const lineTotalCents = Number(item.line_total_cents || 0);
  const unitPriceCents = Number(
    item.unit_price_cents != null
      ? item.unit_price_cents
      : qty > 0
        ? Math.round(lineTotalCents / qty)
        : 0
  );
  const ropeFeet = Number(item.rope_feet || 0);
  const ropePlacementLabel = getDisplayPlacement(item.rope_placement);
  const ropeDisplay = ropeFeet > 0
    ? (ropePlacementLabel || `${ropeFeet.toFixed(1)} ft`)
    : 'None';
  const polePocketPositionRaw = String(item.pole_pocket_position || item.pole_pockets || '').trim();
  const hasPolePocket = polePocketPositionRaw && polePocketPositionRaw !== 'none' && polePocketPositionRaw !== 'false';
  const polePocketPlacementLabel = hasPolePocket
    ? (getDisplayPlacement(polePocketPositionRaw) || polePocketPositionRaw)
    : '';
  const polePocketsDisplay = hasPolePocket
    ? `${polePocketPlacementLabel}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}`
    : 'None';
  const stepStakesQty = Number(item.yard_sign_step_stakes_qty || 0);
  const uploadedDesignsCount = Number(item.yard_sign_design_count || 0);
  const grommetsDisplay = formatOptionValue(getDisplayGrommets(item.grommets));

  return {
    productType: isYardSign ? 'yard-sign' : (isCarMagnet ? 'car-magnet' : 'banner'),
    productLabel: isYardSign ? 'Yard Sign' : (isCarMagnet ? 'Car Magnets' : 'Banner'),
    displayName: getItemDisplayName(item),
    sizeDisplay: getDisplaySize(item),
    materialDisplay: getDisplayMaterial(item) || (isYardSign ? 'Corrugated Plastic' : (isCarMagnet ? 'Premium Magnetic Material' : '13oz Vinyl')),
    printDisplay: isYardSign
      ? (item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided')
      : 'Single-Sided',
    qtyDisplay: String(Math.max(qty, 0)),
    unitPriceCents,
    lineTotalCents,
    thumbnailUrl: item.thumbnail_url || '',
    finalizedPreviewUrl: item.final_render_url || item.thumbnail_url || '',
    printFileUrl: item.final_print_pdf_url || item.print_ready_url || '',
    ...(isYardSign
      ? {
          ...(uploadedDesignsCount > 0 ? { uploadedDesignsCount } : {}),
          ...(stepStakesQty > 0 ? { stepStakesQty, stepStakesLine: `Step Stakes: ${stepStakesQty}` } : {}),
          printSide: item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided',
        }
      : isCarMagnet
        ? {
            roundedCornersDisplay: getCarMagnetRoundedCornersLabel(item.rounded_corners),
          }
      : {
          grommetsDisplay,
          ropeDisplay: formatOptionValue(ropeDisplay),
          polePocketsDisplay: formatOptionValue(polePocketsDisplay),
          hemmingDisplay: 'Always included',
        }),
  };
}

// PayPal's purchase_units[].description has a hard limit of 127 characters.
const PAYPAL_DESCRIPTION_MAX = 127;

/**
 * Truncate a description to fit within PayPal's character limit.
 * Prefers cutting at the last comma to avoid mid-token truncation,
 * then appends an ellipsis. If the string already fits, returns it unchanged.
 */
function truncatePayPalDescription(text, max = PAYPAL_DESCRIPTION_MAX) {
  const s = String(text || '');
  if (s.length <= max) return s;
  // Reserve 1 char for the ellipsis ("…").
  const budget = max - 1;
  const slice = s.slice(0, budget);
  const lastComma = slice.lastIndexOf(',');
  // Only cut at a comma if it leaves a reasonable amount of content.
  if (lastComma > Math.floor(budget * 0.5)) {
    return `${slice.slice(0, lastComma)}…`;
  }
  return `${slice}…`;
}

/**
 * Build a human-readable, single-line description of a banner line item
 * for inclusion in the PayPal order/receipt.
 *
 * Example: 'Banner - 96" × 24", 13oz Vinyl, Qty 1, Grommets: Every 2–3 Feet,
 *           Pole Pockets: None, Rope: None, Hemming: Always included'
 */
function buildBannerPayPalLine(item) {
  const size = getDisplaySize(item);
  const material = getDisplayMaterial(item) || '13oz Vinyl';
  const qty = Number(item.quantity || 1) || 1;
  const grommetsLabel = getDisplayGrommets(item.grommets) || 'None';

  const polePocketRaw = String(item.pole_pocket_position || item.pole_pockets || '')
    .trim()
    .toLowerCase();
  const hasPolePocket = polePocketRaw && polePocketRaw !== 'none' && polePocketRaw !== 'false';
  const polePocketsLabel = hasPolePocket
    ? (getDisplayPlacement(polePocketRaw) || 'Yes')
    : 'None';

  const ropeFeet = Number(item.rope_feet || 0);
  const ropeLabel = ropeFeet > 0
    ? (getDisplayPlacement(item.rope_placement) || 'Yes')
    : 'None';

  const sizePart = size ? `${size}, ` : '';
  return `Banner - ${sizePart}${material}, Qty ${qty}, Grommets: ${grommetsLabel}, Pole Pockets: ${polePocketsLabel}, Rope: ${ropeLabel}, Hemming: Always included`;
}

/**
 * Get the PayPal order description.
 *
 * For single-item banner orders we return a detailed, human-readable
 * configuration string (size, material, qty, finishing) so the PayPal
 * receipt clearly reflects what the customer ordered. For multi-item or
 * non-banner carts we fall back to a short generic title.
 *
 * The returned string is always within PayPal's 127-character limit.
 */
function getPayPalDescription(items) {
  if (!items || items.length === 0) {
    return 'Custom Order - Banners On The Fly';
  }

  // Single-item: include full product configuration.
  if (items.length === 1) {
    const item = items[0];
    const type = String(item.product_type || 'banner');
    if (type !== 'yard_sign' && type !== 'car_magnet') {
      return truncatePayPalDescription(buildBannerPayPalLine(item));
    }
    if (type === 'yard_sign') {
      const size = getDisplaySize(item) || YARD_SIGN_SIZE;
      const sides = item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided';
      const qty = Number(item.quantity || 1) || 1;
      const stakes = Number(item.yard_sign_step_stakes_qty || 0);
      const stakesPart = stakes > 0 ? `, Step Stakes: ${stakes}` : '';
      return truncatePayPalDescription(
        `Yard Sign - ${size}, Corrugated Plastic, ${sides}, Qty ${qty}${stakesPart}`
      );
    }
    if (type === 'car_magnet') {
      const size = getDisplaySize(item);
      const qty = Number(item.quantity || 1) || 1;
      const corners = getCarMagnetRoundedCornersLabel(item.rounded_corners);
      const sizePart = size ? `${size}, ` : '';
      return truncatePayPalDescription(
        `Car Magnets - ${sizePart}Premium Magnetic Material, Qty ${qty}, Rounded Corners: ${corners}`
      );
    }
  }

  // Multi-item carts: keep a short generic title (preserves prior behavior).
  const hasYardSigns = items.some(i => i.product_type === 'yard_sign');
  const hasCarMagnets = items.some(i => i.product_type === 'car_magnet');
  const hasBanners = items.some(i => !['yard_sign', 'car_magnet'].includes(String(i.product_type || 'banner')));
  if ((hasYardSigns && hasBanners) || (hasCarMagnets && hasBanners) || (hasCarMagnets && hasYardSigns)) return 'Custom Order - Banners On The Fly';
  if (hasYardSigns) return 'Custom Yard Sign Order - Banners On The Fly';
  if (hasCarMagnets) return 'Car Magnets Order - Banners On The Fly';
  return 'Custom Banner Order - Banners On The Fly';
}

module.exports = {
  getItemDisplayName,
  getProductLabel,
  isYardSignItem,
  getEmailItemOptions,
  normalizeOrderItemDisplay,
  getPayPalDescription,
  getDisplayGrommets,
  getDisplayPlacement,
  formatOptionValue,
};
