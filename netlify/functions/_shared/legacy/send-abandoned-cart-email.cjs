'use strict';

const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');
const { findEmailSuppression } = require('../email-suppression.cjs');
const {
  createRecoveryUnsubscribeToken,
  normalizeEmail,
} = require('../cart-recovery-token.cjs');
const {
  createAbandonedCartRecoveryToken,
} = require('../abandoned-cart-recovery-token.cjs');
const { requireAdmin } = require('../server-auth.cjs');

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CART_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_STALE_MINUTES = 20;
const SCHEDULED_RETRY_BACKOFF_HOURS = 1;
const PROVIDER_TIMEOUT_MS = 20 * 1000;
const RECOVERY_TTL_BY_SEQUENCE = Object.freeze({
  1: 96 * 60 * 60,
  2: 48 * 60 * 60,
  3: 24 * 60 * 60,
});

let neonFactory = neon;
let resendFactory = (apiKey) => new Resend(apiKey);
let ensureSchema = ensureAbandonedCartSchema;
let suppressionLookup = findEmailSuppression;

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function parseCartItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function canonicalSiteUrl() {
  const configured = String(process.env.RECOVERY_SITE_URL || '').trim();
  if (/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured.replace(/\/$/, '');
  return 'https://bannersonthefly.com';
}

function generateEmailHTML(sequenceNumber, data) {
  const { cartItems, totalValue, discountCode, recoveryUrl, unsubscribeUrl } = data;
  const brandBlue = '#18448D';
  const brandOrange = '#ff6b35';
  const urgencyRed = '#dc3545';
  const offers = Object.freeze({
    1: {
      subject: '👋 You left something behind at Banners On The Fly',
      heading: 'You left something behind!',
      messageHtml: "We noticed you were shopping but didn't complete your order. Your cart is waiting for you!",
      cta: 'Complete Your Order',
      percentage: 0,
    },
    2: {
      subject: "🎁 Here's 10% off to complete your order",
      heading: "Here's 10% off to complete your order! 🎁",
      messageHtml: "We really want to help you complete your order! As a thank you for considering us, here's a special <strong>10% discount</strong> just for you.",
      cta: 'Claim Your 10% Discount',
      percentage: 10,
    },
    3: {
      subject: '🔥 LAST CHANCE: 15% off your order (expires soon!)',
      heading: 'Final offer: 15% OFF your order! 🔥',
      messageHtml: "This is our <strong>final reminder</strong> about your cart - and we're making it count! We've increased your discount to <strong>15% OFF</strong> as a last chance to help you complete your order.",
      cta: 'Claim Your 15% Discount Now',
      percentage: 15,
    },
  });
  const offer = offers[sequenceNumber];
  if (!offer) throw new Error('Unsupported recovery email sequence');
  const originalTotal = safeNumber(totalValue);
  const discountedTotal = originalTotal * (1 - (offer.percentage / 100));
  const savings = originalTotal - discountedTotal;
  const itemRows = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
    const width = safeNumber(item.width_in ?? item.widthIn ?? item.width);
    const height = safeNumber(item.height_in ?? item.heightIn ?? item.height);
    const quantity = Math.max(1, Math.round(safeNumber(item.quantity) || 1));
    const material = escapeHtml(item.material || item.product_type || 'Custom');
    const lineCents = safeNumber(item.line_total_cents ?? item.lineTotalCents ?? item.line_total);
    const quantityLabel = quantity > 1 ? ` (×${quantity})` : '';
    return `<div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:16px"><p style="font-size:14px;color:#525f7f;margin:0"><strong>${width}&quot; × ${height}&quot;</strong> ${material} banner${quantityLabel}</p><p style="font-size:14px;font-weight:bold;color:${brandBlue};margin:0">$${(lineCents / 100).toFixed(2)}</p></div>`;
  }).join('');
  const cartBlock = itemRows
    ? `<div style="background-color:#f6f9fc;border-radius:8px;padding:24px;margin:24px 0"><p style="font-size:18px;font-weight:bold;color:${brandBlue};margin-bottom:16px">Your Cart:</p>${itemRows}<hr style="border:0;height:1px;background:#e6ebf1;margin:16px 0"><p style="font-size:18px;font-weight:bold;color:${brandBlue};margin-top:16px">Original Total: $${originalTotal.toFixed(2)}</p></div>`
    : '';
  const escapedCode = escapeHtml(discountCode || '');
  const urgencyBanner = sequenceNumber === 3
    ? `<div style="background-color:${urgencyRed};padding:16px;text-align:center;margin-bottom:24px"><p style="color:#fff;font-size:16px;font-weight:bold;margin:0;text-transform:uppercase;letter-spacing:1px">⏰ LAST CHANCE - Expires in 24 Hours!</p></div>`
    : '';
  let discountBlock = '';
  if (sequenceNumber === 2) {
    discountBlock = `<div style="background-color:${brandOrange};border-radius:12px;padding:32px;text-align:center;margin:24px 0"><p style="font-size:14px;color:#fff;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Your Discount Code:</p><p style="font-size:32px;font-weight:bold;color:#fff;letter-spacing:2px;margin:16px 0;font-family:monospace;word-break:break-all">${escapedCode}</p><p style="font-size:14px;color:#fff;margin-top:8px">10% off • Expires in 48 hours</p></div><p style="font-size:16px;color:#525f7f;margin:16px 0">You Save: <strong style="color:${brandOrange}">$${savings.toFixed(2)}</strong></p><p style="font-size:24px;font-weight:bold;color:${brandBlue};margin:8px 0">New Total: $${discountedTotal.toFixed(2)}</p>`;
  } else if (sequenceNumber === 3) {
    discountBlock = `<div style="background-color:${urgencyRed};border-radius:12px;padding:32px;text-align:center;margin:24px 0;border:3px solid ${brandOrange}"><p style="font-size:14px;color:#fff;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Your FINAL Discount Code:</p><p style="font-size:36px;font-weight:bold;color:#fff;letter-spacing:2px;margin:16px 0;font-family:monospace;word-break:break-all">${escapedCode}</p><p style="font-size:16px;color:#fff;margin-top:8px;font-weight:bold">15% off • Expires in 24 hours ⏰</p></div><p style="font-size:18px;font-weight:bold;color:${urgencyRed};margin:16px 0">You Save: $${savings.toFixed(2)} (15% OFF!)</p><p style="font-size:28px;font-weight:bold;color:${brandBlue};margin:8px 0">Final Price: $${discountedTotal.toFixed(2)}</p><div style="background-color:#fff5f5;border-left:4px solid ${urgencyRed};padding:16px;margin:24px 0;border-radius:8px"><p style="font-size:16px;color:${urgencyRed};margin:0">⚠️ <strong>This is your last chance!</strong> After 24 hours, this offer expires and your cart will be cleared.</p></div>`;
  }
  const buttonColor = sequenceNumber === 3 ? urgencyRed : brandOrange;
  const offerReminder = sequenceNumber > 1
    ? '<p style="font-size:16px;color:#525f7f;margin:16px 0">Your discount code will be automatically applied when you click the button above!</p>'
    : '';

  return {
    subject: offer.subject,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif"><div style="max-width:600px;margin:0 auto 64px;background-color:#fff"><div style="background-color:${brandBlue};padding:24px;text-align:center"><h1 style="color:#fff;font-size:24px;font-weight:bold;margin:0">Banners On The Fly</h1></div>${urgencyBanner}<div style="padding:0 48px"><h2 style="font-size:28px;font-weight:bold;color:${brandBlue};margin-top:32px;margin-bottom:16px">${escapeHtml(offer.heading)}</h2><p style="font-size:16px;line-height:24px;color:#525f7f;margin-bottom:16px">${offer.messageHtml}</p>${discountBlock}${cartBlock}<div style="text-align:center;margin:32px 0"><a href="${escapeHtml(recoveryUrl)}" style="background-color:${buttonColor};border-radius:6px;color:#fff;font-size:${sequenceNumber === 3 ? '18px' : '16px'};font-weight:bold;text-decoration:none;display:inline-block;padding:${sequenceNumber === 3 ? '16px 40px' : '14px 32px'};${sequenceNumber === 3 ? `border:2px solid ${brandOrange}` : ''}">${escapeHtml(offer.cta)}</a></div>${offerReminder}<p style="font-size:14px;color:#8898aa;line-height:20px;margin-top:24px">Questions? Just reply to this email - we're here to help!</p></div><div style="padding:0 48px 48px;margin-top:32px;text-align:center"><p style="font-size:12px;color:#8898aa;line-height:16px;margin:4px 0">Banners On The Fly - Professional Custom Banners</p><p style="font-size:12px;color:#8898aa;line-height:16px;margin:4px 0"><a href="${escapeHtml(canonicalSiteUrl())}" style="color:${brandBlue};text-decoration:underline">bannersonthefly.com</a></p><p style="font-size:12px;color:#8898aa;line-height:16px;margin:12px 0 4px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:${brandBlue};text-decoration:underline">Unsubscribe from cart-recovery emails</a></p></div></div></body></html>`,
  };
}

function normalizeProviderError(error) {
  return String(error?.message || error || 'Email provider rejected the request')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:re_|sk_)[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .slice(0, 1000);
}

async function findCompletedOrder(sql, cart) {
  const email = normalizeEmail(cart.normalized_email || cart.email);
  const rows = await sql`
    SELECT order_row.id,
           CASE
             WHEN LOWER(BTRIM(COALESCE(order_row.status, ''))) = 'pending'
              AND (
                NULLIF(BTRIM(to_jsonb(order_row)->>'paypal_capture_id'), '') IS NOT NULL
                OR (
                  LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_method', ''))) = 'paypal'
                  AND LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_reconciliation_status', ''))) = 'complete'
                )
              ) THEN 'paid'
             ELSE LOWER(BTRIM(COALESCE(order_row.status, '')))
           END AS status,
           CASE
             WHEN NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NOT NULL
               THEN to_jsonb(order_row)->>'abandoned_cart_id' = ${cart.id}::text
             WHEN NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NOT NULL
               THEN ${cart.id}::uuid = (
                 SELECT candidate.id
                   FROM abandoned_carts AS candidate
                  WHERE candidate.recovery_status IN ('active', 'abandoned')
                    AND candidate.session_id = NULLIF(BTRIM(order_row.abandoned_cart_session_id), '')
                    AND candidate.created_at <= order_row.created_at + INTERVAL '10 minutes'
                    AND candidate.last_activity_at >= order_row.created_at - INTERVAL '30 minutes'
                    AND candidate.last_activity_at <= order_row.created_at + INTERVAL '10 minutes'
                  ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
                  LIMIT 1
               )
             ELSE ${cart.id}::uuid = (
               SELECT candidate.id
                FROM abandoned_carts AS candidate
                  WHERE candidate.recovery_status IN ('active', 'abandoned')
                    AND candidate.created_at <= order_row.created_at
                    AND candidate.last_activity_at <= order_row.created_at
                    AND order_row.created_at <= candidate.last_activity_at + INTERVAL '96 hours'
                    AND (
                    (candidate.user_id IS NOT NULL AND candidate.user_id = order_row.user_id)
                    OR (
                      NULLIF(BTRIM(candidate.email), '') IS NOT NULL
                      AND LOWER(BTRIM(candidate.email)) = LOWER(BTRIM(order_row.email))
                    )
                  )
                ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
                LIMIT 1
             )
           END AS recovery_target
      FROM orders AS order_row
      LEFT JOIN abandoned_carts AS linked_cart
        ON linked_cart.id::text = NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '')
     WHERE (
             order_row.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
             OR (
               LOWER(BTRIM(COALESCE(order_row.status, ''))) = 'pending'
               AND (
                 NULLIF(BTRIM(to_jsonb(order_row)->>'paypal_capture_id'), '') IS NOT NULL
                 OR (
                   LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_method', ''))) = 'paypal'
                   AND LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_reconciliation_status', ''))) = 'complete'
                 )
               )
             )
           )
       AND COALESCE(order_row.is_test_order, FALSE) = FALSE
       AND (
         to_jsonb(order_row)->>'abandoned_cart_id' = ${cart.id}::text
         OR (
           NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NOT NULL
           AND order_row.created_at >= ${cart.last_activity_at || cart.created_at}
           AND order_row.created_at <= ${cart.last_activity_at || cart.created_at}::timestamptz + INTERVAL '96 hours'
         )
         OR (
           NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NULL
           AND order_row.created_at >= ${cart.created_at}
           AND order_row.created_at <= ${cart.last_activity_at || cart.created_at}::timestamptz + INTERVAL '96 hours'
         )
         OR (
           ${cart.session_id || null}::text IS NOT NULL
           AND NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') = ${cart.session_id || null}::text
           AND ${cart.created_at}::timestamptz <= order_row.created_at + INTERVAL '10 minutes'
           AND ${cart.last_activity_at || cart.created_at}::timestamptz >= order_row.created_at - INTERVAL '30 minutes'
           AND ${cart.last_activity_at || cart.created_at}::timestamptz <= order_row.created_at + INTERVAL '10 minutes'
         )
       )
       AND (
         to_jsonb(order_row)->>'abandoned_cart_id' = ${cart.id}::text
         OR (
           NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NULL
           AND (
             (
               ${cart.session_id || null}::text IS NOT NULL
               AND NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') = ${cart.session_id || null}::text
               AND ${cart.created_at}::timestamptz <= order_row.created_at + INTERVAL '10 minutes'
               AND ${cart.last_activity_at || cart.created_at}::timestamptz >= order_row.created_at - INTERVAL '30 minutes'
               AND ${cart.last_activity_at || cart.created_at}::timestamptz <= order_row.created_at + INTERVAL '10 minutes'
            )
            OR (
               NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NULL
               AND
               order_row.created_at >= ${cart.last_activity_at || cart.created_at}
               AND order_row.created_at <= ${cart.last_activity_at || cart.created_at}::timestamptz + INTERVAL '96 hours'
               AND (
                 (${cart.user_id || null}::uuid IS NOT NULL AND order_row.user_id = ${cart.user_id || null}::uuid)
                 OR (${email}::text IS NOT NULL AND LOWER(BTRIM(order_row.email)) = ${email})
               )
             )
           )
         )
         OR (
           NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NOT NULL
           AND to_jsonb(order_row)->>'abandoned_cart_id' <> ${cart.id}::text
           AND order_row.created_at >= ${cart.last_activity_at || cart.created_at}
           AND order_row.created_at <= ${cart.last_activity_at || cart.created_at}::timestamptz + INTERVAL '96 hours'
           AND (
             (
               ${cart.user_id || null}::uuid IS NOT NULL
               AND (
                 order_row.user_id = ${cart.user_id || null}::uuid
                 OR linked_cart.user_id = ${cart.user_id || null}::uuid
               )
             )
             OR (
               ${cart.session_id || null}::text IS NOT NULL
               AND linked_cart.session_id = ${cart.session_id || null}::text
             )
             OR (
               ${email}::text IS NOT NULL
               AND (
                 LOWER(BTRIM(order_row.email)) = ${email}
                 OR COALESCE(NULLIF(linked_cart.normalized_email, ''), LOWER(BTRIM(linked_cart.email))) = ${email}
               )
             )
           )
         )
       )
     ORDER BY recovery_target DESC NULLS LAST,
              (order_row.status = 'refunded') ASC,
              order_row.created_at ASC
     LIMIT 1
  `;
  return rows[0] || null;
}

async function markRecovered(sql, cartId, orderId, sequenceNumber, recoveryTarget = true, orderStatus = null) {
  const positiveRecovery = recoveryTarget && orderStatus !== 'refunded';
  const status = positiveRecovery ? 'recovered' : 'expired';
  const reason = orderStatus === 'refunded'
    ? 'completed_order_refunded'
    : positiveRecovery
      ? 'completed_order'
      : 'completed_order_other_cart';
  await sql`
    WITH recovered AS (
      UPDATE abandoned_carts
         SET recovery_status = ${status},
             recovered_at = CASE WHEN ${positiveRecovery} THEN COALESCE(recovered_at, NOW()) ELSE recovered_at END,
             recovered_order_id = CASE WHEN ${positiveRecovery} THEN COALESCE(recovered_order_id, ${orderId}::text) ELSE recovered_order_id END,
             recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
             recovery_email_last_error = NULL, updated_at = NOW()
       WHERE id = ${cartId}
         AND recovery_status IN ('active', 'abandoned')
       RETURNING id
    ), linked_order AS (
      UPDATE orders AS order_row
         SET abandoned_cart_id = COALESCE(order_row.abandoned_cart_id, recovered.id), updated_at = NOW()
        FROM recovered
       WHERE ${positiveRecovery}
         AND order_row.id = ${orderId}
         AND (order_row.abandoned_cart_id IS NULL OR order_row.abandoned_cart_id = recovered.id)
       RETURNING order_row.id
    ), recovery_log AS (
      INSERT INTO cart_recovery_logs (abandoned_cart_id, event_type, metadata, created_at)
      SELECT recovered.id, 'cart_recovered',
             ${JSON.stringify({ orderId })}::jsonb, NOW()
        FROM recovered
       WHERE ${positiveRecovery}
         AND NOT EXISTS (
           SELECT 1 FROM cart_recovery_logs AS existing
            WHERE existing.abandoned_cart_id = recovered.id
              AND existing.event_type = 'cart_recovered'
              AND existing.metadata->>'orderId' = ${orderId}
         )
      RETURNING abandoned_cart_id
    )
    INSERT INTO cart_recovery_deliveries (
      abandoned_cart_id, sequence_number, status, failure_reason, metadata, updated_at
    )
    SELECT id, ${sequenceNumber}, 'skipped', ${reason},
           ${JSON.stringify({ recoveredOrderId: orderId, recoveryTarget: Boolean(positiveRecovery), orderStatus })}::jsonb, NOW()
      FROM recovered
    ON CONFLICT (abandoned_cart_id, sequence_number) DO UPDATE
      SET status = CASE WHEN cart_recovery_deliveries.status = 'sent' THEN cart_recovery_deliveries.status ELSE 'skipped' END,
          failure_reason = CASE WHEN cart_recovery_deliveries.status = 'sent' THEN cart_recovery_deliveries.failure_reason ELSE ${reason} END,
          updated_at = NOW()
  `;
}

async function markSuppressed(sql, cartId, sequenceNumber, suppression) {
  const reason = `${suppression.source || 'suppression'}:${suppression.reason || 'suppressed'}`.slice(0, 500);
  await sql`
    WITH suppressed AS (
      UPDATE abandoned_carts
         SET recovery_suppressed_at = COALESCE(recovery_suppressed_at, NOW()),
             recovery_suppression_reason = ${reason},
             recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
             recovery_email_last_error = NULL, updated_at = NOW()
       WHERE id = ${cartId}
       RETURNING id
    )
    INSERT INTO cart_recovery_deliveries (
      abandoned_cart_id, sequence_number, status, failure_reason, metadata, updated_at
    )
    SELECT id, ${sequenceNumber}, 'suppressed', ${reason},
           ${JSON.stringify({ source: suppression.source || null, reason: suppression.reason || null })}::jsonb, NOW()
      FROM suppressed
    ON CONFLICT (abandoned_cart_id, sequence_number) DO UPDATE
      SET status = CASE WHEN cart_recovery_deliveries.status = 'sent' THEN cart_recovery_deliveries.status ELSE 'suppressed' END,
          failure_reason = CASE WHEN cart_recovery_deliveries.status = 'sent' THEN cart_recovery_deliveries.failure_reason ELSE EXCLUDED.failure_reason END,
          metadata = cart_recovery_deliveries.metadata || EXCLUDED.metadata, updated_at = NOW()
  `;
}

async function hasRecoveryClick(sql, cartId, sequenceNumber) {
  if (sequenceNumber <= 1) return false;
  const rows = await sql`
    SELECT 1
      FROM cart_recovery_logs
     WHERE abandoned_cart_id = ${cartId}
       AND event_type = 'email_clicked'
     LIMIT 1
  `;
  return rows.length > 0;
}

async function markClickStopped(sql, cartId, sequenceNumber) {
  await sql`
    WITH stopped AS (
      UPDATE cart_recovery_deliveries
         SET status = 'skipped', failure_reason = 'recipient_clicked_recovery', updated_at = NOW()
       WHERE abandoned_cart_id = ${cartId}
         AND sequence_number = ${sequenceNumber}
         AND status = 'claimed'
       RETURNING abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL, updated_at = NOW()
      FROM stopped
     WHERE cart.id = stopped.abandoned_cart_id
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
  `;
}

async function consolidateRecipientCarts(sql, cartId) {
  return sql`
    WITH target_recipient AS (
      SELECT COALESCE(NULLIF(normalized_email, ''), LOWER(BTRIM(email))) AS recipient
        FROM abandoned_carts
       WHERE id = ${cartId}
         AND recovery_status IN ('active', 'abandoned')
       LIMIT 1
    ), recipient_lock AS (
      SELECT recipient, pg_advisory_xact_lock(hashtext(recipient)) AS locked
        FROM target_recipient
       WHERE recipient IS NOT NULL
    ), ranked AS (
      SELECT cart.id, cart.last_activity_at, cart.created_at,
             cart.recovery_email_claim_sequence, cart.recovery_email_claimed_at,
             ROW_NUMBER() OVER (
               ORDER BY cart.last_activity_at DESC, cart.created_at DESC, cart.id DESC
             ) AS recipient_rank,
             MAX(COALESCE(cart.recovery_emails_sent, 0)) OVER () AS recipient_emails_sent,
             MAX(cart.last_recovery_email_at) OVER () AS recipient_last_email_at
        FROM abandoned_carts AS cart
        JOIN recipient_lock AS locked_recipient
          ON COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email))) = locked_recipient.recipient
       WHERE cart.recovery_status IN ('active', 'abandoned')
    ), winner_progress AS (
      UPDATE abandoned_carts AS winner
         SET recovery_emails_sent = GREATEST(
               COALESCE(winner.recovery_emails_sent, 0), ranked.recipient_emails_sent
             ),
             last_recovery_email_at = CASE
               WHEN ranked.recipient_last_email_at IS NULL THEN winner.last_recovery_email_at
               WHEN winner.last_recovery_email_at IS NULL THEN ranked.recipient_last_email_at
               ELSE GREATEST(winner.last_recovery_email_at, ranked.recipient_last_email_at)
             END
        FROM ranked
       WHERE ranked.recipient_rank = 1
         AND winner.id = ranked.id
       RETURNING winner.id
    ), stale_candidates AS (
      SELECT ranked.id
        FROM ranked
       WHERE ranked.recipient_rank > 1
         AND (
           ranked.recovery_email_claim_sequence IS NULL
           OR ranked.recovery_email_claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
         )
       ORDER BY ranked.last_activity_at ASC, ranked.created_at ASC, ranked.id ASC
       LIMIT 100
    ), superseded AS (
      UPDATE abandoned_carts AS cart
         SET recovery_status = 'expired', recovery_email_claim_sequence = NULL,
             recovery_email_claimed_at = NULL, recovery_email_last_error = NULL,
             updated_at = NOW()
        FROM stale_candidates
       WHERE cart.id = stale_candidates.id
         AND cart.recovery_status IN ('active', 'abandoned')
       RETURNING cart.id
    ), skipped_deliveries AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'skipped', failure_reason = 'superseded_recipient_cart', updated_at = NOW()
       WHERE delivery.abandoned_cart_id IN (SELECT id FROM superseded)
         AND delivery.status = 'claimed'
       RETURNING delivery.abandoned_cart_id
    )
    SELECT id FROM superseded
  `;
}

async function isLatestRecoveryRecipientCart(sql, cartId, sequenceNumber) {
  const rows = await sql`
    SELECT cart.id
      FROM abandoned_carts AS cart
     WHERE cart.id = ${cartId}
       AND cart.recovery_status IN ('active', 'abandoned')
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
       AND NULLIF(COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email))), '') IS NOT NULL
       AND cart.id = (
         SELECT candidate.id
           FROM abandoned_carts AS candidate
          WHERE candidate.recovery_status IN ('active', 'abandoned')
            AND COALESCE(NULLIF(candidate.normalized_email, ''), LOWER(BTRIM(candidate.email))) =
                COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
          ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
          LIMIT 1
       )
       AND NOT EXISTS (
         SELECT 1
           FROM abandoned_carts AS other_claim
          WHERE other_claim.id <> cart.id
            AND other_claim.recovery_status IN ('active', 'abandoned')
            AND COALESCE(NULLIF(other_claim.normalized_email, ''), LOWER(BTRIM(other_claim.email))) =
                COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
            AND other_claim.recovery_email_claim_sequence IS NOT NULL
            AND other_claim.recovery_email_claimed_at >=
                NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
       )
     LIMIT 1
  `;
  return rows.length > 0;
}

async function stopSupersededRecipientClaim(sql, cartId, sequenceNumber) {
  await sql`
    WITH target AS (
      SELECT cart.id,
             EXISTS (
               SELECT 1
                 FROM abandoned_carts AS newer
                WHERE newer.id <> cart.id
                  AND newer.recovery_status IN ('active', 'abandoned')
                  AND COALESCE(NULLIF(newer.normalized_email, ''), LOWER(BTRIM(newer.email))) =
                      COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
                  AND (newer.last_activity_at, newer.created_at, newer.id) >
                      (cart.last_activity_at, cart.created_at, cart.id)
             ) AS has_newer_cart
        FROM abandoned_carts AS cart
       WHERE cart.id = ${cartId}
       LIMIT 1
    ), stopped_delivery AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'skipped', failure_reason = 'superseded_recipient_cart', updated_at = NOW()
        FROM target
       WHERE delivery.abandoned_cart_id = target.id
         AND delivery.sequence_number = ${sequenceNumber}
         AND delivery.status = 'claimed'
       RETURNING delivery.abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = CASE WHEN target.has_newer_cart THEN 'expired' ELSE cart.recovery_status END,
           recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL, updated_at = NOW()
      FROM target, stopped_delivery
     WHERE cart.id = target.id
       AND cart.id = stopped_delivery.abandoned_cart_id
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
  `;
}

async function hasNewerActiveOwnerCart(sql, cartId) {
  const rows = await sql`
    SELECT 1
      FROM abandoned_carts AS cart
     WHERE cart.id = ${cartId}
       AND EXISTS (
         SELECT 1
           FROM abandoned_carts AS newer_active
          WHERE newer_active.id <> cart.id
            AND newer_active.recovery_status = 'active'
            AND (
              (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
              OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
            )
            AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                (cart.last_activity_at, cart.created_at, cart.id)
       )
     LIMIT 1
  `;
  return rows.length > 0;
}

async function stopNewerActiveOwnerClaim(sql, cartId, sequenceNumber) {
  await sql`
    WITH target AS (
      SELECT cart.id
        FROM abandoned_carts AS cart
       WHERE cart.id = ${cartId}
         AND EXISTS (
           SELECT 1
             FROM abandoned_carts AS newer_active
            WHERE newer_active.id <> cart.id
              AND newer_active.recovery_status = 'active'
              AND (
                (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
                OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
              )
              AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                  (cart.last_activity_at, cart.created_at, cart.id)
         )
       LIMIT 1
    ), stopped_delivery AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'skipped', failure_reason = 'newer_active_owner_cart', updated_at = NOW()
        FROM target
       WHERE delivery.abandoned_cart_id = target.id
         AND delivery.sequence_number = ${sequenceNumber}
         AND delivery.status = 'claimed'
       RETURNING delivery.abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = 'expired', recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL, recovery_email_last_error = NULL,
           updated_at = NOW()
      FROM stopped_delivery
     WHERE cart.id = stopped_delivery.abandoned_cart_id
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
  `;
}

async function findFinalRecoveryStopReason(sql, cartId, sequenceNumber) {
  const rows = await sql`
    SELECT CASE
             WHEN cart.recovery_status <> 'abandoned' THEN
               CASE WHEN cart.recovery_status = 'active' THEN 'cart_reactivated'
                    ELSE 'cart_no_longer_abandoned' END
             WHEN ${sequenceNumber} > 1 AND EXISTS (
               SELECT 1 FROM cart_recovery_logs AS click_log
                WHERE click_log.abandoned_cart_id = cart.id
                  AND click_log.event_type = 'email_clicked'
             ) THEN 'recipient_clicked_recovery'
             WHEN EXISTS (
               SELECT 1
                 FROM abandoned_carts AS newer_active
                WHERE newer_active.id <> cart.id
                  AND newer_active.recovery_status = 'active'
                  AND (
                    (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
                    OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
                  )
                  AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                      (cart.last_activity_at, cart.created_at, cart.id)
             ) THEN 'newer_active_owner_cart'
             WHEN EXISTS (
               SELECT 1
                 FROM abandoned_carts AS newer_recipient
                WHERE newer_recipient.id <> cart.id
                  AND newer_recipient.recovery_status IN ('active', 'abandoned')
                  AND COALESCE(NULLIF(newer_recipient.normalized_email, ''), LOWER(BTRIM(newer_recipient.email))) =
                      COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
                  AND (newer_recipient.last_activity_at, newer_recipient.created_at, newer_recipient.id) >
                      (cart.last_activity_at, cart.created_at, cart.id)
             ) THEN 'superseded_recipient_cart'
             ELSE NULL
           END AS stop_reason
      FROM abandoned_carts AS cart
     WHERE cart.id = ${cartId}
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
     LIMIT 1
  `;
  return rows.length ? rows[0].stop_reason || null : 'cart_no_longer_eligible';
}

async function stopFinalRecoveryClaim(sql, cartId, sequenceNumber, stopReason) {
  const reason = String(stopReason || 'cart_no_longer_eligible').slice(0, 100);
  const expireCart = reason === 'newer_active_owner_cart' || reason === 'superseded_recipient_cart';
  await sql`
    WITH stopped AS (
      UPDATE cart_recovery_deliveries
         SET status = 'skipped', failure_reason = ${reason}, updated_at = NOW()
       WHERE abandoned_cart_id = ${cartId}
         AND sequence_number = ${sequenceNumber}
         AND status = 'claimed'
       RETURNING abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = CASE
             WHEN ${expireCart} AND cart.recovery_status = 'abandoned' THEN 'expired'
             ELSE cart.recovery_status
           END,
           recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL, updated_at = NOW()
      FROM stopped
     WHERE cart.id = stopped.abandoned_cart_id
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
  `;
}

async function claimSequence(sql, cartId, sequenceNumber, source) {
  const minimumGapHours = sequenceNumber === 2 ? 23 : sequenceNumber === 3 ? 48 : 0;
  const scheduledRetry = source === 'scheduled';
  const rows = await sql`
    WITH target AS (
      SELECT cart.id,
             COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email))) AS recipient
        FROM abandoned_carts AS cart
       WHERE cart.id = ${cartId}
       LIMIT 1
    ), recipient_lock AS (
      SELECT target.id, target.recipient,
             pg_advisory_xact_lock(hashtext(target.recipient)) AS locked
        FROM target
       WHERE target.recipient IS NOT NULL
    ), eligible AS (
      SELECT cart.id
        FROM abandoned_carts AS cart
        JOIN recipient_lock ON recipient_lock.id = cart.id
       WHERE cart.recovery_status = 'abandoned'
         AND cart.recovery_emails_sent = ${sequenceNumber - 1}
         AND NULLIF(BTRIM(cart.email), '') IS NOT NULL
         AND cart.recovery_suppressed_at IS NULL
         AND (
           ${minimumGapHours} = 0
           OR (
             cart.last_recovery_email_at IS NOT NULL
             AND cart.last_recovery_email_at <= NOW() - (${minimumGapHours} * INTERVAL '1 hour')
           )
         )
         AND cart.id = (
           SELECT candidate.id
             FROM abandoned_carts AS candidate
            WHERE candidate.recovery_status IN ('active', 'abandoned')
              AND COALESCE(NULLIF(candidate.normalized_email, ''), LOWER(BTRIM(candidate.email))) =
                  recipient_lock.recipient
            ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
            LIMIT 1
         )
         AND NOT EXISTS (
           SELECT 1
             FROM abandoned_carts AS other_claim
            WHERE other_claim.id <> cart.id
              AND other_claim.recovery_status IN ('active', 'abandoned')
              AND COALESCE(NULLIF(other_claim.normalized_email, ''), LOWER(BTRIM(other_claim.email))) =
                  recipient_lock.recipient
              AND other_claim.recovery_email_claim_sequence IS NOT NULL
              AND other_claim.recovery_email_claimed_at >=
                  NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
         )
         AND NOT EXISTS (
           SELECT 1
             FROM abandoned_carts AS newer_active
            WHERE newer_active.id <> cart.id
              AND newer_active.recovery_status = 'active'
              AND (
                (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
                OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
              )
              AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                  (cart.last_activity_at, cart.created_at, cart.id)
         )
         AND (
           ${sequenceNumber} = 1
           OR NOT EXISTS (
             SELECT 1 FROM cart_recovery_logs AS click_log
              WHERE click_log.abandoned_cart_id = cart.id
                AND click_log.event_type = 'email_clicked'
           )
         )
         AND (cart.recovery_email_claim_sequence IS NULL
              OR cart.recovery_email_claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute'))
    ), delivery_claim AS (
      INSERT INTO cart_recovery_deliveries (
        abandoned_cart_id, sequence_number, status, claimed_at, failure_reason, metadata, updated_at
      )
      SELECT id, ${sequenceNumber}, 'claimed', NOW(), NULL,
             ${JSON.stringify({ source: source || 'unknown' })}::jsonb, NOW()
        FROM eligible
      ON CONFLICT (abandoned_cart_id, sequence_number) DO UPDATE
        SET status = 'claimed', claimed_at = NOW(), failure_reason = NULL,
            metadata = cart_recovery_deliveries.metadata || EXCLUDED.metadata, updated_at = NOW()
        WHERE (
             cart_recovery_deliveries.status = 'failed'
             AND (
               NOT ${scheduledRetry}
               OR cart_recovery_deliveries.updated_at <=
                  NOW() - (${SCHEDULED_RETRY_BACKOFF_HOURS} * INTERVAL '1 hour')
             )
           )
           OR (cart_recovery_deliveries.status = 'claimed'
               AND cart_recovery_deliveries.claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute'))
      RETURNING abandoned_cart_id
    ), cart_claim AS (
      UPDATE abandoned_carts AS cart
         SET recovery_email_claim_sequence = ${sequenceNumber}, recovery_email_claimed_at = NOW(),
             recovery_email_last_error = NULL, updated_at = NOW()
        FROM delivery_claim
       WHERE cart.id = delivery_claim.abandoned_cart_id
         AND cart.recovery_status = 'abandoned'
         AND cart.recovery_emails_sent = ${sequenceNumber - 1}
      RETURNING cart.*
    )
    SELECT * FROM cart_claim
  `;
  return rows[0] || null;
}

async function failClaim(sql, cartId, sequenceNumber, error) {
  const message = normalizeProviderError(error);
  try {
    await sql`
      WITH failed AS (
        UPDATE cart_recovery_deliveries
           SET status = 'failed', failure_reason = ${message}, updated_at = NOW()
         WHERE abandoned_cart_id = ${cartId} AND sequence_number = ${sequenceNumber} AND status = 'claimed'
         RETURNING abandoned_cart_id
      )
      UPDATE abandoned_carts AS cart
         SET recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
             recovery_email_last_error = ${message}, updated_at = NOW()
        FROM failed
       WHERE cart.id = failed.abandoned_cart_id
         AND cart.recovery_email_claim_sequence = ${sequenceNumber}
    `;
  } catch (releaseError) {
    console.error('[send-abandoned-cart-email] failed to release delivery claim', {
      cartId, sequenceNumber, code: releaseError?.code || null,
      message: normalizeProviderError(releaseError),
    });
  }
}

async function completeClaim(sql, cartId, sequenceNumber, providerMessageId, discountCode, subject) {
  const rows = await sql`
    WITH delivered AS (
      UPDATE cart_recovery_deliveries
         SET status = 'sent', provider_message_id = ${providerMessageId},
             discount_code = ${discountCode || null}, sent_at = COALESCE(sent_at, NOW()),
             failure_reason = NULL, updated_at = NOW()
       WHERE abandoned_cart_id = ${cartId} AND sequence_number = ${sequenceNumber} AND status = 'claimed'
       RETURNING abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_emails_sent = GREATEST(recovery_emails_sent, ${sequenceNumber}),
           last_recovery_email_at = NOW(), recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL, recovery_email_last_error = NULL, updated_at = NOW()
      FROM delivered
     WHERE cart.id = delivered.abandoned_cart_id
       AND cart.recovery_status = 'abandoned'
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
     RETURNING cart.id
  `;
  if (!rows.length) throw new Error('Delivery was accepted but its database claim could not be completed');

  try {
    await sql`
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id, event_type, email_sequence_number, metadata, created_at
      ) VALUES (
        ${cartId}, 'email_sent', ${sequenceNumber},
        ${JSON.stringify({ subject, discountCode: discountCode || null, emailId: providerMessageId })}::jsonb, NOW()
      )
    `;
  } catch (error) {
    console.error('[send-abandoned-cart-email] secondary recovery log write failed', {
      cartId, sequenceNumber, code: error?.code || null,
    });
  }
}

async function getOrCreateDiscountCode(sql, cart, sequenceNumber) {
  const percentage = sequenceNumber === 2 ? 10 : sequenceNumber === 3 ? 15 : 0;
  if (!percentage) return null;
  if (cart.discount_code) {
    const existing = await sql`
      SELECT code FROM discount_codes
       WHERE code = ${cart.discount_code} AND discount_percentage = ${percentage}
         AND cart_id = ${cart.id}
         AND used = FALSE AND expires_at > NOW()
       LIMIT 1
    `;
    if (existing.length) return existing[0].code;
  }

  // Recovery offers are bearer credentials when copied manually. Use enough
  // entropy to make online guessing infeasible even before provider limits.
  const code = `CART${percentage}-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  const expirationHours = sequenceNumber === 2 ? 48 : 24;
  const recipient = normalizeEmail(cart.normalized_email || cart.email);
  const rows = await sql`
    WITH superseded_offers AS (
      UPDATE discount_codes
         SET expires_at = LEAST(expires_at, NOW()), updated_at = NOW()
       WHERE cart_id = ${cart.id}
         AND used = FALSE
         AND discount_percentage < ${percentage}
         AND expires_at > NOW()
       RETURNING id
    ), inserted_offer AS (
      INSERT INTO discount_codes (
        code, discount_percentage, cart_id, email, single_use, used, expires_at, created_at, updated_at
      ) VALUES (
        ${code}, ${percentage}, ${cart.id}, ${recipient}, TRUE, FALSE,
        NOW() + (${expirationHours} * INTERVAL '1 hour'), NOW(), NOW()
      ) RETURNING code
    )
    SELECT code FROM inserted_offer
  `;
  await sql`UPDATE abandoned_carts SET discount_code = ${rows[0].code}, updated_at = NOW() WHERE id = ${cart.id}`;
  return rows[0].code;
}

async function deliverRecoveryEmail({ sql, resend, cartId, sequenceNumber, source = 'scheduled' }) {
  if (!CART_ID_PATTERN.test(String(cartId || ''))) {
    const error = new Error('A valid cartId is required');
    error.statusCode = 400;
    throw error;
  }
  const sequence = Number(sequenceNumber);
  if (![1, 2, 3].includes(sequence)) {
    const error = new Error('sequenceNumber must be 1, 2, or 3');
    error.statusCode = 400;
    throw error;
  }

  await ensureSchema(sql);
  const carts = await sql`
    SELECT id, user_id, session_id, email, normalized_email, cart_contents,
           total_value, estimated_total_cents, discount_code, recovery_status,
           recovery_emails_sent, created_at, last_activity_at
      FROM abandoned_carts WHERE id = ${cartId} LIMIT 1
  `;
  if (!carts.length) {
    const error = new Error('Cart not found');
    error.statusCode = 404;
    throw error;
  }
  const initialCart = carts[0];
  if (['recovered', 'expired'].includes(initialCart.recovery_status)) {
    return { success: false, skipped: true, reason: initialCart.recovery_status };
  }

  const completedOrder = await findCompletedOrder(sql, initialCart);
  if (completedOrder) {
    await markRecovered(sql, cartId, completedOrder.id, sequence, completedOrder.recovery_target === true || completedOrder.recovery_target === 'true', completedOrder.status);
    return { success: false, skipped: true, reason: 'completed_order' };
  }
  if (initialCart.recovery_status !== 'abandoned') {
    return { success: false, skipped: true, reason: 'not_abandoned' };
  }
  const email = normalizeEmail(initialCart.normalized_email || initialCart.email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    const error = new Error('Cart has no valid email address');
    error.statusCode = 422;
    throw error;
  }
  const initialSuppression = await suppressionLookup(sql, email);
  if (initialSuppression.suppressed) {
    await markSuppressed(sql, cartId, sequence, initialSuppression);
    return { success: false, skipped: true, reason: 'suppressed' };
  }

  await consolidateRecipientCarts(sql, cartId);
  const cart = await claimSequence(sql, cartId, sequence, source);
  if (!cart) return { success: false, skipped: true, reason: 'already_claimed_delivered_or_out_of_sequence' };

  try {
    const completedAfterClaim = await findCompletedOrder(sql, cart);
    if (completedAfterClaim) {
      await markRecovered(sql, cartId, completedAfterClaim.id, sequence, completedAfterClaim.recovery_target === true || completedAfterClaim.recovery_target === 'true', completedAfterClaim.status);
      return { success: false, skipped: true, reason: 'completed_order' };
    }
    const latestSuppression = await suppressionLookup(sql, email);
    if (latestSuppression.suppressed) {
      await markSuppressed(sql, cartId, sequence, latestSuppression);
      return { success: false, skipped: true, reason: 'suppressed' };
    }

    const discountCode = await getOrCreateDiscountCode(sql, cart, sequence);
    const siteUrl = canonicalSiteUrl();
    const recoveryToken = createAbandonedCartRecoveryToken({
      cartId,
      sequenceNumber: sequence,
      expiresInSeconds: RECOVERY_TTL_BY_SEQUENCE[sequence],
    });
    const unsubscribeToken = createRecoveryUnsubscribeToken(email);
    const recoveryUrl = `${siteUrl}/checkout?recovery=${encodeURIComponent(recoveryToken)}`;
    const unsubscribeUrl = `${siteUrl}/.netlify/functions/recovery-email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const totalValue = cart.estimated_total_cents === null || cart.estimated_total_cents === undefined
      ? safeNumber(cart.total_value)
      : safeNumber(cart.estimated_total_cents) / 100;
    const emailData = generateEmailHTML(sequence, {
      cartItems: parseCartItems(cart.cart_contents), totalValue, discountCode, recoveryUrl, unsubscribeUrl,
    });
    // Keep the final external side effect behind one last database/compliance
    // check. This narrows the order-completion or unsubscribe race to the
    // provider request itself.
    const finalCompletedOrder = await findCompletedOrder(sql, cart);
    if (finalCompletedOrder) {
      await markRecovered(
        sql,
        cartId,
        finalCompletedOrder.id,
        sequence,
        finalCompletedOrder.recovery_target === true || finalCompletedOrder.recovery_target === 'true',
        finalCompletedOrder.status,
      );
      return { success: false, skipped: true, reason: 'completed_order' };
    }
    const finalSuppression = await suppressionLookup(sql, email);
    if (finalSuppression.suppressed) {
      await markSuppressed(sql, cartId, sequence, finalSuppression);
      return { success: false, skipped: true, reason: 'suppressed' };
    }
    // Candidate selection can race a provider click webhook, a returned cart,
    // or another cart for the same recipient. Admin sends bypass the scheduler,
    // so repeat every stop condition before the provider side effect.
    if (await hasRecoveryClick(sql, cartId, sequence)) {
      await markClickStopped(sql, cartId, sequence);
      return { success: false, skipped: true, reason: 'email_clicked' };
    }
    if (!await isLatestRecoveryRecipientCart(sql, cartId, sequence)) {
      await stopSupersededRecipientClaim(sql, cartId, sequence);
      return { success: false, skipped: true, reason: 'superseded_recipient_cart' };
    }
    // Keep the owner-return check as the final database read. A newly active
    // cart can have no email yet, so recipient-only dedupe cannot cover it.
    if (await hasNewerActiveOwnerCart(sql, cartId)) {
      await stopNewerActiveOwnerClaim(sql, cartId, sequence);
      return { success: false, skipped: true, reason: 'newer_active_owner_cart' };
    }
    // One combined read immediately before Resend closes races introduced by
    // a same-row signed recovery reactivation, a later recipient cart, or a
    // click arriving after the earlier specialized checks.
    const finalStopReason = await findFinalRecoveryStopReason(sql, cartId, sequence);
    if (finalStopReason) {
      await stopFinalRecoveryClaim(sql, cartId, sequence, finalStopReason);
      return { success: false, skipped: true, reason: finalStopReason };
    }
    const idempotencyKey = `abandoned-cart/${cartId}/sequence/${sequence}`;
    const result = await resend.emails.send({
      from: 'Banners on the Fly <info@bannersonthefly.com>',
      replyTo: 'info@bannersonthefly.com',
      to: email,
      subject: emailData.subject,
      html: emailData.html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'type', value: 'abandoned_cart' },
        { name: 'sequence', value: String(sequence) },
        { name: 'cart_id', value: cartId },
      ],
    }, { idempotencyKey, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    if (result?.error) {
      const providerError = new Error(String(result.error.message || result.error));
      providerError.statusCode = Number(result.error.statusCode || result.error.status) || 502;
      throw providerError;
    }
    const providerMessageId = result?.data?.id;
    if (!providerMessageId) throw new Error('Resend did not return a message ID');
    await completeClaim(sql, cartId, sequence, providerMessageId, discountCode, emailData.subject);
    return { success: true, emailId: providerMessageId, sequenceNumber: sequence, discountCode: discountCode || null };
  } catch (error) {
    await failClaim(sql, cartId, sequence, error);
    throw error;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  const authorization = requireAdmin(event);
  if (!authorization.ok) return { ...authorization.response, headers: { ...headers, ...authorization.response.headers } };

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON body' }); }
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!dbUrl) return reply(500, { error: 'Database configuration error' });
  if (!process.env.RESEND_API_KEY) return reply(500, { error: 'Email provider configuration error' });

  try {
    const result = await deliverRecoveryEmail({
      sql: neonFactory(dbUrl), resend: resendFactory(process.env.RESEND_API_KEY),
      cartId: input.cartId, sequenceNumber: input.sequenceNumber ?? 1,
      source: `admin:${authorization.session.sub || 'unknown'}`,
    });
    return reply(200, result);
  } catch (error) {
    console.error('[send-abandoned-cart-email] delivery failed', {
      cartId: String(input.cartId || '').slice(0, 64), sequenceNumber: Number(input.sequenceNumber || 1),
      code: error?.code || null, message: normalizeProviderError(error),
    });
    return reply(Number(error?.statusCode) || 500, {
      error: 'Failed to send recovery email',
      message: Number(error?.statusCode) && Number(error.statusCode) < 500
        ? error.message : 'Recovery email delivery failed. It is safe to retry.',
    });
  }
};

exports.deliverRecoveryEmail = deliverRecoveryEmail;
exports.generateEmailHTML = generateEmailHTML;
exports._test = {
  claimSequence, completeClaim, consolidateRecipientCarts, failClaim, findCompletedOrder, getOrCreateDiscountCode,
  findFinalRecoveryStopReason, hasNewerActiveOwnerCart, hasRecoveryClick, isLatestRecoveryRecipientCart,
  markClickStopped, markRecovered, markSuppressed, stopFinalRecoveryClaim, stopNewerActiveOwnerClaim,
  stopSupersededRecipientClaim,
  PROVIDER_TIMEOUT_MS,
  resetDependencies() {
    neonFactory = neon;
    resendFactory = (apiKey) => new Resend(apiKey);
    ensureSchema = ensureAbandonedCartSchema;
    suppressionLookup = findEmailSuppression;
  },
  setEnsureSchema(value) { ensureSchema = value; },
  setNeonFactory(value) { neonFactory = value; },
  setResendFactory(value) { resendFactory = value; },
  setSuppressionLookup(value) { suppressionLookup = value; },
};
