'use strict';

// Shared server-side checkout total calculator.
//
// Every payment provider and order-creation path must use this module so the
// displayed, charged and persisted totals stay identical. Quantity discounts,
// the automatic large-banner promotion and manual promotions are evaluated as
// independent candidates; only the single largest candidate is applied.

const {
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
  SEPTEMBER_LARGE_BANNER_CAMPAIGN,
  SEPTEMBER_LARGE_BANNER_SCOPE,
  allQualifyingLargeBannerSubtotalCents,
  capPromoDiscountAmount,
  promoSubtotalForItems,
} = require('./recovery-discount-policy.cjs');

const LARGE_BANNER_PROMO_ID = 'LARGE_BANNER_25';
const LARGE_BANNER_PROMO_LABEL = 'Large Banner 25% Off';
const LARGE_BANNER_PROMO_PERCENTAGE = 25;
const LARGE_BANNER_PROMO_RATE = LARGE_BANNER_PROMO_PERCENTAGE / 100;
const LARGE_BANNER_CONFLICT_MESSAGE =
  'This banner already includes our 25% large-banner discount. Additional percentage discounts cannot be combined.';

const getFeatureFlags = () => ({
  freeShipping: process.env.FEATURE_FREE_SHIPPING === '1',
  minOrderFloor: process.env.FEATURE_MIN_ORDER_FLOOR === '1',
  minOrderCents: parseInt(process.env.MIN_ORDER_CENTS || '2000', 10),
  shippingMethodLabel: process.env.SHIPPING_METHOD_LABEL || 'Free Next-Day Air',
});

// Quantity discount tiers - "Buy More, Save More"
// Must match src/lib/quantity-discount.ts exactly.
const QUANTITY_DISCOUNT_TIERS = [
  { minQuantity: 1, discountRate: 0.00 },
  { minQuantity: 2, discountRate: 0.05 },
  { minQuantity: 3, discountRate: 0.07 },
  { minQuantity: 4, discountRate: 0.10 },
  { minQuantity: 5, discountRate: 0.13 },
];

const getQuantityDiscountRate = (quantity) => {
  let rate = 0;
  for (const tier of QUANTITY_DISCOUNT_TIERS) {
    if (quantity >= tier.minQuantity) rate = tier.discountRate;
  }
  return rate;
};

const safeMoney = (value) => {
  const numeric = Number(value || 0);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
};

const isLegacyLargeBannerPercentagePromotion = (promoDiscount) => {
  if (!promoDiscount || Number(promoDiscount.discountPercentage) !== LARGE_BANNER_PROMO_PERCENTAGE) {
    return false;
  }
  const code = String(promoDiscount.code || '').trim().toUpperCase();
  return code === 'BIG25'
    || promoDiscount.campaign === LARGE_BANNER_RECOVERY_CAMPAIGN
    || promoDiscount.campaign === SEPTEMBER_LARGE_BANNER_CAMPAIGN
    || promoDiscount.discountScope === LARGE_BANNER_RECOVERY_SCOPE
    || promoDiscount.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE;
};

const buildManualPromoCandidate = (promoDiscount, promoBaseCents) => {
  if (!promoDiscount || isLegacyLargeBannerPercentagePromotion(promoDiscount)) return null;
  const safeBase = safeMoney(promoBaseCents);
  let amountCents = 0;
  let rate = 0;
  let isPercentage = false;

  if (Number(promoDiscount.discountPercentage) > 0) {
    rate = Number(promoDiscount.discountPercentage) / 100;
    amountCents = Math.round(safeBase * rate);
    isPercentage = true;
  } else if (Number(promoDiscount.discountAmountCents) > 0) {
    amountCents = Math.min(Math.round(Number(promoDiscount.discountAmountCents)), safeBase);
    rate = safeBase > 0 ? amountCents / safeBase : 0;
  }
  amountCents = capPromoDiscountAmount(amountCents, promoDiscount);
  if (amountCents <= 0) return null;

  const code = String(promoDiscount.code || '').trim().toUpperCase() || 'PROMO_CODE';
  const descriptor = isPercentage
    ? `${Math.round(rate * 100)}% off`
    : `$${(amountCents / 100).toFixed(2)} off`;
  return {
    source: 'promo_code',
    type: 'promo',
    id: code,
    label: `${code} (${descriptor})`,
    amountCents,
    rate,
    priority: 2,
    isPercentage,
  };
};

const pickWinner = (candidates) => candidates
  .filter((candidate) => candidate && candidate.amountCents > 0)
  .sort((a, b) => (
    b.amountCents - a.amountCents
    || b.priority - a.priority
    || a.id.localeCompare(b.id)
  ))[0] || null;

const resolveBestDiscount = (
  subtotalCents,
  quantity,
  promoDiscount = null,
  quantitySubtotalCents = null,
  promoSubtotalCents = null,
  automaticPromotionSubtotalCents = 0,
) => {
  const safeSubtotal = safeMoney(subtotalCents);
  const quantityBaseCents = quantitySubtotalCents == null
    ? safeSubtotal
    : safeMoney(quantitySubtotalCents);
  const manualPromoBaseCents = promoSubtotalCents == null
    ? safeSubtotal
    : safeMoney(promoSubtotalCents);

  const quantityDiscountRate = getQuantityDiscountRate(quantity);
  const quantityDiscountAmountCents = Math.round(quantityBaseCents * quantityDiscountRate);
  const quantityCandidate = quantityDiscountAmountCents > 0 ? {
    source: 'quantity',
    type: 'quantity',
    id: 'QUANTITY_DISCOUNT',
    label: `Quantity discount (${Math.round(quantityDiscountRate * 100)}% off)`,
    amountCents: quantityDiscountAmountCents,
    rate: quantityDiscountRate,
    priority: 1,
    isPercentage: true,
  } : null;

  const automaticBaseCents = safeMoney(automaticPromotionSubtotalCents);
  const automaticPromotionAmountCents = Math.round(automaticBaseCents * LARGE_BANNER_PROMO_RATE);
  const automaticCandidate = automaticPromotionAmountCents > 0 ? {
    source: 'automatic',
    type: 'promo',
    id: LARGE_BANNER_PROMO_ID,
    label: LARGE_BANNER_PROMO_LABEL,
    amountCents: automaticPromotionAmountCents,
    rate: LARGE_BANNER_PROMO_RATE,
    priority: 3,
    isPercentage: true,
  } : null;

  const manualCandidate = buildManualPromoCandidate(promoDiscount, manualPromoBaseCents);
  const winner = pickWinner([quantityCandidate, automaticCandidate, manualCandidate]);
  const positiveCandidateCount = [quantityCandidate, automaticCandidate, manualCandidate]
    .filter((candidate) => candidate && candidate.amountCents > 0).length;

  let helperMessage = null;
  if (positiveCandidateCount > 1 && winner) {
    if (winner.source === 'automatic' && manualCandidate?.isPercentage) {
      helperMessage = LARGE_BANNER_CONFLICT_MESSAGE;
    } else if (winner.source === 'automatic') {
      helperMessage = 'Only one discount can apply — we used the 25% large-banner discount because it saves you more.';
    } else {
      helperMessage = "Discounts can't be combined — we applied the best one.";
    }
  }

  return {
    appliedDiscountType: winner?.type || 'none',
    appliedDiscountAmountCents: winner?.amountCents || 0,
    appliedDiscountRate: winner?.rate || 0,
    appliedDiscountLabel: winner?.label || '',
    appliedPromotionSource: winner?.source || 'none',
    appliedPromotionId: winner?.id || null,
    helperMessage,

    quantityDiscountCents: winner?.source === 'quantity' ? winner.amountCents : 0,
    quantityDiscountCandidateCents: quantityDiscountAmountCents,
    promoDiscountCents: winner?.type === 'promo' ? winner.amountCents : 0,
    manualPromoDiscountCents: manualCandidate?.amountCents || 0,
    automaticPromotionEligible: automaticBaseCents > 0,
    automaticPromotionCents: automaticPromotionAmountCents,
    automaticPromotionRate: LARGE_BANNER_PROMO_RATE,
    automaticPromotionId: LARGE_BANNER_PROMO_ID,
    automaticPromotionLabel: LARGE_BANNER_PROMO_LABEL,
  };
};

const computeTotals = (items, taxRate, opts, promoDiscount = null) => {
  const safeItems = Array.isArray(items) ? items : [];
  const raw = safeItems.reduce((sum, item) => sum + safeMoney(item.line_total_cents), 0);
  const adjusted = Math.max(raw, safeMoney(opts?.minFloorCents));
  const minAdj = Math.max(0, adjusted - raw);

  // Only true banner items count toward quantity-discount tiers. Yard signs
  // and car magnets keep their own pricing structures.
  const isBanner = (item) => String(item?.product_type || 'banner').trim().toLowerCase() === 'banner';
  const bannerItems = safeItems.filter(isBanner);
  const bannerQuantity = bannerItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const bannerSubtotalCents = bannerItems.reduce((sum, item) => sum + safeMoney(item.line_total_cents), 0);
  const totalQuantity = safeItems.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);

  const promoSubtotalCents = promoSubtotalForItems(safeItems, adjusted, promoDiscount);
  const automaticPromotionSubtotalCents = allQualifyingLargeBannerSubtotalCents(safeItems);
  const bestDiscount = resolveBestDiscount(
    adjusted,
    bannerQuantity,
    promoDiscount,
    bannerSubtotalCents,
    promoSubtotalCents,
    automaticPromotionSubtotalCents,
  );
  const subtotalAfterDiscount = Math.max(0, adjusted - bestDiscount.appliedDiscountAmountCents);

  const shipping_cents = 0; // Free US next-day air after production.
  const tax_cents = Math.round(subtotalAfterDiscount * taxRate);
  const total_cents = subtotalAfterDiscount + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    original_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    total_quantity: totalQuantity,

    applied_discount_type: bestDiscount.appliedDiscountType,
    applied_discount_cents: bestDiscount.appliedDiscountAmountCents,
    applied_discount_rate: bestDiscount.appliedDiscountRate,
    applied_discount_label: bestDiscount.appliedDiscountLabel,
    applied_promotion_source: bestDiscount.appliedPromotionSource,
    applied_promotion_id: bestDiscount.appliedPromotionId,
    discount_helper_message: bestDiscount.helperMessage,

    quantity_discount_rate: getQuantityDiscountRate(bannerQuantity),
    quantity_discount_cents: bestDiscount.quantityDiscountCents,
    quantity_discount_candidate_cents: bestDiscount.quantityDiscountCandidateCents,
    promo_discount_cents: bestDiscount.promoDiscountCents,
    manual_promo_discount_cents: bestDiscount.manualPromoDiscountCents,

    automatic_promotion_eligible: bestDiscount.automaticPromotionEligible,
    automatic_promotion_id: bestDiscount.automaticPromotionId,
    automatic_promotion_label: bestDiscount.automaticPromotionLabel,
    automatic_promotion_rate: bestDiscount.automaticPromotionRate,
    automatic_promotion_cents: bestDiscount.automaticPromotionCents,

    subtotal_after_discount_cents: subtotalAfterDiscount,
    shipping_cents,
    tax_cents,
    total_cents,
  };
};

module.exports = {
  LARGE_BANNER_CONFLICT_MESSAGE,
  LARGE_BANNER_PROMO_ID,
  LARGE_BANNER_PROMO_LABEL,
  LARGE_BANNER_PROMO_PERCENTAGE,
  LARGE_BANNER_PROMO_RATE,
  getFeatureFlags,
  getQuantityDiscountRate,
  resolveBestDiscount,
  computeTotals,
};
