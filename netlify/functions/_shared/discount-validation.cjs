'use strict';

const {
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
  SEPTEMBER_LARGE_BANNER_CODE,
  allQualifyingLargeBannerSubtotalCents,
  buildSeptemberLargeBannerDiscount,
  capPromoDiscountAmount,
  isQualifyingLargeBannerLine,
  normalizeEligibleCartItemIds,
  positiveInteger,
  promoSubtotalForItems,
  validateLargeBannerRecoveryMetadata,
} = require('./recovery-discount-policy.cjs');
const {
  LARGE_BANNER_CONFLICT_MESSAGE,
  LARGE_BANNER_PROMO_PERCENTAGE,
} = require('./checkoutTotals.cjs');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function validResult(discount) {
  return { valid: true, discount };
}

function invalidResult(error) {
  return { valid: false, error };
}

function normalizedCartId(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function storedDiscountFromRow(discount, recoveryOffer) {
  const campaign = String(discount.campaign || '').trim() || null;
  const discountScope = String(discount.discount_scope || 'order').trim() || 'order';
  const result = {
    id: discount.id,
    code: String(discount.code).toUpperCase(),
    discountPercentage: Number(discount.discount_percentage || 0) || null,
    discountAmountCents: Number(discount.discount_amount_cents || 0) || null,
    expiresAt: discount.expires_at,
    source: 'discount_codes',
    recoveryOffer,
    recoveryCartId: recoveryOffer ? normalizedCartId(discount.cart_id) : null,
    campaign,
    discountScope,
  };
  if (discountScope === LARGE_BANNER_RECOVERY_SCOPE || campaign === LARGE_BANNER_RECOVERY_CAMPAIGN) {
    result.eligibleCartItemIds = normalizeEligibleCartItemIds(discount.eligible_cart_item_ids);
    result.maxDiscountAmountCents = positiveInteger(discount.max_discount_amount_cents);
    result.activatedAt = discount.activated_at || null;
  }
  return result;
}

function safeLineTotalCents(item) {
  const cents = Number(item?.line_total_cents);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : 0;
}

/**
 * Validation-time guard for the customer-facing promo field. The payment path
 * independently performs the same best-discount comparison in checkoutTotals,
 * so this improves UX without becoming price authority.
 */
function resolveManualCodeAgainstAutomaticPromotion(discount, items) {
  if (!discount || !Array.isArray(items) || items.length === 0) return validResult(discount);

  const automaticBaseCents = allQualifyingLargeBannerSubtotalCents(items);
  const automaticDiscountCents = Math.round(automaticBaseCents * (LARGE_BANNER_PROMO_PERCENTAGE / 100));
  if (automaticDiscountCents <= 0) return validResult(discount);

  const fullSubtotalCents = items.reduce((sum, item) => sum + safeLineTotalCents(item), 0);
  const manualBaseCents = promoSubtotalForItems(items, fullSubtotalCents, discount);
  const percentage = Number(discount.discountPercentage || 0);
  const fixedAmountCents = Number(discount.discountAmountCents || 0);
  let manualDiscountCents = 0;
  if (percentage > 0) {
    manualDiscountCents = Math.round(manualBaseCents * (percentage / 100));
  } else if (fixedAmountCents > 0) {
    manualDiscountCents = Math.min(Math.round(fixedAmountCents), manualBaseCents);
  }
  manualDiscountCents = capPromoDiscountAmount(manualDiscountCents, discount);

  // The automatic promotion wins ties so a redundant 20/25% code can never
  // create a second percentage layer or a confusing "code applied" state.
  if (manualDiscountCents <= automaticDiscountCents) {
    return invalidResult(percentage > 0
      ? LARGE_BANNER_CONFLICT_MESSAGE
      : 'This banner already includes a larger automatic 25% discount. The discounts cannot be combined.');
  }

  return validResult(discount);
}

async function findTradeShowDiscount(sql, normalizedCode) {
  try {
    const rows = await sql`
      SELECT trade_show_slug, code, discount_percentage
      FROM trade_show_promo_codes
      WHERE UPPER(code) = ${normalizedCode}
        AND is_active = TRUE
      LIMIT 1
    `;
    if (!rows.length) return null;
    return {
      id: `TRADE_SHOW_${rows[0].trade_show_slug}`,
      code: String(rows[0].code).toUpperCase(),
      discountPercentage: Number(rows[0].discount_percentage),
      discountAmountCents: null,
      expiresAt: '2099-12-31T23:59:59Z',
      source: 'trade_show',
      tradeShowSlug: rows[0].trade_show_slug,
    };
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

async function validateDiscountForCheckout({
  sql,
  code,
  email = null,
  userId = null,
  checkoutKey = null,
  recoveryCartId = null,
  requireRecoveryEmailMatch = false,
  requireRecoveryCartMatch = false,
  items = null,
  now = new Date(),
}) {
  const normalizedCode = normalizeCode(code);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const normalizedRecoveryCartId = normalizedCartId(recoveryCartId);
  if (!normalizedCode) return invalidResult('Discount code is required');

  if (normalizedCode === SEPTEMBER_LARGE_BANNER_CODE) {
    if (Array.isArray(items) && items.some(isQualifyingLargeBannerLine)) {
      return invalidResult(LARGE_BANNER_CONFLICT_MESSAGE);
    }
    const promotion = buildSeptemberLargeBannerDiscount(now);
    if (!promotion.valid) {
      return invalidResult(promotion.reason === 'not_started'
        ? 'BIG25 begins September 1, 2026'
        : 'BIG25 expired after September 8, 2026');
    }
    return invalidResult("BIG25 requires at least one 6' × 3' or larger banner");
  }

  if (normalizedCode === 'NEW20') {
    if (userId) {
      const priorOrders = await sql`
        SELECT id FROM orders
        WHERE user_id = ${userId} AND status = 'paid'
        LIMIT 1
      `;
      if (priorOrders.length) {
        return invalidResult('NEW20 is valid for first-time customers only. You have a previous order on this account.');
      }
    }
    return resolveManualCodeAgainstAutomaticPromotion({
      id: 'NEW20_PROMO',
      code: 'NEW20',
      discountPercentage: 20,
      discountAmountCents: null,
      expiresAt: '2099-12-31T23:59:59Z',
      source: 'new_customer',
    }, items);
  }

  if (normalizedCode === 'CUSTOM60') return invalidResult('Invalid discount code');

  const tradeShowDiscount = await findTradeShowDiscount(sql, normalizedCode);
  if (tradeShowDiscount) return resolveManualCodeAgainstAutomaticPromotion(tradeShowDiscount, items);

  const rows = await sql`
    SELECT id, code, discount_percentage, discount_amount_cents, used, expires_at,
           single_use, used_by_user_id, used_by_email,
           max_uses_per_customer, max_total_uses, email, cart_id, order_id, campaign,
           COALESCE(to_jsonb(discount_codes)->>'discount_scope', 'order') AS discount_scope,
           to_jsonb(discount_codes)->'eligible_cart_item_ids' AS eligible_cart_item_ids,
           to_jsonb(discount_codes)->>'max_discount_amount_cents' AS max_discount_amount_cents,
           to_jsonb(discount_codes)->>'activated_at' AS activated_at,
           (
             SELECT recovery_status
               FROM abandoned_carts AS recovery_cart
              WHERE recovery_cart.id = discount_codes.cart_id
              LIMIT 1
           ) AS recovery_cart_status,
           EXISTS (
             SELECT 1
               FROM orders reserved_order
              WHERE reserved_order.id = discount_codes.order_id
                AND ${checkoutKey || null}::text IS NOT NULL
                AND reserved_order.checkout_idempotency_key = ${checkoutKey || null}
           ) AS owned_by_checkout
    FROM discount_codes
    WHERE UPPER(code) = ${normalizedCode}
    LIMIT 1
  `;
  if (!rows.length) return invalidResult('Invalid discount code');

  const discount = rows[0];
  const boundEmail = discount.email ? String(discount.email).trim().toLowerCase() : null;
  const recoveryOffer = Boolean(discount.cart_id);
  const discountRecoveryCartId = normalizedCartId(discount.cart_id);
  if (requireRecoveryEmailMatch && recoveryOffer
      && (!boundEmail || !normalizedEmail || boundEmail !== normalizedEmail)) {
    return invalidResult('This cart-recovery discount was issued to a different email address');
  }
  if (boundEmail && normalizedEmail && boundEmail !== normalizedEmail) {
    return invalidResult('This discount code was issued to a different email address');
  }
  if (recoveryOffer && normalizedRecoveryCartId && discountRecoveryCartId !== normalizedRecoveryCartId) {
    return invalidResult('This cart-recovery discount was issued for a different cart');
  }
  if (requireRecoveryCartMatch && recoveryOffer
      && (!normalizedRecoveryCartId || discountRecoveryCartId !== normalizedRecoveryCartId)) {
    return invalidResult('This cart-recovery discount was issued for a different cart');
  }

  const storedDiscount = storedDiscountFromRow(discount, recoveryOffer);
  if (storedDiscount.campaign === LARGE_BANNER_RECOVERY_CAMPAIGN) {
    if (!storedDiscount.expiresAt || new Date(storedDiscount.expiresAt).getTime() <= Date.now()) {
      return invalidResult('This discount code has expired');
    }
    const metadata = validateLargeBannerRecoveryMetadata(storedDiscount);
    if (!metadata.valid) {
      return invalidResult('This cart-recovery discount is not available');
    }
  }
  if (discount.owned_by_checkout === true || discount.owned_by_checkout === 'true') {
    return resolveManualCodeAgainstAutomaticPromotion(storedDiscount, items);
  }
  if (recoveryOffer && !['active', 'abandoned'].includes(String(discount.recovery_cart_status || ''))) {
    return invalidResult('This cart-recovery discount is no longer active');
  }
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
    return invalidResult('This discount code has expired');
  }
  if (discount.used) return invalidResult('This code has already been used');

  const usedEmails = Array.isArray(discount.used_by_email)
    ? discount.used_by_email.map((value) => String(value).toLowerCase())
    : [];
  const perCustomerLimit = discount.max_uses_per_customer == null
    ? null
    : Number(discount.max_uses_per_customer);
  if (normalizedEmail && perCustomerLimit !== null) {
    const customerUses = usedEmails.filter((value) => value === normalizedEmail).length;
    if (customerUses >= perCustomerLimit) return invalidResult('This code has already been used');
  }

  if (userId && discount.used_by_user_id) {
    const usedUserIds = Array.isArray(discount.used_by_user_id)
      ? discount.used_by_user_id
      : [discount.used_by_user_id];
    if (usedUserIds.map(String).includes(String(userId))) {
      return invalidResult('This code has already been used');
    }
  }

  if (discount.max_total_uses != null && usedEmails.length >= Number(discount.max_total_uses)) {
    return invalidResult(Number(discount.max_total_uses) === 1
      ? 'This code has already been used'
      : 'This discount code has reached its maximum number of uses');
  }

  return resolveManualCodeAgainstAutomaticPromotion(storedDiscount, items);
}

module.exports = {
  normalizeCode,
  normalizedCartId,
  resolveManualCodeAgainstAutomaticPromotion,
  storedDiscountFromRow,
  validateDiscountForCheckout,
};
