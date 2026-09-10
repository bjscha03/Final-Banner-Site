'use strict';

const PRODUCT_LIMIT = 50;
const MAX_QUANTITY = 1000;
const BANNER_MATERIAL_CENTS_PER_SQ_FT = Object.freeze({
  '13oz': 450,
  '15oz': 600,
  '18oz': 750,
  mesh: 600,
});
const BANNER_GROMMETS = new Set([
  'none',
  'every-2-3ft',
  'every-1-2ft',
  '4-corners',
  'top-corners',
  'bottom-corners',
  'right-corners',
  'left-corners',
]);
const POLE_POCKET_POSITIONS = new Set(['none', 'top', 'bottom', 'left', 'right', 'top-bottom']);
const POLE_POCKET_SIZES = new Set(['1', '2', '3', '4']);
const ROPE_PLACEMENTS = new Set(['top', 'bottom', 'top-bottom']);
const MAGNET_PRICES = new Map([
  ['18x12', 2900],
  ['24x12', 4000],
  ['24x18', 4700],
  ['42x12', 6000],
  ['72x24', 16000],
]);
const MAGNET_CORNERS = new Set(['none', '0.5', '1']);

class StripePricingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StripePricingError';
    this.code = code;
    this.statusCode = 409;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new StripePricingError(code, message, details);
}

function number(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    fail('CART_PRICE_INPUT_INVALID', `${field} is invalid.`, { field });
  }
  return parsed;
}

function clean(value) {
  return String(value ?? '').trim();
}

function hasTruthyOption(value) {
  if (value === true || value === 1) return true;
  return !['', '0', 'false', 'none', 'no', 'off', 'null', 'undefined'].includes(clean(value).toLowerCase());
}

function lineFeet(width, height, position) {
  switch (position) {
    case 'top':
    case 'bottom': return width / 12;
    case 'left':
    case 'right': return height / 12;
    case 'top-bottom': return (width / 12) * 2;
    default: return 0;
  }
}

function normalizeBanner(item, index) {
  const width = number(item.width_in, `items[${index}].width_in`, { min: 6, max: 600 });
  const height = number(item.height_in, `items[${index}].height_in`, { min: 6, max: 600 });
  if ((width * height) / 144 > 1000) {
    fail('BANNER_CUSTOM_QUOTE_REQUIRED', 'Banners over 1,000 square feet require a custom quote.', { index });
  }
  const quantity = number(item.quantity ?? 1, `items[${index}].quantity`, { min: 1, max: MAX_QUANTITY, integer: true });
  const material = clean(item.material || '13oz').toLowerCase();
  if (!Object.hasOwn(BANNER_MATERIAL_CENTS_PER_SQ_FT, material)) {
    fail('BANNER_MATERIAL_INVALID', 'This banner material is not available.', { index, material });
  }
  const grommets = clean(item.grommets || 'none').toLowerCase();
  if (!BANNER_GROMMETS.has(grommets)) {
    fail('BANNER_GROMMETS_INVALID', 'This grommet option is not available.', { index, grommets });
  }

  const areaSqFt = (width * height) / 144;
  const unitPriceCents = Math.max(2000, Math.round(areaSqFt * BANNER_MATERIAL_CENTS_PER_SQ_FT[material]));
  const baseCents = unitPriceCents * quantity;

  const rawRopePlacement = clean(item.rope_placement).toLowerCase();
  const addRope = number(item.rope_feet || 0, `items[${index}].rope_feet`, { min: 0, max: 100000 }) > 0
    || Boolean(rawRopePlacement);
  const ropePlacement = addRope ? (rawRopePlacement || 'top') : null;
  if (ropePlacement && !ROPE_PLACEMENTS.has(ropePlacement)) {
    fail('BANNER_ROPE_INVALID', 'This rope placement is not available.', { index, ropePlacement });
  }
  const ropeFeet = ropePlacement ? lineFeet(width, height, ropePlacement) : 0;
  const ropeCostCents = Math.round(ropeFeet * quantity * 200);

  const rawPocketValue = item.pole_pocket_position ?? item.pole_pockets ?? 'none';
  let pocketPosition = clean(rawPocketValue).toLowerCase();
  if (typeof rawPocketValue === 'boolean') {
    pocketPosition = rawPocketValue ? clean(item.pole_pocket_position).toLowerCase() : 'none';
  }
  if (!pocketPosition) pocketPosition = hasTruthyOption(item.pole_pockets) ? '' : 'none';
  if (!POLE_POCKET_POSITIONS.has(pocketPosition)) {
    fail('BANNER_POLE_POCKETS_INVALID', 'Choose a supported pole-pocket position.', { index, pocketPosition });
  }
  const pocketSize = pocketPosition === 'none'
    ? null
    : clean(item.pole_pocket_size || '2');
  if (pocketSize && !POLE_POCKET_SIZES.has(pocketSize)) {
    fail('BANNER_POLE_POCKET_SIZE_INVALID', 'Choose a supported pole-pocket size.', { index, pocketSize });
  }
  const pocketFeet = lineFeet(width, height, pocketPosition);
  const pocketCostCents = pocketFeet > 0
    ? 1500 + Math.round(pocketFeet * quantity * 200)
    : 0;

  return {
    ...item,
    product_type: 'banner',
    width_in: width,
    height_in: height,
    quantity,
    material,
    grommets,
    unit_price_cents: unitPriceCents,
    rope_feet: ropeFeet,
    rope_placement: ropePlacement,
    rope_cost_cents: ropeCostCents,
    rope_pricing_mode: 'per_item',
    pole_pockets: pocketPosition,
    pole_pocket_position: pocketPosition,
    pole_pocket_size: pocketSize,
    pole_pocket_cost_cents: pocketCostCents,
    pole_pocket_pricing_mode: 'per_item',
    line_total_cents: baseCents + ropeCostCents + pocketCostCents,
  };
}

function validateYardSignDesigns(item, quantity, index) {
  const designs = item.yard_sign_designs;
  if (designs == null) {
    if (item.design_service_enabled === true) return { count: 0, designs: null };
    fail('YARD_SIGN_DESIGNS_REQUIRED', 'At least one yard-sign design is required.', { index });
  }
  if (!Array.isArray(designs) || designs.length < 1 || designs.length > 10) {
    fail('YARD_SIGN_DESIGNS_INVALID', 'Yard signs require between 1 and 10 designs.', { index });
  }
  const designTotal = designs.reduce((sum, design, designIndex) => (
    sum + number(design?.quantity, `items[${index}].yard_sign_designs[${designIndex}].quantity`, {
      min: 1,
      max: 90,
      integer: true,
    })
  ), 0);
  if (designTotal !== quantity) {
    fail('YARD_SIGN_DESIGN_QUANTITY_MISMATCH', 'Yard-sign design quantities must equal the ordered quantity.', {
      index,
      designTotal,
      quantity,
    });
  }
  const submittedCount = Number(item.yard_sign_design_count ?? designs.length);
  if (!Number.isInteger(submittedCount) || submittedCount !== designs.length) {
    fail('YARD_SIGN_DESIGN_COUNT_MISMATCH', 'Yard-sign design count does not match the supplied designs.', { index });
  }
  return { count: designs.length, designs };
}

function normalizeYardSign(item, index) {
  const width = number(item.width_in, `items[${index}].width_in`, { min: 24, max: 24 });
  const height = number(item.height_in, `items[${index}].height_in`, { min: 18, max: 18 });
  const quantity = number(item.quantity, `items[${index}].quantity`, { min: 10, max: 90, integer: true });
  if (quantity % 10 !== 0) {
    fail('YARD_SIGN_QUANTITY_INVALID', 'Yard signs must be ordered in increments of 10.', { index, quantity });
  }
  if (clean(item.material || 'corrugated').toLowerCase() !== 'corrugated') {
    fail('YARD_SIGN_MATERIAL_INVALID', 'Yard signs are available only in corrugated plastic.', { index });
  }
  const sidedness = clean(item.yard_sign_sidedness || 'single').toLowerCase();
  if (!['single', 'double'].includes(sidedness)) {
    fail('YARD_SIGN_SIDEDNESS_INVALID', 'Choose single- or double-sided yard signs.', { index });
  }
  const designInfo = validateYardSignDesigns(item, quantity, index);
  const stakesEnabled = item.yard_sign_step_stakes_enabled === true
    || hasTruthyOption(item.yard_sign_step_stakes_enabled);
  const stakesQty = stakesEnabled
    ? number(item.yard_sign_step_stakes_qty, `items[${index}].yard_sign_step_stakes_qty`, {
      min: 1,
      max: quantity,
      integer: true,
    })
    : 0;
  const unitPriceCents = sidedness === 'double' ? 1400 : 1200;
  const signsSubtotalCents = unitPriceCents * quantity;
  const stakesSubtotalCents = stakesQty * 150;

  return {
    ...item,
    product_type: 'yard_sign',
    width_in: width,
    height_in: height,
    quantity,
    material: 'corrugated',
    grommets: 'none',
    rounded_corners: null,
    rope_feet: 0,
    rope_placement: null,
    rope_cost_cents: 0,
    pole_pockets: 'none',
    pole_pocket_position: 'none',
    pole_pocket_cost_cents: 0,
    unit_price_cents: unitPriceCents,
    yard_sign_sidedness: sidedness,
    yard_sign_step_stakes_enabled: stakesEnabled,
    yard_sign_step_stakes_qty: stakesQty,
    yard_sign_design_count: designInfo.count,
    yard_sign_designs: designInfo.designs,
    yard_sign_signs_subtotal_cents: signsSubtotalCents,
    yard_sign_stakes_subtotal_cents: stakesSubtotalCents,
    line_total_cents: signsSubtotalCents + stakesSubtotalCents,
  };
}

function normalizeCarMagnet(item, index) {
  const width = number(item.width_in, `items[${index}].width_in`, { min: 1, max: 600 });
  const height = number(item.height_in, `items[${index}].height_in`, { min: 1, max: 600 });
  const sizeKey = `${width}x${height}`;
  const unitPriceCents = MAGNET_PRICES.get(sizeKey);
  if (!unitPriceCents) {
    fail('CAR_MAGNET_SIZE_INVALID', 'This car-magnet size is not available.', { index, width, height });
  }
  const quantity = number(item.quantity ?? 1, `items[${index}].quantity`, { min: 1, max: MAX_QUANTITY, integer: true });
  if (clean(item.material || 'magnetic').toLowerCase() !== 'magnetic') {
    fail('CAR_MAGNET_MATERIAL_INVALID', 'Car magnets require premium magnetic material.', { index });
  }
  const roundedCorners = clean(item.rounded_corners || 'none').toLowerCase();
  if (!MAGNET_CORNERS.has(roundedCorners)) {
    fail('CAR_MAGNET_CORNERS_INVALID', 'This rounded-corner option is not available.', { index });
  }

  return {
    ...item,
    product_type: 'car_magnet',
    width_in: width,
    height_in: height,
    quantity,
    material: 'magnetic',
    grommets: 'none',
    rounded_corners: roundedCorners,
    rope_feet: 0,
    rope_placement: null,
    rope_cost_cents: 0,
    pole_pockets: 'none',
    pole_pocket_position: 'none',
    pole_pocket_cost_cents: 0,
    unit_price_cents: unitPriceCents,
    line_total_cents: unitPriceCents * quantity,
  };
}

function repriceStripeCart(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > PRODUCT_LIMIT) {
    fail('CART_ITEMS_INVALID', 'The cart must contain between 1 and 50 items.');
  }

  return rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      fail('CART_ITEM_INVALID', `Cart item ${index + 1} is invalid.`, { index });
    }
    const productType = clean(rawItem.product_type || 'banner').toLowerCase();
    if (productType === 'banner') return normalizeBanner(rawItem, index);
    if (productType === 'yard_sign') return normalizeYardSign(rawItem, index);
    if (productType === 'car_magnet') return normalizeCarMagnet(rawItem, index);
    fail('PRODUCT_TYPE_UNSUPPORTED', 'This product cannot be purchased through checkout.', { index, productType });
  });
}

module.exports = {
  BANNER_MATERIAL_CENTS_PER_SQ_FT,
  MAGNET_PRICES,
  StripePricingError,
  repriceStripeCart,
};
