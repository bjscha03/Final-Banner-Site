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
    normalized.grommetsDisplay ? `Grommets: ${normalized.grommetsDisplay}` : null,
    normalized.ropeDisplay ? `Rope: ${normalized.ropeDisplay}` : null,
    normalized.polePocketsDisplay ? `Pole Pockets: ${normalized.polePocketsDisplay}` : null,
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
  const polePocketPosition = String(item.pole_pocket_position || item.pole_pockets || '').trim();
  const hasPolePocket = polePocketPosition && polePocketPosition !== 'none' && polePocketPosition !== 'false';
  const stepStakesQty = Number(item.yard_sign_step_stakes_qty || 0);
  const uploadedDesignsCount = Number(item.yard_sign_design_count || 0);
  const grommetsDisplay = getDisplayGrommets(item.grommets);

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
          ...(grommetsDisplay ? { grommetsDisplay } : {}),
          ...(ropeFeet > 0 ? { ropeDisplay: `${ropeFeet.toFixed(1)} ft` } : {}),
          ...(hasPolePocket ? { polePocketsDisplay: `${polePocketPosition}${item.pole_pocket_size ? ` (${item.pole_pocket_size} inch)` : ''}` } : {}),
        }),
  };
}

/**
 * Get the PayPal order description.
 */
function getPayPalDescription(items) {
  const hasYardSigns = items && items.some(i => i.product_type === 'yard_sign');
  const hasCarMagnets = items && items.some(i => i.product_type === 'car_magnet');
  const hasBanners = items && items.some(i => !['yard_sign', 'car_magnet'].includes(String(i.product_type || 'banner')));
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
};
