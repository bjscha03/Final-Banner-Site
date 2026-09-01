'use strict';

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function validResult(discount) {
  return { valid: true, discount };
}

function invalidResult(error) {
  return { valid: false, error };
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
    // Deploying application code before the additive migration must not break
    // existing promotions. Undefined-table means the migration is pending.
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
  requireRecoveryEmailMatch = false,
}) {
  const normalizedCode = normalizeCode(code);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (!normalizedCode) return invalidResult('Discount code is required');

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
    return validResult({
      id: 'NEW20_PROMO',
      code: 'NEW20',
      discountPercentage: 20,
      discountAmountCents: null,
      expiresAt: '2099-12-31T23:59:59Z',
      source: 'new_customer',
    });
  }

  if (normalizedCode === 'CUSTOM60') return invalidResult('Invalid discount code');

  const tradeShowDiscount = await findTradeShowDiscount(sql, normalizedCode);
  if (tradeShowDiscount) return validResult(tradeShowDiscount);

  const rows = await sql`
    SELECT id, code, discount_percentage, discount_amount_cents, used, expires_at,
           single_use, used_by_user_id, used_by_email,
           max_uses_per_customer, max_total_uses, email, cart_id, order_id,
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
  if (requireRecoveryEmailMatch && recoveryOffer
      && (!boundEmail || !normalizedEmail || boundEmail !== normalizedEmail)) {
    return invalidResult('This cart-recovery discount was issued to a different email address');
  }
  // Email binding applies even to the opaque checkout that already owns a
  // reservation. Otherwise an account switch could retain another recipient's
  // recovery offer merely by retrying the same checkout key.
  if (boundEmail && normalizedEmail && boundEmail !== normalizedEmail) {
    return invalidResult('This discount code was issued to a different email address');
  }
  // A provider reservation is taken immediately before confirmation. The
  // same opaque checkout key must be able to retry that exact pending order
  // (including after a decline or recovery transition) without presenting the
  // code as stolen. Email binding above still applies, and no other checkout
  // receives this exception.
  if (discount.owned_by_checkout === true || discount.owned_by_checkout === 'true') {
    return validResult({
      id: discount.id,
      code: String(discount.code).toUpperCase(),
      discountPercentage: Number(discount.discount_percentage || 0) || null,
      discountAmountCents: Number(discount.discount_amount_cents || 0) || null,
      expiresAt: discount.expires_at,
      source: 'discount_codes',
      recoveryOffer,
    });
  }
  if (recoveryOffer && !['active', 'abandoned'].includes(String(discount.recovery_cart_status || ''))) {
    return invalidResult('This cart-recovery discount is no longer active');
  }
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
    return invalidResult('This discount code has expired');
  }
  if (discount.used) return invalidResult('This code has already been used');

  const usedEmails = Array.isArray(discount.used_by_email) ? discount.used_by_email.map((value) => String(value).toLowerCase()) : [];
  const perCustomerLimit = discount.max_uses_per_customer == null ? null : Number(discount.max_uses_per_customer);
  if (normalizedEmail && perCustomerLimit !== null) {
    const customerUses = usedEmails.filter((value) => value === normalizedEmail).length;
    if (customerUses >= perCustomerLimit) return invalidResult('This code has already been used');
  }

  if (userId && discount.used_by_user_id) {
    const usedUserIds = Array.isArray(discount.used_by_user_id) ? discount.used_by_user_id : [discount.used_by_user_id];
    if (usedUserIds.map(String).includes(String(userId))) return invalidResult('This code has already been used');
  }

  if (discount.max_total_uses != null && usedEmails.length >= Number(discount.max_total_uses)) {
    return invalidResult(Number(discount.max_total_uses) === 1
      ? 'This code has already been used'
      : 'This discount code has reached its maximum number of uses');
  }

  return validResult({
    id: discount.id,
    code: String(discount.code).toUpperCase(),
    discountPercentage: Number(discount.discount_percentage || 0) || null,
    discountAmountCents: Number(discount.discount_amount_cents || 0) || null,
    expiresAt: discount.expires_at,
    source: 'discount_codes',
    recoveryOffer,
  });
}

module.exports = { normalizeCode, validateDiscountForCheckout };
