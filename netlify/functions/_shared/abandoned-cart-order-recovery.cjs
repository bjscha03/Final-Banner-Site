'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^(guest|preview)-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  if (email === 'guest@example.com') return null;
  return email;
}

function validUuid(value) {
  const candidate = String(value || '').trim();
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

function validSessionId(value) {
  const candidate = String(value || '').trim();
  return candidate.length >= 8 && candidate.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(candidate)
    ? candidate
    : null;
}

async function markAbandonedCartRecovered(sql, order) {
  if (!order || order.is_test_order === true || order.is_test_order === 'true') return [];
  const orderId = validUuid(order.id);
  if (!orderId) return [];
  const exactCartId = validUuid(order.abandoned_cart_id);
  const exactSessionId = validSessionId(order.abandoned_cart_session_id);
  const userId = validUuid(order.user_id);
  const email = normalizeEmail(order.email);
  const orderCreatedAt = order.created_at || new Date().toISOString();
  if (!exactCartId && !exactSessionId && !userId && !email) return [];

  const recovered = await sql`
    WITH candidate AS (
      SELECT cart.id
       FROM abandoned_carts AS cart
       WHERE cart.recovery_status IN ('active', 'abandoned')
         AND (
           (${exactCartId}::uuid IS NOT NULL AND cart.id = ${exactCartId}::uuid)
           OR (
             ${exactCartId}::uuid IS NULL
             AND ${exactSessionId}::text IS NOT NULL
             AND cart.session_id = ${exactSessionId}::text
             AND cart.created_at <= ${orderCreatedAt}::timestamptz + INTERVAL '10 minutes'
             AND cart.last_activity_at >= ${orderCreatedAt}::timestamptz - INTERVAL '30 minutes'
             AND cart.last_activity_at <= ${orderCreatedAt}::timestamptz + INTERVAL '10 minutes'
           )
           OR (
             ${exactCartId}::uuid IS NULL
             AND ${exactSessionId}::text IS NULL
             AND cart.created_at <= ${orderCreatedAt}
             AND (
               (${userId}::uuid IS NOT NULL AND cart.user_id = ${userId}::uuid)
               OR (${email}::text IS NOT NULL AND LOWER(BTRIM(cart.email)) = ${email})
             )
           )
         )
       ORDER BY cart.last_activity_at DESC, cart.created_at DESC, cart.id DESC
       LIMIT 1
    ), recovered AS (
      UPDATE abandoned_carts AS cart
         SET recovery_status = 'recovered', recovered_at = COALESCE(cart.recovered_at, NOW()),
             recovered_order_id = COALESCE(cart.recovered_order_id, ${orderId}::text),
             recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
             recovery_email_last_error = NULL, updated_at = NOW()
        FROM candidate
       WHERE cart.id = candidate.id
         AND cart.recovery_status IN ('active', 'abandoned')
       RETURNING cart.id
    ), linked_order AS (
      UPDATE orders AS order_row
         SET abandoned_cart_id = COALESCE(order_row.abandoned_cart_id, recovered.id),
             updated_at = NOW()
        FROM recovered
       WHERE order_row.id = ${orderId}
         AND (order_row.abandoned_cart_id IS NULL OR order_row.abandoned_cart_id = recovered.id)
       RETURNING order_row.id
    ), recovery_log AS (
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id, event_type, metadata, created_at
      )
      SELECT recovered.id, 'cart_recovered',
             ${JSON.stringify({ orderId })}::jsonb, NOW()
        FROM recovered
       WHERE NOT EXISTS (
         SELECT 1 FROM cart_recovery_logs AS existing
          WHERE existing.abandoned_cart_id = recovered.id
            AND existing.event_type = 'cart_recovered'
            AND existing.metadata->>'orderId' = ${orderId}
       )
      RETURNING abandoned_cart_id
    )
    SELECT id FROM recovered
  `;
  if (!recovered.length) return [];

  try {
    await sql`
      UPDATE cart_recovery_deliveries
         SET status = 'skipped', failure_reason = 'completed_order', updated_at = NOW()
       WHERE abandoned_cart_id = ANY(${recovered.map((row) => row.id)}::uuid[])
         AND status = 'claimed'
    `;
  } catch (error) {
    if (!['42P01', '42703'].includes(String(error?.code || ''))) throw error;
  }
  return recovered;
}

module.exports = { markAbandonedCartRecovered, normalizeEmail, validSessionId, validUuid };
