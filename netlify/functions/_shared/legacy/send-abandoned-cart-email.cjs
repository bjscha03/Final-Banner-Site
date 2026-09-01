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
const {
  selectWinningRecoveryDiscount,
} = require('../abandoned-cart-discount-selection.cjs');
const {
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_PERCENTAGE,
  LARGE_BANNER_RECOVERY_SCOPE,
  qualifyingLargeBannerLineIds,
  qualifyingLargeBannerSubtotalCents,
} = require('../recovery-discount-policy.cjs');
const { computeTotals, getFeatureFlags } = require('../checkoutTotals.cjs');
const { addPostTaxServiceFees } = require('../order-total-reconciliation.cjs');
const { reconcileSameDayFlags } = require('../sameDayService.cjs');
const {
  StripePricingError,
  repriceStripeCart,
} = require('../stripe-server-pricing.cjs');
const { requireAdmin } = require('../server-auth.cjs');
const { buildAbandonedCartEmail } = require('./abandoned-cart-email-template.cjs');

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
const SCHEDULED_RETRY_BACKOFF_MINUTES = 5;
const MAX_DELIVERY_ATTEMPTS = 5;
const PROVIDER_TIMEOUT_MS = 20 * 1000;
const RECOVERY_EMAIL_TEMPLATE_VERSION = 'recovery_v2';
const RECOVERY_OFFER_TTL_HOURS = 1;
const DEFAULT_PHYSICAL_ADDRESS = 'PO Box 369, Crestwood, KY 40014';
const RESEND_STATUS_BY_ERROR_NAME = Object.freeze({
  missing_required_field: 422,
  invalid_idempotency_key: 400,
  invalid_idempotent_request: 409,
  concurrent_idempotent_requests: 409,
  invalid_access: 422,
  invalid_parameter: 422,
  invalid_region: 422,
  rate_limit_exceeded: 429,
  missing_api_key: 401,
  invalid_api_key: 403,
  suspended_api_key: 403,
  invalid_from_address: 403,
  validation_error: 403,
  not_found: 404,
  method_not_allowed: 405,
  application_error: 500,
  internal_server_error: 500,
});
const RETRYABLE_RESEND_ERROR_NAMES = new Set([
  'concurrent_idempotent_requests',
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
]);
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

function nonNegativeCents(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function checkoutFlags(cart) {
  const state = parseJsonObject(cart?.checkout_state_json);
  return {
    sameDayHitService: state.sameDayHitService === true,
    saturdayDelivery: state.saturdayDelivery === true,
  };
}

function checkoutOptions() {
  const flags = getFeatureFlags();
  return {
    freeShipping: flags.freeShipping,
    minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
  };
}

function recoveryOfferPricing(cart, cartItems, offer, { now = new Date(), existingPromo = null } = {}) {
  const currentTotals = computeTotals(cartItems, 0.06, checkoutOptions(), existingPromo);
  const savedFlags = checkoutFlags(cart);
  const services = reconcileSameDayFlags({
    now,
    items: cartItems,
    requestedSameDay: savedFlags.sameDayHitService,
    requestedSaturday: savedFlags.saturdayDelivery,
  });
  const sameDayFeeCents = services.fees.sameDayFeeCents;
  const saturdayFeeCents = services.fees.saturdayFeeCents;
  const currentTotalCents = addPostTaxServiceFees({
    baseTotalCents: currentTotals.total_cents,
    sameDayFeeCents,
    saturdayFeeCents,
  });
  const base = {
    subtotalCents: currentTotals.adjusted_subtotal_cents,
    existingDiscountCents: currentTotals.applied_discount_cents,
    existingDiscountLabel: currentTotals.applied_discount_type === 'quantity'
      ? 'Automatic quantity discount'
      : currentTotals.applied_discount_type === 'promo' && existingPromo?.code
        ? `${existingPromo.code} discount`
        : 'Discount',
    currentTaxCents: currentTotals.tax_cents,
    currentTotalCents,
    sameDayFeeCents,
    saturdayFeeCents,
  };
  if (!offer) {
    return {
      ...base,
      offerSavingsCents: 0,
      offerDiscountCents: 0,
      offerTaxCents: currentTotals.tax_cents,
      offerTotalCents: currentTotalCents,
    };
  }

  const offerSavingsCents = Math.min(
    currentTotals.adjusted_subtotal_cents,
    nonNegativeCents(offer.maxDiscountAmountCents),
  );
  const reservedAt = new Date(new Date(offer.expiresAt).getTime() - (RECOVERY_OFFER_TTL_HOURS * 60 * 60 * 1000));
  const recoveryTotals = computeTotals(cartItems, 0.06, checkoutOptions(), {
    code: offer.code,
    discountPercentage: LARGE_BANNER_RECOVERY_PERCENTAGE,
    campaign: LARGE_BANNER_RECOVERY_CAMPAIGN,
    recoveryOffer: true,
    recoveryCartId: cart.id,
    discountScope: LARGE_BANNER_RECOVERY_SCOPE,
    eligibleCartItemIds: offer.eligibleCartItemIds,
    maxDiscountAmountCents: offer.maxDiscountAmountCents,
    activatedAt: reservedAt.toISOString(),
    expiresAt: offer.expiresAt,
  });
  const offerTotals = currentTotals.total_cents <= recoveryTotals.total_cents
    ? currentTotals
    : recoveryTotals;
  const offerTotalCents = addPostTaxServiceFees({
    baseTotalCents: offerTotals.total_cents,
    sameDayFeeCents,
    saturdayFeeCents,
  });
  return {
    ...base,
    offerSavingsCents,
    offerDiscountCents: offerTotals.applied_discount_cents,
    offerTaxCents: offerTotals.tax_cents,
    offerTotalCents,
  };
}

function configuredEmailIdentity(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized && normalized.length <= 320 ? normalized : fallback;
}

function configuredPhysicalAddress() {
  const normalized = String(
    process.env.RECOVERY_PHYSICAL_ADDRESS
      || process.env.OUTBOUND_PHYSICAL_ADDRESS
      || DEFAULT_PHYSICAL_ADDRESS,
  ).replace(/\s+/g, ' ').trim();
  return normalized.length >= 10 && normalized.length <= 300
    ? normalized
    : DEFAULT_PHYSICAL_ADDRESS;
}

function recoveryEmailsEnabled() {
  return String(process.env.RECOVERY_EMAILS_ENABLED || '').trim().toLowerCase() !== 'false';
}

function secureOrigin(value, { netlifyOnly = false, trustedSiteOnly = false } = {}) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (netlifyOnly && !hostname.endsWith('.netlify.app')) return null;
    if (trustedSiteOnly
        && hostname !== 'bannersonthefly.com'
        && hostname !== 'www.bannersonthefly.com'
        && !hostname.endsWith('.netlify.app')) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function canonicalSiteUrl() {
  const explicitlyConfigured = secureOrigin(process.env.RECOVERY_SITE_URL);
  if (explicitlyConfigured) return explicitlyConfigured;

  const context = String(process.env.CONTEXT || '').trim().toLowerCase();
  const deployPrimeOrigin = secureOrigin(process.env.DEPLOY_PRIME_URL, { netlifyOnly: true });
  const deployPrimeHost = deployPrimeOrigin ? new URL(deployPrimeOrigin).hostname.toLowerCase() : '';
  const unmistakablePreviewHost = /^deploy-preview-\d+--.+\.netlify\.app$/.test(deployPrimeHost)
    || (deployPrimeHost.includes('--') && deployPrimeHost.endsWith('.netlify.app'));
  if (deployPrimeOrigin && (['deploy-preview', 'branch-deploy'].includes(context) || unmistakablePreviewHost)) {
    return deployPrimeOrigin;
  }

  for (const candidate of [process.env.URL, process.env.PUBLIC_SITE_URL, process.env.SITE_URL]) {
    const origin = secureOrigin(candidate, { trustedSiteOnly: true });
    if (origin) return origin;
  }
  return 'https://bannersonthefly.com';
}

const generateEmailHTML = buildAbandonedCartEmail;

function normalizeProviderError(error) {
  return String(error?.message || error || 'Email provider rejected the request')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:re_|sk_)[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]')
    .slice(0, 1000);
}

function resendStatusForName(name) {
  return RESEND_STATUS_BY_ERROR_NAME[String(name || '').trim()] || null;
}

function classifyProviderError(error) {
  const providerName = String(error?.providerName || error?.name || '').trim();
  if (providerName && Object.hasOwn(RESEND_STATUS_BY_ERROR_NAME, providerName)) {
    return {
      name: providerName,
      statusCode: RESEND_STATUS_BY_ERROR_NAME[providerName],
      retryable: RETRYABLE_RESEND_ERROR_NAMES.has(providerName),
    };
  }
  const statusCode = Number(error?.statusCode || error?.status) || null;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return {
      name: providerName || null,
      statusCode,
      retryable: statusCode === 408 || statusCode === 425 || statusCode === 429,
    };
  }
  return {
    name: providerName || null,
    statusCode: statusCode || 502,
    retryable: true,
  };
}

function providerErrorFromResponse(responseError) {
  const providerName = String(responseError?.name || '').trim();
  const error = new Error(String(responseError?.message || responseError || 'Email provider rejected the request'));
  error.name = 'ResendProviderError';
  error.providerName = providerName || null;
  error.statusCode = Number(responseError?.statusCode || responseError?.status)
    || resendStatusForName(providerName)
    || 502;
  error.retryable = classifyProviderError(error).retryable;
  return error;
}

function permanentDeliveryError(code, message, statusCode = 422) {
  const error = new Error(message);
  error.name = 'RecoveryDeliveryError';
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = false;
  return error;
}

function emailPayloadDigest(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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
             ) AS recipient_rank
        FROM abandoned_carts AS cart
        JOIN recipient_lock AS locked_recipient
          ON COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email))) = locked_recipient.recipient
       WHERE cart.recovery_status IN ('active', 'abandoned')
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
         AND (cart.recovery_email_claim_sequence IS NULL
              OR cart.recovery_email_claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute'))
    ), delivery_claim AS (
      INSERT INTO cart_recovery_deliveries (
        abandoned_cart_id, sequence_number, status, claimed_at, failure_reason, metadata, updated_at
      )
      SELECT id, ${sequenceNumber}, 'claimed', NOW(), NULL,
             ${JSON.stringify({ source: source || 'unknown', attemptCount: 1 })}::jsonb, NOW()
        FROM eligible
      ON CONFLICT (abandoned_cart_id, sequence_number) DO UPDATE
        SET status = 'claimed', claimed_at = NOW(), failure_reason = NULL,
            metadata = COALESCE(cart_recovery_deliveries.metadata, '{}'::jsonb)
              || EXCLUDED.metadata
              || jsonb_build_object(
                   'attemptCount',
                   CASE
                     WHEN cart_recovery_deliveries.metadata->>'attemptCount' ~ '^[0-9]+$'
                       THEN (cart_recovery_deliveries.metadata->>'attemptCount')::integer + 1
                     ELSE 1
                   END
                 ),
            updated_at = NOW()
        WHERE COALESCE(
                CASE
                  WHEN cart_recovery_deliveries.metadata->>'attemptCount' ~ '^[0-9]+$'
                    THEN (cart_recovery_deliveries.metadata->>'attemptCount')::integer
                  ELSE 0
                END,
                0
              ) < ${MAX_DELIVERY_ATTEMPTS}
          AND (
           cart_recovery_deliveries.status = 'failed'
             AND (
               NOT ${scheduledRetry}
               OR cart_recovery_deliveries.updated_at <=
                  NOW() - (${SCHEDULED_RETRY_BACKOFF_MINUTES} * INTERVAL '1 minute')
             )
           )
           OR (cart_recovery_deliveries.status = 'claimed'
               AND cart_recovery_deliveries.claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute'))
          )
      RETURNING abandoned_cart_id, metadata, discount_code
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
    SELECT cart_claim.*,
           delivery_claim.metadata AS recovery_delivery_metadata,
           delivery_claim.discount_code AS recovery_delivery_discount_code
      FROM cart_claim
      JOIN delivery_claim ON delivery_claim.abandoned_cart_id = cart_claim.id
  `;
  return rows[0] || null;
}

async function failClaim(sql, cartId, sequenceNumber, error) {
  const message = normalizeProviderError(error);
  const terminal = error?.retryable === false;
  try {
    await sql`
      WITH failed AS (
        UPDATE cart_recovery_deliveries
           SET status = CASE
                 WHEN ${terminal}
                   OR COALESCE(
                        CASE
                          WHEN metadata->>'attemptCount' ~ '^[0-9]+$'
                            THEN (metadata->>'attemptCount')::integer
                          ELSE 0
                        END,
                        0
                      ) >= ${MAX_DELIVERY_ATTEMPTS}
                   THEN 'skipped'
                 ELSE 'failed'
               END,
               failure_reason = ${message}, updated_at = NOW()
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

async function reserveDeliveryPayload(sql, cartId, sequenceNumber, offer, payload, stableLinks) {
  const digest = emailPayloadDigest(payload);
  const offerMetadata = {
    templateVersion: RECOVERY_EMAIL_TEMPLATE_VERSION,
    payloadDigest: digest,
    recoveryUrl: stableLinks.recoveryUrl,
    unsubscribeUrl: stableLinks.unsubscribeUrl,
    offerExpected: Boolean(offer),
    offerCode: offer?.code || null,
    offerExpiresAt: offer?.expiresAt || null,
    offerPercentage: offer ? LARGE_BANNER_RECOVERY_PERCENTAGE : null,
    offerCampaign: offer ? LARGE_BANNER_RECOVERY_CAMPAIGN : null,
    offerScope: offer ? LARGE_BANNER_RECOVERY_SCOPE : null,
    offerEligibleCartItemIds: offer?.eligibleCartItemIds || null,
    offerMaxDiscountAmountCents: offer?.maxDiscountAmountCents || null,
  };
  const rows = await sql`
    UPDATE cart_recovery_deliveries
       SET discount_code = ${offer?.code || null},
           metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(offerMetadata)}::jsonb,
           updated_at = NOW()
     WHERE abandoned_cart_id = ${cartId}
       AND sequence_number = ${sequenceNumber}
       AND status = 'claimed'
       AND EXISTS (
         SELECT 1
           FROM abandoned_carts AS cart
          WHERE cart.id = ${cartId}
            AND cart.recovery_status = 'abandoned'
            AND cart.recovery_email_claim_sequence = ${sequenceNumber}
            AND cart.recovery_suppressed_at IS NULL
            AND NOT EXISTS (
              SELECT 1
                FROM recovery_email_suppressions AS suppression
               WHERE suppression.normalized_email =
                     COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
                 AND suppression.active = TRUE
            )
            AND NOT EXISTS (
              SELECT 1
                FROM abandoned_carts AS newer
               WHERE newer.id <> cart.id
                 AND newer.recovery_status IN ('active', 'abandoned')
                 AND (
                   (cart.user_id IS NOT NULL AND newer.user_id = cart.user_id)
                   OR (cart.session_id IS NOT NULL AND newer.session_id = cart.session_id)
                   OR COALESCE(NULLIF(newer.normalized_email, ''), LOWER(BTRIM(newer.email))) =
                      COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
                 )
                 AND (newer.last_activity_at, newer.created_at, newer.id) >
                     (cart.last_activity_at, cart.created_at, cart.id)
            )
            AND NOT EXISTS (
              SELECT 1
                FROM orders AS order_row
               WHERE COALESCE(order_row.is_test_order, FALSE) = FALSE
                 AND (
                   to_jsonb(order_row)->>'abandoned_cart_id' = cart.id::text
                   OR (
                     cart.session_id IS NOT NULL
                     AND NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') = cart.session_id
                     AND cart.created_at <= order_row.created_at + INTERVAL '10 minutes'
                     AND cart.last_activity_at >= order_row.created_at - INTERVAL '30 minutes'
                   )
                 )
                 AND (
                   LOWER(BTRIM(COALESCE(order_row.status, ''))) IN
                     ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
                   OR (
                     LOWER(BTRIM(COALESCE(order_row.status, ''))) = 'pending'
                     AND order_row.created_at >= NOW() - INTERVAL '30 minutes'
                   )
                 )
            )
       )
       AND (
         NULLIF(metadata->>'payloadDigest', '') IS NULL
         OR metadata->>'payloadDigest' = ${digest}
       )
     RETURNING abandoned_cart_id
  `;
  if (!rows.length) {
    throw permanentDeliveryError(
      'RECOVERY_IDEMPOTENT_PAYLOAD_CHANGED',
      'The reserved recovery email payload changed and cannot be retried safely.',
      409,
    );
  }
  return { digest };
}

async function completeClaim(
  sql,
  cartId,
  sequenceNumber,
  providerMessageId,
  offer,
  subject,
  deliveryMetadata = {},
) {
  const discountCode = offer?.code || null;
  const rows = await sql`
    WITH eligible_delivery AS MATERIALIZED (
      SELECT delivery.abandoned_cart_id
        FROM cart_recovery_deliveries AS delivery
        JOIN abandoned_carts AS cart ON cart.id = delivery.abandoned_cart_id
       WHERE delivery.abandoned_cart_id = ${cartId}
         AND delivery.sequence_number = ${sequenceNumber}
         AND delivery.status = 'claimed'
         AND cart.recovery_status = 'abandoned'
         AND cart.recovery_email_claim_sequence = ${sequenceNumber}
       FOR UPDATE OF delivery, cart
    ), activated_offer AS (
      UPDATE discount_codes
         SET activated_at = COALESCE(activated_at, NOW()),
             issued_at = COALESCE(issued_at, NOW()),
             updated_at = NOW()
       WHERE ${discountCode}::text IS NOT NULL
         AND EXISTS (SELECT 1 FROM eligible_delivery)
         AND code = ${discountCode}
         AND cart_id = ${cartId}
         AND discount_percentage = ${LARGE_BANNER_RECOVERY_PERCENTAGE}
         AND campaign = ${LARGE_BANNER_RECOVERY_CAMPAIGN}
         AND discount_scope = ${LARGE_BANNER_RECOVERY_SCOPE}
         AND eligible_cart_item_ids = ${JSON.stringify(offer?.eligibleCartItemIds || [])}::jsonb
         AND max_discount_amount_cents = ${offer?.maxDiscountAmountCents || null}
         AND expires_at = ${offer?.expiresAt || null}::timestamptz
         AND expires_at > NOW()
         AND used = FALSE
         AND status = 'unused'
       RETURNING code, expires_at, activated_at
    ), delivered AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'sent', provider_message_id = ${providerMessageId},
             discount_code = ${discountCode || null}, sent_at = COALESCE(sent_at, NOW()),
             failure_reason = NULL,
             metadata = metadata || ${JSON.stringify({
               templateVersion: RECOVERY_EMAIL_TEMPLATE_VERSION,
               ...deliveryMetadata,
             })}::jsonb,
             updated_at = NOW()
        FROM eligible_delivery
       WHERE delivery.abandoned_cart_id = eligible_delivery.abandoned_cart_id
         AND delivery.sequence_number = ${sequenceNumber}
         AND delivery.status = 'claimed'
         AND (
           ${discountCode}::text IS NULL
           OR EXISTS (SELECT 1 FROM activated_offer WHERE code = ${discountCode})
         )
       RETURNING delivery.abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_emails_sent = GREATEST(recovery_emails_sent, ${sequenceNumber}),
           last_recovery_email_at = NOW(), recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL, recovery_email_last_error = NULL, updated_at = NOW()
      FROM delivered
     WHERE cart.id = delivered.abandoned_cart_id
       AND cart.recovery_status = 'abandoned'
       AND cart.recovery_email_claim_sequence = ${sequenceNumber}
     RETURNING cart.id,
               (SELECT expires_at FROM activated_offer LIMIT 1) AS offer_expires_at,
               (SELECT activated_at FROM activated_offer LIMIT 1) AS offer_activated_at
  `;
  if (!rows.length) throw new Error('Delivery was accepted but its database claim could not be completed');

  try {
    await sql`
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id, event_type, email_sequence_number, metadata, created_at
      ) VALUES (
        ${cartId}, 'email_sent', ${sequenceNumber},
        ${JSON.stringify({
          subject,
          discountCode,
          emailId: providerMessageId,
          templateVersion: RECOVERY_EMAIL_TEMPLATE_VERSION,
          ...deliveryMetadata,
        })}::jsonb, NOW()
      )
    `;
    if (discountCode) {
      await sql`
        INSERT INTO cart_recovery_logs (
          abandoned_cart_id, event_type, email_sequence_number, metadata, created_at
        )
        SELECT ${cartId}, 'coupon_issued', ${sequenceNumber},
               ${JSON.stringify({
                 code: discountCode,
                 percentage: LARGE_BANNER_RECOVERY_PERCENTAGE,
                 campaign: LARGE_BANNER_RECOVERY_CAMPAIGN,
                 scope: LARGE_BANNER_RECOVERY_SCOPE,
                 maxDiscountAmountCents: offer.maxDiscountAmountCents,
                 idempotency_key: `recovery_coupon_issued:${cartId}:${sequenceNumber}`,
               })}::jsonb || jsonb_build_object(
                 'activatedAt', ${rows[0].offer_activated_at || null}::timestamptz,
                 'expiresAt', ${rows[0].offer_expires_at || null}::timestamptz
               ), NOW()
         WHERE NOT EXISTS (
           SELECT 1
             FROM cart_recovery_logs
            WHERE abandoned_cart_id = ${cartId}
              AND event_type = 'coupon_issued'
              AND email_sequence_number = ${sequenceNumber}
         )
      `;
    }
  } catch (error) {
    console.error('[send-abandoned-cart-email] secondary recovery log write failed', {
      cartId, sequenceNumber, code: error?.code || null,
    });
  }
}

async function getOrCreateDiscountCode(sql, cart, sequenceNumber, authoritativeItems = null) {
  if (sequenceNumber !== 1) return null;
  let items = authoritativeItems;
  if (!Array.isArray(items)) {
    try {
      items = repriceStripeCart(parseCartItems(cart.cart_contents));
    } catch (error) {
      if (error instanceof StripePricingError) error.retryable = false;
      throw error;
    }
  }
  const eligibleCartItemIds = qualifyingLargeBannerLineIds(items);
  const eligibleSubtotalCents = qualifyingLargeBannerSubtotalCents(items, eligibleCartItemIds);
  const maxDiscountAmountCents = Math.round(
    eligibleSubtotalCents * (LARGE_BANNER_RECOVERY_PERCENTAGE / 100),
  );
  if (!eligibleCartItemIds.length || maxDiscountAmountCents <= 0) return null;

  if (cart.discount_code) {
    const existing = await sql`
      SELECT code, expires_at, activated_at, eligible_cart_item_ids,
             max_discount_amount_cents
        FROM discount_codes
       WHERE code = ${cart.discount_code}
         AND discount_percentage = ${LARGE_BANNER_RECOVERY_PERCENTAGE}
         AND cart_id = ${cart.id}
         AND campaign = ${LARGE_BANNER_RECOVERY_CAMPAIGN}
         AND discount_scope = ${LARGE_BANNER_RECOVERY_SCOPE}
         AND eligible_cart_item_ids = ${JSON.stringify(eligibleCartItemIds)}::jsonb
         AND max_discount_amount_cents = ${maxDiscountAmountCents}
         AND used = FALSE
         AND status = 'unused'
         AND expires_at > NOW()
       LIMIT 1
    `;
    if (existing.length) {
      return {
        code: existing[0].code,
        expiresAt: new Date(existing[0].expires_at).toISOString(),
        activatedAt: existing[0].activated_at,
        eligibleCartItemIds,
        eligibleSubtotalCents,
        maxDiscountAmountCents,
      };
    }
    if (String(cart.discount_code).startsWith('RECOVER25-')) {
      throw permanentDeliveryError(
        'RECOVERY_OFFER_RESERVATION_INVALID',
        'The immutable recovery offer reservation is no longer valid.',
        409,
      );
    }
  }

  // Recovery offers are bearer credentials when copied manually. Use enough
  // entropy to make online guessing infeasible even before provider limits.
  const code = `RECOVER25-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  const provisionalExpiresAt = new Date(Date.now() + (RECOVERY_OFFER_TTL_HOURS * 60 * 60 * 1000));
  const recipient = normalizeEmail(cart.normalized_email || cart.email);
  const rows = await sql`
    WITH superseded_offers AS (
      UPDATE discount_codes
         SET expires_at = LEAST(expires_at, NOW()), updated_at = NOW()
       WHERE cart_id = ${cart.id}
         AND used = FALSE
         AND campaign = ${LARGE_BANNER_RECOVERY_CAMPAIGN}
         AND code <> ${code}
       RETURNING id
    ), inserted_offer AS (
      INSERT INTO discount_codes (
        code, discount_percentage, cart_id, email, single_use, used,
        max_uses_per_customer, max_total_uses, expires_at, campaign,
        discount_scope, eligible_cart_item_ids, max_discount_amount_cents,
        activated_at, created_at, updated_at
      ) VALUES (
        ${code}, ${LARGE_BANNER_RECOVERY_PERCENTAGE}, ${cart.id}, ${recipient}, TRUE, FALSE,
        1, 1, ${provisionalExpiresAt.toISOString()}::timestamptz, ${LARGE_BANNER_RECOVERY_CAMPAIGN},
        ${LARGE_BANNER_RECOVERY_SCOPE}, ${JSON.stringify(eligibleCartItemIds)}::jsonb,
        ${maxDiscountAmountCents}, NULL, NOW(), NOW()
      ) RETURNING code, expires_at, activated_at
    )
    SELECT code, expires_at, activated_at FROM inserted_offer
  `;
  await sql`UPDATE abandoned_carts SET discount_code = ${rows[0].code}, updated_at = NOW() WHERE id = ${cart.id}`;
  return {
    code: rows[0].code,
    expiresAt: new Date(rows[0].expires_at || provisionalExpiresAt).toISOString(),
    activatedAt: rows[0].activated_at || null,
    eligibleCartItemIds,
    eligibleSubtotalCents,
    maxDiscountAmountCents,
  };
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
  if (!recoveryEmailsEnabled()) {
    return { success: false, skipped: true, reason: 'recovery_emails_disabled' };
  }

  await ensureSchema(sql);
  const carts = await sql`
    SELECT id, user_id, session_id, email, normalized_email, cart_contents,
           total_value, subtotal_cents, discount_cents, tax_cents,
           estimated_total_cents, discount_code, recovery_status,
           recovery_emails_sent, created_at, last_activity_at, has_artwork,
           customer_first_name, customer_last_name,
           checkout_state AS checkout_state_json
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
    // Candidate selection can race a returned cart or another cart for the
    // same recipient. A click alone is not a conversion and must not suppress
    // later reminders; paid/recovered and active-cart checks remain decisive.
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
    let cartItems;
    try {
      cartItems = repriceStripeCart(parseCartItems(cart.cart_contents));
    } catch (error) {
      if (error instanceof StripePricingError) error.retryable = false;
      throw error;
    }
    const offer = await getOrCreateDiscountCode(sql, cart, sequence, cartItems);
    const savedDiscountSelection = await selectWinningRecoveryDiscount({
      sql,
      checkoutState: cart.checkout_state_json,
      recoveryCode: null,
      items: cartItems,
      cartId,
      email,
      userId: cart.user_id,
    });
    const existingPromo = savedDiscountSelection?.source === 'saved'
      ? savedDiscountSelection.discount
      : null;
    const siteUrl = canonicalSiteUrl();
    const reservedDeliveryMetadata = parseJsonObject(cart.recovery_delivery_metadata);
    const recoveryToken = reservedDeliveryMetadata.recoveryUrl
      ? null
      : createAbandonedCartRecoveryToken({
        cartId,
        sequenceNumber: sequence,
        expiresInSeconds: RECOVERY_TTL_BY_SEQUENCE[sequence],
      });
    const unsubscribeToken = reservedDeliveryMetadata.unsubscribeUrl
      ? null
      : createRecoveryUnsubscribeToken(email);
    // Keep the bearer token in the URL fragment so it is not sent in the
    // initial HTTP request, server logs, or Referer headers. Checkout clears
    // the fragment before analytics or outbound navigation runs.
    const recoveryUrl = reservedDeliveryMetadata.recoveryUrl
      || `${siteUrl}/checkout#recovery=${encodeURIComponent(recoveryToken)}`;
    const unsubscribeUrl = reservedDeliveryMetadata.unsubscribeUrl
      || `${siteUrl}/.netlify/functions/recovery-email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const pricing = recoveryOfferPricing(cart, cartItems, offer, { existingPromo });
    const totalValue = pricing.currentTotalCents / 100;
    const customerName = [cart.customer_first_name, cart.customer_last_name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    const emailData = generateEmailHTML(sequence, {
      cartItems,
      customerName,
      totalValue,
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.existingDiscountCents,
      discountLabel: pricing.existingDiscountLabel,
      taxCents: pricing.currentTaxCents,
      estimatedTotalCents: pricing.currentTotalCents,
      discountCode: offer?.code || null,
      discountExpiresAt: offer?.expiresAt || null,
      offerSavingsCents: pricing.offerSavingsCents,
      offerDiscountCents: pricing.offerDiscountCents,
      offerTaxCents: pricing.offerTaxCents,
      offerTotalCents: pricing.offerTotalCents,
      sameDayFeeCents: pricing.sameDayFeeCents,
      saturdayFeeCents: pricing.saturdayFeeCents,
      physicalAddress: configuredPhysicalAddress(),
      recoveryUrl,
      unsubscribeUrl,
    });
    const idempotencyKey = `abandoned-cart/${cartId}/sequence/${sequence}`;
    const from = configuredEmailIdentity(
      process.env.RECOVERY_EMAIL_FROM || process.env.EMAIL_FROM,
      'Banners on the Fly <info@bannersonthefly.com>',
    );
    const replyTo = configuredEmailIdentity(
      process.env.RECOVERY_EMAIL_REPLY_TO || process.env.EMAIL_REPLY_TO,
      'info@bannersonthefly.com',
    );
    const providerPayload = {
      from,
      replyTo,
      to: email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'type', value: 'abandoned_cart' },
        { name: 'sequence', value: String(sequence) },
        { name: 'cart_id', value: cartId },
        { name: 'template_version', value: RECOVERY_EMAIL_TEMPLATE_VERSION },
      ],
    };
    await reserveDeliveryPayload(
      sql,
      cartId,
      sequence,
      offer,
      providerPayload,
      { recoveryUrl, unsubscribeUrl },
    );
    const result = await resend.emails.send(
      providerPayload,
      { idempotencyKey, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
    );
    if (result?.error) {
      throw providerErrorFromResponse(result.error);
    }
    const providerMessageId = result?.data?.id;
    if (!providerMessageId) throw new Error('Resend did not return a message ID');
    await completeClaim(sql, cartId, sequence, providerMessageId, offer, emailData.subject, {
      itemCount: cartItems.length,
      hasArtwork: cart.has_artwork === true,
      offerEligible: Boolean(offer),
      offerSavingsCents: pricing.offerSavingsCents,
      offerDiscountCents: pricing.offerDiscountCents,
      offerPercentage: offer ? LARGE_BANNER_RECOVERY_PERCENTAGE : null,
      offerExpiresAt: offer?.expiresAt || null,
    });
    return {
      success: true,
      emailId: providerMessageId,
      sequenceNumber: sequence,
      discountCode: offer?.code || null,
    };
  } catch (error) {
    if (error?.retryable === undefined) {
      const classification = classifyProviderError(error);
      if (
        Object.hasOwn(RESEND_STATUS_BY_ERROR_NAME, String(error?.providerName || error?.name || ''))
        || Number(error?.statusCode) >= 400
      ) {
        error.retryable = classification.retryable;
      }
    }
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
  stopSupersededRecipientClaim, canonicalSiteUrl, classifyProviderError, configuredPhysicalAddress, emailPayloadDigest,
  providerErrorFromResponse, recoveryOfferPricing, reserveDeliveryPayload,
  recoveryEmailsEnabled, DEFAULT_PHYSICAL_ADDRESS, MAX_DELIVERY_ATTEMPTS,
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
