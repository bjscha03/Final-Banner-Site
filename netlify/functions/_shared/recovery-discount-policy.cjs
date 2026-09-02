'use strict';

const LARGE_BANNER_RECOVERY_CAMPAIGN = 'abandoned_cart_large_banner_25';
const LARGE_BANNER_RECOVERY_SCOPE = 'recovery_qualifying_banner_lines';
const LARGE_BANNER_RECOVERY_PERCENTAGE = 25;
const AUTOMATIC_LARGE_BANNER_PROMOTION_ID = 'LARGE_BANNER_25';
const AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL = 'Large Banner 25% Off';
const AUTOMATIC_LARGE_BANNER_CAMPAIGN = AUTOMATIC_LARGE_BANNER_PROMOTION_ID;
const AUTOMATIC_LARGE_BANNER_SCOPE = 'qualifying_large_banner_lines';
const AUTOMATIC_LARGE_BANNER_PERCENTAGE = 25;
const SEPTEMBER_LARGE_BANNER_CODE = 'BIG25';
const SEPTEMBER_LARGE_BANNER_CAMPAIGN = 'september_large_banner_2026';
const SEPTEMBER_LARGE_BANNER_SCOPE = AUTOMATIC_LARGE_BANNER_SCOPE;
const SEPTEMBER_LARGE_BANNER_PERCENTAGE = 25;
// The legacy BIG25 promotion was valid for every local calendar day from
// September 1 through September 8 in the business's Eastern time zone (EDT in
// 2026). The automatic LARGE_BANNER_25 pricing rule has no code window.
const SEPTEMBER_LARGE_BANNER_START = '2026-09-01T04:00:00.000Z';
const SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE = '2026-09-09T04:00:00.000Z';
const LARGE_BANNER_LONG_SIDE_INCHES = 72;
const LARGE_BANNER_SHORT_SIDE_INCHES = 36;
const MAX_ELIGIBLE_ITEM_IDS = 50;
const MAX_ITEM_ID_LENGTH = 160;

function normalizeEligibleCartItemIds(value) {
  let input = value;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_ELIGIBLE_ITEM_IDS) return [];
  const ids = [];
  const seen = new Set();
  for (const candidate of input) {
    if (typeof candidate !== 'string') return [];
    const id = candidate.trim();
    if (!id || id.length > MAX_ITEM_ID_LENGTH) return [];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isQualifyingLargeBannerLine(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (String(item.product_type || '').trim().toLowerCase() !== 'banner') return false;
  const width = Number(item.width_in);
  const height = Number(item.height_in);
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0
    && Math.max(width, height) >= LARGE_BANNER_LONG_SIDE_INCHES
    && Math.min(width, height) >= LARGE_BANNER_SHORT_SIDE_INCHES;
}

function qualifyingLargeBannerLineIds(items) {
  if (!Array.isArray(items)) return [];
  return normalizeEligibleCartItemIds(items
    .filter(isQualifyingLargeBannerLine)
    .map((item) => item.id));
}

function qualifyingLargeBannerSubtotalCents(items, eligibleCartItemIds) {
  const eligibleIds = normalizeEligibleCartItemIds(eligibleCartItemIds);
  if (!Array.isArray(items) || !eligibleIds.length) return 0;
  const allowed = new Set(eligibleIds);
  return items.reduce((sum, item) => {
    if (!allowed.has(String(item?.id || '')) || !isQualifyingLargeBannerLine(item)) return sum;
    const lineTotalCents = Number(item.line_total_cents);
    return Number.isSafeInteger(lineTotalCents) && lineTotalCents >= 0
      ? sum + lineTotalCents
      : sum;
  }, 0);
}

function allQualifyingLargeBannerSubtotalCents(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    if (!isQualifyingLargeBannerLine(item)) return sum;
    const lineTotalCents = Number(item.line_total_cents);
    return Number.isSafeInteger(lineTotalCents) && lineTotalCents >= 0
      ? sum + lineTotalCents
      : sum;
  }, 0);
}

function isLargeBannerRecoveryDiscount(discount) {
  return Boolean(discount)
    && discount.campaign === LARGE_BANNER_RECOVERY_CAMPAIGN
    && discount.discountScope === LARGE_BANNER_RECOVERY_SCOPE;
}

function validateLargeBannerRecoveryMetadata(discount) {
  if (!isLargeBannerRecoveryDiscount(discount)) return { valid: false, error: 'not_large_banner_recovery' };
  if (Number(discount.discountPercentage) !== LARGE_BANNER_RECOVERY_PERCENTAGE) {
    return { valid: false, error: 'invalid_percentage' };
  }
  if (!discount.recoveryCartId) return { valid: false, error: 'missing_recovery_cart' };
  const eligibleCartItemIds = normalizeEligibleCartItemIds(discount.eligibleCartItemIds);
  if (!eligibleCartItemIds.length) return { valid: false, error: 'missing_eligible_items' };
  const maxDiscountAmountCents = positiveInteger(discount.maxDiscountAmountCents);
  if (!maxDiscountAmountCents) return { valid: false, error: 'invalid_discount_cap' };
  if (!discount.activatedAt || !Number.isFinite(new Date(discount.activatedAt).getTime())) {
    return { valid: false, error: 'offer_not_activated' };
  }
  if (new Date(discount.activatedAt).getTime() > Date.now()) {
    return { valid: false, error: 'offer_not_activated' };
  }
  const activatedAtMs = new Date(discount.activatedAt).getTime();
  const expiresAtMs = new Date(discount.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)
      || expiresAtMs <= activatedAtMs
      || expiresAtMs - activatedAtMs > 60 * 60 * 1000) {
    return { valid: false, error: 'invalid_offer_window' };
  }
  if (expiresAtMs <= Date.now()) return { valid: false, error: 'offer_expired' };
  return { valid: true, eligibleCartItemIds, maxDiscountAmountCents };
}

function isAutomaticLargeBannerDiscount(discount) {
  return Boolean(discount)
    && String(discount.code || '').trim().toUpperCase() === AUTOMATIC_LARGE_BANNER_PROMOTION_ID
    && discount.campaign === AUTOMATIC_LARGE_BANNER_CAMPAIGN
    && discount.discountScope === AUTOMATIC_LARGE_BANNER_SCOPE
    && Number(discount.discountPercentage) === AUTOMATIC_LARGE_BANNER_PERCENTAGE;
}

function buildAutomaticLargeBannerDiscount() {
  return {
    id: AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
    code: AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
    discountPercentage: AUTOMATIC_LARGE_BANNER_PERCENTAGE,
    discountAmountCents: null,
    expiresAt: null,
    source: 'automatic_large_banner_pricing',
    campaign: AUTOMATIC_LARGE_BANNER_CAMPAIGN,
    discountScope: AUTOMATIC_LARGE_BANNER_SCOPE,
    displayLabel: AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL,
  };
}

function isSeptemberLargeBannerDiscount(discount) {
  return Boolean(discount)
    && String(discount.code || '').trim().toUpperCase() === SEPTEMBER_LARGE_BANNER_CODE
    && discount.campaign === SEPTEMBER_LARGE_BANNER_CAMPAIGN
    && discount.discountScope === SEPTEMBER_LARGE_BANNER_SCOPE
    && Number(discount.discountPercentage) === SEPTEMBER_LARGE_BANNER_PERCENTAGE;
}

function septemberLargeBannerWindow(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const start = new Date(SEPTEMBER_LARGE_BANNER_START).getTime();
  const endExclusive = new Date(SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE).getTime();
  if (!Number.isFinite(timestamp)) return { active: false, reason: 'invalid_time' };
  if (timestamp < start) return { active: false, reason: 'not_started' };
  if (timestamp >= endExclusive) return { active: false, reason: 'expired' };
  return { active: true, reason: null };
}

function buildSeptemberLargeBannerDiscount(now = new Date()) {
  const window = septemberLargeBannerWindow(now);
  if (!window.active) return { valid: false, reason: window.reason, discount: null };
  return {
    valid: true,
    reason: null,
    discount: {
      id: 'SEPTEMBER_BIG25_PROMO',
      code: SEPTEMBER_LARGE_BANNER_CODE,
      discountPercentage: SEPTEMBER_LARGE_BANNER_PERCENTAGE,
      discountAmountCents: null,
      validFrom: SEPTEMBER_LARGE_BANNER_START,
      expiresAt: SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE,
      source: 'seasonal_promotion',
      campaign: SEPTEMBER_LARGE_BANNER_CAMPAIGN,
      discountScope: SEPTEMBER_LARGE_BANNER_SCOPE,
    },
  };
}

function promoSubtotalForItems(items, fullSubtotalCents, promoDiscount) {
  if (!promoDiscount || ![LARGE_BANNER_RECOVERY_SCOPE, AUTOMATIC_LARGE_BANNER_SCOPE]
    .includes(promoDiscount.discountScope)) {
    return Math.max(0, Number(fullSubtotalCents) || 0);
  }
  if (promoDiscount.discountScope === AUTOMATIC_LARGE_BANNER_SCOPE) {
    return isAutomaticLargeBannerDiscount(promoDiscount)
      || isSeptemberLargeBannerDiscount(promoDiscount)
      ? allQualifyingLargeBannerSubtotalCents(items)
      : 0;
  }
  if (!isLargeBannerRecoveryDiscount(promoDiscount)) return 0;
  const metadata = validateLargeBannerRecoveryMetadata(promoDiscount);
  if (!metadata.valid) return 0;
  return qualifyingLargeBannerSubtotalCents(items, metadata.eligibleCartItemIds);
}

function capPromoDiscountAmount(amountCents, promoDiscount) {
  const amount = Math.max(0, Number(amountCents) || 0);
  if (!promoDiscount || promoDiscount.discountScope !== LARGE_BANNER_RECOVERY_SCOPE) return amount;
  const cap = positiveInteger(promoDiscount.maxDiscountAmountCents);
  return cap ? Math.min(amount, cap) : 0;
}

module.exports = {
  AUTOMATIC_LARGE_BANNER_CAMPAIGN,
  AUTOMATIC_LARGE_BANNER_PERCENTAGE,
  AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
  AUTOMATIC_LARGE_BANNER_PROMOTION_LABEL,
  AUTOMATIC_LARGE_BANNER_SCOPE,
  LARGE_BANNER_LONG_SIDE_INCHES,
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_PERCENTAGE,
  LARGE_BANNER_RECOVERY_SCOPE,
  LARGE_BANNER_SHORT_SIDE_INCHES,
  SEPTEMBER_LARGE_BANNER_CAMPAIGN,
  SEPTEMBER_LARGE_BANNER_CODE,
  SEPTEMBER_LARGE_BANNER_END_EXCLUSIVE,
  SEPTEMBER_LARGE_BANNER_PERCENTAGE,
  SEPTEMBER_LARGE_BANNER_SCOPE,
  SEPTEMBER_LARGE_BANNER_START,
  allQualifyingLargeBannerSubtotalCents,
  buildAutomaticLargeBannerDiscount,
  buildSeptemberLargeBannerDiscount,
  capPromoDiscountAmount,
  isAutomaticLargeBannerDiscount,
  isLargeBannerRecoveryDiscount,
  isQualifyingLargeBannerLine,
  isSeptemberLargeBannerDiscount,
  normalizeEligibleCartItemIds,
  positiveInteger,
  promoSubtotalForItems,
  qualifyingLargeBannerLineIds,
  qualifyingLargeBannerSubtotalCents,
  septemberLargeBannerWindow,
  validateLargeBannerRecoveryMetadata,
};
