'use strict';

const {
  AUTOMATIC_LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_SCOPE,
  SEPTEMBER_LARGE_BANNER_CODE,
  SMALL_BANNER_DISCOUNT_CODE,
} = require('./recovery-discount-policy.cjs');

function normalizedCode(order) {
  return String(order?.discount_code || '').trim().toUpperCase();
}

function isNonStoredCampaignCode(code) {
  return code === SEPTEMBER_LARGE_BANNER_CODE
    || code === AUTOMATIC_LARGE_BANNER_PROMOTION_ID
    || code === SMALL_BANNER_DISCOUNT_CODE;
}

function isTestOrder(order) {
  return order?.is_test_order === true || order?.is_test_order === 'true';
}

function hasAppliedPromo(order) {
  return normalizedCode(order)
    && String(order?.applied_discount_type || '').trim().toLowerCase() === 'promo'
    && Number(order?.applied_discount_cents || 0) > 0;
}

function conflict(code, message, discountCode = null) {
  return {
    ok: false,
    code,
    message,
    details: {
      restartCheckout: true,
      safeToRetry: false,
      bindingState: 'restart_required',
      discountCode: String(discountCode || '').trim().toUpperCase() || null,
    },
  };
}

function customerReservationIdentities(order) {
  const email = String(order?.email || '').trim().toLowerCase();
  const userId = String(order?.user_id || '').trim();
  return [
    email ? `email:${email}` : null,
    userId ? `user:${userId.toLowerCase()}` : null,
  ].filter(Boolean).sort();
}

function customerReservationIdentity(order) {
  return customerReservationIdentities(order)[0] || null;
}

async function activeTradeShowCode(sql, code) {
  try {
    const rows = await sql`
      SELECT code
        FROM trade_show_promo_codes
       WHERE UPPER(code) = ${code}
         AND is_active = TRUE
       LIMIT 1
    `;
    return rows.length > 0;
  } catch (error) {
    if (String(error?.code || '') === '42P01') return false;
    throw error;
  }
}

async function claimNew20(sql, order) {
  const identities = customerReservationIdentities(order);
  if (!identities.length) {
    return conflict('NEW20_RESERVATION_CONFLICT', 'This discount could not be safely reserved.', 'NEW20');
  }

  // Acquire every identity used by the conflict predicate in a deterministic
  // order. A signed-in checkout and a guest checkout
  // sharing an email therefore serialize on the email lock, while two orders
  // for the same account but different email spellings serialize on the user
  // lock. Locking only one preferred identity would leave a split lock domain.
  //
  // An abandoned pending checkout does not own NEW20. The first transaction
  // that actually reaches payment and writes discount_reserved wins. We never
  // reclaim a reservation based on age because its provider capture may have
  // succeeded while database reconciliation was unavailable.
  // This must be two commands in one READ COMMITTED transaction. PostgreSQL's
  // snapshot is statement-scoped: putting the advisory-lock wait and owner
  // check in one statement would let a waiter retain a pre-lock snapshot and
  // miss the winner's just-committed reservation.
  if (typeof sql.transaction !== 'function') {
    throw new Error('NEW20_RESERVATION_TRANSACTION_UNAVAILABLE');
  }
  const [, claimed] = await sql.transaction((txn) => [
    txn`
      SELECT COUNT(*) AS acquired
        FROM (
          SELECT pg_advisory_xact_lock(lock_id)
            FROM (
              SELECT DISTINCT hashtextextended('bof-new20:' || identity, 0) AS lock_id
                FROM unnest(ARRAY[
                  ${identities[0] || null}::text,
                  ${identities[1] || null}::text
                ]) AS identity
               WHERE identity IS NOT NULL
               ORDER BY lock_id
            ) ordered_locks
        ) acquired_locks
    `,
    txn`
      WITH locked_target AS MATERIALIZED (
        SELECT target.id
          FROM orders target
         WHERE target.id = ${order.id}
           AND target.status = 'pending'
         FOR UPDATE OF target
      ), existing_owner AS (
        SELECT candidate.id
          FROM orders candidate
         WHERE candidate.id <> ${order.id}
           AND UPPER(COALESCE(candidate.discount_code, '')) = 'NEW20'
           AND (
             (${order.user_id || null}::uuid IS NOT NULL AND candidate.user_id = ${order.user_id || null}::uuid)
             OR (${order.email || null}::text IS NOT NULL AND LOWER(candidate.email) = LOWER(${order.email || null}))
           )
           AND (
             candidate.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled')
             OR (
               candidate.status = 'pending'
               AND candidate.payment_reconciliation_status = 'discount_reserved'
             )
           )
         LIMIT 1
      )
      UPDATE orders target
         SET payment_reconciliation_status = 'discount_reserved',
             updated_at = NOW()
        FROM locked_target
       WHERE target.id = locked_target.id
         AND NOT EXISTS (SELECT 1 FROM existing_owner)
      RETURNING target.id
    `,
  ], { isolationLevel: 'ReadCommitted' });
  if (claimed.length) return { ok: true, claimed: true, kind: 'new20' };
  return conflict(
    'NEW20_RESERVATION_CONFLICT',
    'NEW20 is already reserved by another checkout for this customer.',
    'NEW20',
  );
}

async function claimStoredCode(sql, order, code) {
  // Stored codes have a single shared row, so this conditional UPDATE is the
  // atomic cross-provider compare-and-set. There is deliberately no
  // time-based stealing: an old binding may represent a captured payment whose
  // webhook/database reconciliation is delayed. Only an explicit release
  // after a definitive failure/cancel makes the code available again.
  const claimed = await sql`
    WITH locked_target AS MATERIALIZED (
      SELECT target.id, target.abandoned_cart_id, target.email
        FROM orders target
       WHERE target.id = ${order.id}
         AND target.status = 'pending'
       FOR UPDATE OF target
    ), locked_recovery_cart AS MATERIALIZED (
      SELECT recovery_cart.id
        FROM abandoned_carts recovery_cart
        JOIN locked_target
          ON locked_target.abandoned_cart_id = recovery_cart.id
       WHERE recovery_cart.recovery_status IN ('active', 'abandoned')
         AND NOT EXISTS (
           SELECT 1
             FROM orders completed_order
            WHERE completed_order.id <> locked_target.id
              AND completed_order.abandoned_cart_id = recovery_cart.id
              AND COALESCE(completed_order.is_test_order, FALSE) = FALSE
              AND (
                LOWER(BTRIM(COALESCE(completed_order.status, ''))) IN (
                  'paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'
                )
                OR (
                  LOWER(BTRIM(COALESCE(completed_order.status, ''))) = 'pending'
                  AND (
                    NULLIF(BTRIM(to_jsonb(completed_order)->>'paypal_capture_id'), '') IS NOT NULL
                    OR (
                      LOWER(BTRIM(COALESCE(to_jsonb(completed_order)->>'payment_method', ''))) = 'paypal'
                      AND LOWER(BTRIM(COALESCE(
                        to_jsonb(completed_order)->>'payment_reconciliation_status', ''
                      ))) IN ('complete', 'completed')
                    )
                  )
                )
              )
         )
       FOR UPDATE OF recovery_cart
    ), reserved AS (
      UPDATE discount_codes dc
         SET used = TRUE,
             used_at = COALESCE(dc.used_at, NOW()),
             order_id = ${order.id},
             updated_at = NOW()
        FROM locked_target
       WHERE UPPER(dc.code) = ${code}
         AND (dc.expires_at IS NULL OR dc.expires_at >= NOW())
         AND (dc.cart_id IS NULL OR dc.cart_id = locked_target.abandoned_cart_id)
         AND (
           NULLIF(BTRIM(dc.email), '') IS NULL
           OR LOWER(BTRIM(dc.email)) = LOWER(BTRIM(locked_target.email))
         )
         AND (
           dc.campaign IS DISTINCT FROM ${LARGE_BANNER_RECOVERY_CAMPAIGN}
           OR (
             dc.cart_id IN (SELECT id FROM locked_recovery_cart)
             AND
             dc.expires_at > NOW()
             AND
             dc.discount_scope = ${LARGE_BANNER_RECOVERY_SCOPE}
             AND dc.activated_at IS NOT NULL
             AND dc.activated_at <= NOW()
             AND dc.eligible_cart_item_ids IS NOT NULL
             AND dc.max_discount_amount_cents > 0
           )
         )
         AND (dc.order_id = ${order.id}
              OR (COALESCE(dc.used, FALSE) = FALSE AND dc.order_id IS NULL))
      RETURNING dc.id
    )
    UPDATE orders target
       SET payment_reconciliation_status = 'discount_reserved',
           updated_at = NOW()
      FROM locked_target
     WHERE target.id = locked_target.id
       AND EXISTS (SELECT 1 FROM reserved)
    RETURNING target.id
  `;
  if (claimed.length) return { ok: true, claimed: true, kind: 'stored' };
  if (await activeTradeShowCode(sql, code)) {
    return { ok: true, claimed: false, kind: 'trade_show' };
  }
  return conflict(
    'DISCOUNT_RESERVATION_CONFLICT',
    'This discount is no longer available or is reserved by another checkout.',
    code,
  );
}

async function claimPaymentDiscount(sql, order) {
  const code = normalizedCode(order);
  if (!code) return { ok: true, claimed: false, kind: 'none' };
  if (isTestOrder(order)) return { ok: true, claimed: false, kind: 'test' };
  if (!hasAppliedPromo(order)) return { ok: true, claimed: false, kind: 'not_applied' };
  if (isNonStoredCampaignCode(code)) {
    let kind = 'september_campaign';
    if (code === AUTOMATIC_LARGE_BANNER_PROMOTION_ID) kind = 'automatic_large_banner';
    else if (code === SMALL_BANNER_DISCOUNT_CODE) kind = 'small_banner_promo';
    return { ok: true, claimed: false, kind };
  }
  return code === 'NEW20'
    ? claimNew20(sql, order)
    : claimStoredCode(sql, order, code);
}

async function releasePaymentDiscount(sql, order, reconciliationStatus = 'payment_failed') {
  const code = normalizedCode(order);
  if (code && code !== 'NEW20' && !isNonStoredCampaignCode(code)
      && hasAppliedPromo(order) && !isTestOrder(order)) {
    await sql`
      UPDATE discount_codes dc
         SET used = FALSE,
             used_at = NULL,
             order_id = NULL,
             updated_at = NOW()
       WHERE UPPER(dc.code) = ${code}
         AND dc.order_id = ${order.id}
         AND EXISTS (
           SELECT 1
             FROM orders owner
            WHERE owner.id = ${order.id}
              AND owner.status = 'pending'
         )
    `;
  }
  await sql`
    UPDATE orders
       SET payment_reconciliation_status = ${reconciliationStatus},
           updated_at = NOW()
     WHERE id = ${order.id}
       AND status = 'pending'
  `;
}

async function completePaymentDiscount(sql, order) {
  const code = normalizedCode(order);
  if (!code || isTestOrder(order) || !hasAppliedPromo(order)
      || code === 'NEW20' || isNonStoredCampaignCode(code)) {
    return { ok: true, kind: code ? 'not_stored' : 'none' };
  }

  const completed = await sql`
    UPDATE discount_codes
       SET used = TRUE,
           used_at = COALESCE(used_at, NOW()),
           used_by_user_id = COALESCE(used_by_user_id, ${order.user_id || null}::uuid),
           used_by_email = CASE
             WHEN ${order.email || null}::text IS NULL THEN used_by_email
             WHEN COALESCE(used_by_email, ARRAY[]::text[]) @> ARRAY[${order.email || null}::text]
               THEN used_by_email
             ELSE COALESCE(used_by_email, ARRAY[]::text[]) || ARRAY[${order.email || null}::text]
           END,
           order_id = COALESCE(order_id, ${order.id}),
           updated_at = NOW()
     WHERE UPPER(code) = ${code}
       AND (order_id IS NULL OR order_id = ${order.id})
    RETURNING code, cart_id, campaign
  `;
  if (completed.length) {
    if (completed[0].cart_id) {
      await logRecoveryDiscountConsumption(sql, order, completed[0]);
    }
    return { ok: true, kind: 'stored' };
  }
  if (await activeTradeShowCode(sql, code)) return { ok: true, kind: 'trade_show' };
  return { ok: false, code: 'DISCOUNT_COMPLETION_CONFLICT' };
}

async function logRecoveryDiscountConsumption(sql, order, discount) {
  const cartId = discount?.cart_id;
  if (!cartId) return;
  for (const eventType of ['discount_applied', 'coupon_used']) {
    const metadata = {
      idempotency_key: `recovery-discount:${order.id}:${eventType}`,
      order_id: order.id,
      discount_code: normalizedCode(order),
      discount_cents: Number(order.applied_discount_cents || 0),
      campaign: discount.campaign || null,
    };
    try {
      await sql`
        INSERT INTO cart_recovery_logs (
          abandoned_cart_id, event_type, metadata, created_at
        )
        SELECT ${cartId}, ${eventType}, ${JSON.stringify(metadata)}::jsonb, NOW()
         WHERE NOT EXISTS (
           SELECT 1
             FROM cart_recovery_logs existing
            WHERE existing.abandoned_cart_id = ${cartId}
              AND existing.event_type = ${eventType}
              AND existing.metadata->>'order_id' = ${String(order.id)}
         )
        ON CONFLICT DO NOTHING
      `;
    } catch (error) {
      // Analytics is secondary to payment settlement. During a rolling deploy,
      // migration 042 may not yet allow `coupon_used`; never strand a paid
      // order or its discount completion on the event vocabulary.
      console.warn('[payment-discount] recovery analytics write skipped', {
        eventType,
        orderId: order.id,
        code: error?.code || null,
      });
    }
  }
}

module.exports = {
  claimPaymentDiscount,
  completePaymentDiscount,
  customerReservationIdentities,
  customerReservationIdentity,
  hasAppliedPromo,
  isNonStoredCampaignCode,
  isTestOrder,
  logRecoveryDiscountConsumption,
  normalizedCode,
  releasePaymentDiscount,
};
