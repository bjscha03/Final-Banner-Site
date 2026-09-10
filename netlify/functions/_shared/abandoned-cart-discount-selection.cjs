'use strict';

const { computeTotals, getFeatureFlags } = require('./checkoutTotals.cjs');
const { validateDiscountForCheckout } = require('./discount-validation.cjs');
const { repriceStripeCart } = require('./stripe-server-pricing.cjs');

const SAVED_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,79}$/;

function parsedCheckoutState(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function savedDiscountCodeFromCheckoutState(value) {
  const state = parsedCheckoutState(value);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const code = typeof state.discountCode === 'string'
    ? state.discountCode.trim().toUpperCase()
    : '';
  return SAVED_CODE_PATTERN.test(code) ? code : null;
}

function normalizedEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email && email.length <= 320 ? email : null;
}

async function newCustomerCodeStillEligible(sql, { code, email, userId }) {
  if (code !== 'NEW20') return true;
  const normalized = normalizedEmail(email);
  if (!userId && !normalized) return false;
  const rows = await sql`
    SELECT order_row.id
      FROM orders AS order_row
     WHERE COALESCE(order_row.is_test_order, FALSE) = FALSE
       AND (
         order_row.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
         OR NULLIF(BTRIM(to_jsonb(order_row)->>'paypal_capture_id'), '') IS NOT NULL
         OR LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_reconciliation_status', ''))) = 'complete'
       )
       AND (
         (${userId || null}::uuid IS NOT NULL AND order_row.user_id = ${userId || null}::uuid)
         OR (${normalized}::text IS NOT NULL AND LOWER(BTRIM(order_row.email)) = ${normalized})
       )
     LIMIT 1
  `;
  return rows.length === 0;
}

async function validatedCandidate({
  sql,
  code,
  email,
  userId,
  cartId,
  validateDiscount = validateDiscountForCheckout,
}) {
  if (!code) return null;
  try {
    if (!await newCustomerCodeStillEligible(sql, { code, email, userId })) return null;
    const result = await validateDiscount({
      sql,
      code,
      email: normalizedEmail(email),
      userId: userId || null,
      recoveryCartId: cartId,
      requireRecoveryEmailMatch: true,
      requireRecoveryCartMatch: true,
    });
    return result?.valid === true && result.discount ? result.discount : null;
  } catch (error) {
    // Saved browser state is never checkout authority. If validation is not
    // available, omit that candidate and let checkout continue safely.
    console.warn('[abandoned-cart-discount-selection] saved discount validation deferred', {
      code: error?.code || null,
    });
    return null;
  }
}

function totalsOptions(flags = getFeatureFlags()) {
  return {
    freeShipping: flags.freeShipping,
    minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
  };
}

function candidateTotals(items, discount, {
  reprice = repriceStripeCart,
  compute = computeTotals,
  flags,
} = {}) {
  const canonicalItems = reprice(items);
  return {
    canonicalItems,
    totals: compute(canonicalItems, 0.06, totalsOptions(flags), discount),
  };
}

async function selectWinningRecoveryDiscount({
  sql,
  checkoutState,
  recoveryCode = null,
  items,
  cartId,
  email = null,
  userId = null,
  validateDiscount = validateDiscountForCheckout,
  reprice = repriceStripeCart,
  compute = computeTotals,
  flags,
}) {
  const savedCode = savedDiscountCodeFromCheckoutState(checkoutState);
  if (!savedCode || savedCode === recoveryCode) {
    return { code: recoveryCode || savedCode || null, discount: null, source: recoveryCode ? 'recovery' : 'none' };
  }

  const savedDiscount = await validatedCandidate({
    sql, code: savedCode, email, userId, cartId, validateDiscount,
  });
  if (!savedDiscount) {
    return { code: recoveryCode || null, discount: null, source: recoveryCode ? 'recovery' : 'none' };
  }
  if (!recoveryCode) {
    return { code: savedDiscount.code, discount: savedDiscount, source: 'saved' };
  }

  const recoveryDiscount = await validatedCandidate({
    sql, code: recoveryCode, email, userId, cartId, validateDiscount,
  });
  if (!recoveryDiscount) {
    return { code: savedDiscount.code, discount: savedDiscount, source: 'saved' };
  }

  try {
    const saved = candidateTotals(items, savedDiscount, { reprice, compute, flags });
    const recovery = candidateTotals(items, recoveryDiscount, { reprice, compute, flags });
    if (saved.totals.total_cents <= recovery.totals.total_cents) {
      return {
        code: savedDiscount.code,
        discount: savedDiscount,
        source: 'saved',
        canonicalItems: saved.canonicalItems,
        totals: saved.totals,
      };
    }
    return {
      code: recoveryDiscount.code,
      discount: recoveryDiscount,
      source: 'recovery',
      canonicalItems: recovery.canonicalItems,
      totals: recovery.totals,
    };
  } catch {
    // A malformed historical snapshot must not be allowed to promote a saved
    // browser code. The sent recovery offer remains independently validated at
    // checkout and is the only safe fallback.
    return { code: recoveryCode, discount: recoveryDiscount, source: 'recovery' };
  }
}

module.exports = {
  candidateTotals,
  newCustomerCodeStillEligible,
  savedDiscountCodeFromCheckoutState,
  selectWinningRecoveryDiscount,
  validatedCandidate,
};
