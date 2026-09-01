'use strict';

/**
 * Progressive abandoned-cart snapshot capture.
 *
 * This endpoint is intentionally public because guests must be captured
 * before authentication or payment. It stores only bounded cart/contact data,
 * maintains one active cart per owner, and never lets a late `cart` request
 * regress a checkout funnel stage.
 */

const { neon } = require('@neondatabase/serverless');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');
const { runAtomicBatch } = require('../atomic-batch.cjs');
const { getSession } = require('../server-auth.cjs');
const { verifyAbandonedCartRecoveryToken } = require('../abandoned-cart-recovery-token.cjs');
const {
  clientIpFromEvent,
  consumeCaptureQuota,
  rateLimitSecret,
} = require('../abandoned-cart-capture-rate-limit.cjs');

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, private, max-age=0',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Origin',
};

const STAGE_RANK = Object.freeze({ cart: 1, checkout: 2, contact: 3, payment_started: 4 });
const MAX_BODY_LENGTH = 500_000;
const MAX_ITEMS = 40;
const MAX_ITEM_JSON_LENGTH = 30_000;
const MAX_CART_JSON_LENGTH = 350_000;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_ITEMS = 60;
const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 4_096;
const MAX_SCENE_STRING_LENGTH = 16_000;
const MAX_CENTS = 2_000_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,180}$/;
const SNAPSHOT_METADATA_KEY = '__bof_abandoned_cart_snapshot_v1';
const OMITTED_KEYS = new Set([
  'canvas_snapshot', 'raw_file', 'rawFile', 'file_buffer', 'fileBuffer',
  '__proto__', 'constructor', 'prototype',
]);

const response = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { ...headers, ...extraHeaders },
  body: JSON.stringify(body),
});

function headerValue(source, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(source || {}).find(([key]) => key.toLowerCase() === target);
  return entry ? String(entry[1] || '').split(',')[0].trim() : '';
}

function isLocalCaptureRequest(event, env = process.env) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() === 'test') return true;
  if (String(env.NETLIFY_DEV || '').trim().toLowerCase() === 'true') return true;
  const host = (headerValue(event?.headers, 'x-forwarded-host')
    || headerValue(event?.headers, 'host')).split(':')[0].toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(host);
}

function requiresBrowserSource(event, env = process.env) {
  if (isLocalCaptureRequest(event, env)) return false;
  const context = String(env.CONTEXT || '').trim().toLowerCase();
  return context === 'production'
    || context === 'deploy-preview'
    || context === 'branch-deploy'
    || String(env.NETLIFY || '').trim().toLowerCase() === 'true';
}

function requestIsSameOrigin(event, options = {}) {
  const fetchSite = headerValue(event?.headers, 'sec-fetch-site').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const host = headerValue(event?.headers, 'x-forwarded-host') || headerValue(event?.headers, 'host');
  const candidate = headerValue(event?.headers, 'origin') || headerValue(event?.headers, 'referer');
  if (!candidate) return options.requireSource !== true;
  if (!host) return false;
  try {
    const candidateUrl = new URL(candidate);
    if (!['http:', 'https:'].includes(candidateUrl.protocol)) return false;
    if (options.requireHttps === true && candidateUrl.protocol !== 'https:') return false;
    if (candidateUrl.host.toLowerCase() !== host.toLowerCase()) return false;
    const forwardedProtocol = headerValue(event?.headers, 'x-forwarded-proto').toLowerCase();
    return !forwardedProtocol || `${forwardedProtocol}:` === candidateUrl.protocol;
  } catch {
    return false;
  }
}

function verifiedSnapshotUserId(event, requestedUserId) {
  if (!requestedUserId) return null;
  const session = getSession(event);
  return session && String(session.sub || '').toLowerCase() === requestedUserId.toLowerCase()
    ? requestedUserId
    : null;
}

function normalizeStage(value) {
  return Object.prototype.hasOwnProperty.call(STAGE_RANK, value) ? value : 'cart';
}

function highestStage(first, second) {
  const normalizedFirst = normalizeStage(first);
  const normalizedSecond = normalizeStage(second);
  return STAGE_RANK[normalizedSecond] > STAGE_RANK[normalizedFirst]
    ? normalizedSecond
    : normalizedFirst;
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 100);
  return normalized || null;
}

function normalizeCents(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_CENTS) return fallback;
  return parsed;
}

function normalizeSnapshotRevision(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function snapshotPayloadIsNewer(incomingRevision, storedRevision) {
  const incoming = normalizeSnapshotRevision(incomingRevision);
  const stored = normalizeSnapshotRevision(storedRevision);
  return incoming === null ? stored === null : stored === null || incoming > stored;
}

function verifiedRecoveryCartId(cartId, token) {
  const normalizedCartId = typeof cartId === 'string' ? cartId.trim().toLowerCase() : '';
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!UUID_PATTERN.test(normalizedCartId) || !normalizedToken) return null;
  try {
    const claims = verifyAbandonedCartRecoveryToken(normalizedToken);
    return String(claims.cartId || '').toLowerCase() === normalizedCartId
      ? normalizedCartId
      : null;
  } catch {
    return null;
  }
}

function isUnsafeInlineUrl(value) {
  return value.startsWith('blob:') || value.startsWith('data:');
}

function sanitizeUnknown(value, key = '', depth = 0) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const loweredKey = key.toLowerCase();
    if ((loweredKey.includes('url') || loweredKey.includes('src')) && isUnsafeInlineUrl(value)) {
      return null;
    }
    const limit = key === 'canvas_state_json' ? MAX_SCENE_STRING_LENGTH : MAX_STRING_LENGTH;
    return value.slice(0, limit);
  }
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeUnknown(entry, key, depth + 1));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (OMITTED_KEYS.has(entryKey)) continue;
      result[entryKey] = sanitizeUnknown(entryValue, entryKey, depth + 1);
    }
    return result;
  }
  return null;
}

function cartItemHasArtwork(item) {
  return Boolean(
    item?.has_artwork === true
    || item?.file_key
    || item?.file_url
    || item?.thumbnail_url
    || item?.web_preview_url
    || item?.print_ready_url
    || item?.final_render_url
    || item?.final_render_file_key
    || item?.artwork_manifest
    || item?.placement_preview
    || (Array.isArray(item?.yard_sign_designs) && item.yard_sign_designs.length > 0)
    || (Array.isArray(item?.design_uploaded_assets) && item.design_uploaded_assets.length > 0),
  );
}

function sanitizeSnapshotMetadata(item) {
  const value = item && typeof item === 'object' && !Array.isArray(item)
    ? item[SNAPSHOT_METADATA_KEY]
    : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.version !== 1
      || !Number.isSafeInteger(value.sourceItemCount) || value.sourceItemCount < 0
      || !Number.isSafeInteger(value.storedItemCount) || value.storedItemCount < 0
      || typeof value.complete !== 'boolean') {
    return null;
  }
  return {
    version: 1,
    sourceItemCount: value.sourceItemCount,
    storedItemCount: value.storedItemCount,
    complete: value.complete,
  };
}

function itemSummary(item) {
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const string = (value, limit) => (typeof value === 'string' && value ? value.slice(0, limit) : null);
  const summary = {
    id: string(item?.id, 200),
    product_type: string(item?.product_type, 80) || 'banner',
    width_in: number(item?.width_in),
    height_in: number(item?.height_in),
    quantity: Math.max(1, Math.round(number(item?.quantity, 1))),
    material: string(item?.material, 100),
    grommets: string(item?.grommets, 100),
    pole_pockets: string(item?.pole_pockets, 100),
    pole_pocket_size: string(item?.pole_pocket_size, 40),
    pole_pocket_position: string(item?.pole_pocket_position, 80),
    rope_feet: number(item?.rope_feet),
    rope_placement: string(item?.rope_placement, 80),
    area_sqft: number(item?.area_sqft),
    unit_price_cents: Math.round(number(item?.unit_price_cents)),
    rope_cost_cents: Math.round(number(item?.rope_cost_cents)),
    pole_pocket_cost_cents: Math.round(number(item?.pole_pocket_cost_cents)),
    line_total_cents: Math.round(number(item?.line_total_cents)),
    file_key: string(item?.file_key, 512),
    file_name: string(item?.file_name, 255),
    thumbnail_url: sanitizeUnknown(item?.thumbnail_url, 'thumbnail_url'),
    web_preview_url: sanitizeUnknown(item?.web_preview_url, 'web_preview_url'),
    final_render_url: sanitizeUnknown(item?.final_render_url, 'final_render_url'),
    artwork_manifest: sanitizeUnknown(item?.artwork_manifest, 'artwork_manifest'),
    placement_preview: sanitizeUnknown(item?.placement_preview, 'placement_preview'),
    yard_sign_design_count: number(item?.yard_sign_design_count),
    has_artwork: cartItemHasArtwork(item),
  };
  const snapshotMetadata = sanitizeSnapshotMetadata(item);
  return snapshotMetadata
    ? { [SNAPSHOT_METADATA_KEY]: snapshotMetadata, ...summary }
    : summary;
}

function sanitizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  const result = [];
  let totalLength = 2;
  for (const item of items.slice(0, MAX_ITEMS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    let sanitized = sanitizeUnknown(item);
    const snapshotMetadata = sanitizeSnapshotMetadata(item);
    if (snapshotMetadata) sanitized[SNAPSHOT_METADATA_KEY] = snapshotMetadata;
    // Historical rows remain unknown, but every new snapshot records an
    // explicit per-item value even when the broad sanitizer keeps the item
    // small enough that the summary fallback is unnecessary.
    sanitized.has_artwork = cartItemHasArtwork(item);
    let serialized = JSON.stringify(sanitized);
    if (serialized.length > MAX_ITEM_JSON_LENGTH) {
      sanitized = itemSummary(item);
      serialized = JSON.stringify(sanitized);
    }
    if (totalLength + serialized.length > MAX_CART_JSON_LENGTH) break;
    totalLength += serialized.length + 1;
    result.push(sanitized);
  }
  return result;
}

function calculateLineSubtotalCents(items) {
  return items.reduce((sum, item) => {
    const lineTotal = normalizeCents(item?.line_total_cents, 0);
    return Math.min(MAX_CENTS, sum + lineTotal);
  }, 0);
}

function extractUtm(metadata) {
  const stringOrNull = (value) => (
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
  );
  return {
    source: stringOrNull(metadata?.utm_source),
    medium: stringOrNull(metadata?.utm_medium),
    campaign: stringOrNull(metadata?.utm_campaign),
  };
}

async function closeActiveSnapshot(sql, {
  userId,
  sessionId,
  cartId,
  snapshotRevision,
}) {
  const queries = [];
  if (userId) {
    queries.push(sql`
      UPDATE abandoned_carts
         SET recovery_status = 'expired',
             snapshot_revision = COALESCE(${snapshotRevision}::bigint, snapshot_revision),
             updated_at = NOW(),
             last_activity_at = NOW()
       WHERE user_id = ${userId}
         AND (
           (snapshot_revision IS NULL AND ${snapshotRevision}::bigint IS NULL)
           OR (${snapshotRevision}::bigint IS NOT NULL
               AND (snapshot_revision IS NULL OR ${snapshotRevision}::bigint > snapshot_revision))
         )
         AND (
           recovery_status = 'active'
           OR (${cartId}::uuid IS NOT NULL AND id = ${cartId}::uuid AND recovery_status = 'abandoned')
         )
       RETURNING id
    `);
  }
  if (sessionId) {
    queries.push(sql`
      UPDATE abandoned_carts
         SET recovery_status = 'expired',
             snapshot_revision = COALESCE(${snapshotRevision}::bigint, snapshot_revision),
             updated_at = NOW(),
             last_activity_at = NOW()
       WHERE session_id = ${sessionId}
         AND (
           (snapshot_revision IS NULL AND ${snapshotRevision}::bigint IS NULL)
           OR (${snapshotRevision}::bigint IS NOT NULL
               AND (snapshot_revision IS NULL OR ${snapshotRevision}::bigint > snapshot_revision))
         )
         AND (
           recovery_status = 'active'
           OR (${cartId}::uuid IS NOT NULL AND id = ${cartId}::uuid AND recovery_status = 'abandoned')
         )
       RETURNING id
    `);
  }
  if (queries.length === 0) return [];
  if (queries.length === 1) return queries[0];
  const results = await runAtomicBatch(sql, queries);
  return results.flat();
}

function expireReturnedAbandonedSnapshot(sql, values) {
  return sql`
    UPDATE abandoned_carts
       SET recovery_status = 'expired',
           recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL,
           updated_at = NOW()
     WHERE ${values.existingCartId}::uuid IS NOT NULL
       AND id = ${values.existingCartId}::uuid
       AND recovery_status = 'abandoned'
       AND (
         (${values.userId}::uuid IS NOT NULL AND user_id = ${values.userId}::uuid)
         OR (
           ${values.sessionId}::text IS NOT NULL
           AND session_id = ${values.sessionId}
           AND (
             user_id IS NULL
             OR (${values.userId}::uuid IS NOT NULL AND user_id = ${values.userId}::uuid)
           )
         )
       )
     RETURNING id, abandoned_at
  `;
}

async function upsertForUser(sql, values) {
  const upsert = sql`
    INSERT INTO abandoned_carts (
      user_id, email, normalized_email, phone, customer_first_name, customer_last_name,
      cart_contents, total_value, subtotal_cents, discount_cents, tax_cents,
      estimated_total_cents, has_artwork, snapshot_revision,
      checkout_stage, checkout_stage_updated_at,
      last_activity_at, recovery_status, utm_source, utm_medium, utm_campaign,
      created_at, updated_at
    ) VALUES (
      ${values.userId}, ${values.email}, ${values.email}, ${values.phone},
      ${values.firstName}, ${values.lastName}, ${values.cartJson}::jsonb,
      ${values.totalValue}, ${values.subtotalCents}, ${values.discountCents},
      ${values.taxCents}, ${values.estimatedTotalCents}, ${values.hasArtwork},
      ${values.snapshotRevision},
      ${values.stage}, NOW(), NOW(), 'active', ${values.utm.source},
      ${values.utm.medium}, ${values.utm.campaign}, NOW(), NOW()
    )
    ON CONFLICT (user_id)
    WHERE recovery_status = 'active' AND user_id IS NOT NULL
    DO UPDATE SET
      email = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.email, abandoned_carts.email) ELSE abandoned_carts.email END,
      normalized_email = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.normalized_email, abandoned_carts.normalized_email)
        ELSE abandoned_carts.normalized_email END,
      phone = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.phone, abandoned_carts.phone) ELSE abandoned_carts.phone END,
      customer_first_name = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.customer_first_name, abandoned_carts.customer_first_name)
        ELSE abandoned_carts.customer_first_name END,
      customer_last_name = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.customer_last_name, abandoned_carts.customer_last_name)
        ELSE abandoned_carts.customer_last_name END,
      cart_contents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.cart_contents ELSE abandoned_carts.cart_contents END,
      total_value = CASE
        WHEN NOT (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) THEN abandoned_carts.total_value
        WHEN EXCLUDED.estimated_total_cents IS NULL
          AND abandoned_carts.estimated_total_cents IS NOT NULL
          THEN abandoned_carts.total_value
        ELSE EXCLUDED.total_value
      END,
      subtotal_cents = CASE
        WHEN NOT (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) THEN abandoned_carts.subtotal_cents
        WHEN EXCLUDED.estimated_total_cents IS NULL
          AND abandoned_carts.estimated_total_cents IS NOT NULL
          THEN abandoned_carts.subtotal_cents
        ELSE EXCLUDED.subtotal_cents
      END,
      discount_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.discount_cents, abandoned_carts.discount_cents)
        ELSE abandoned_carts.discount_cents END,
      tax_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.tax_cents, abandoned_carts.tax_cents)
        ELSE abandoned_carts.tax_cents END,
      estimated_total_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.estimated_total_cents, abandoned_carts.estimated_total_cents)
        ELSE abandoned_carts.estimated_total_cents END,
      has_artwork = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.has_artwork ELSE abandoned_carts.has_artwork END,
      snapshot_revision = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.snapshot_revision ELSE abandoned_carts.snapshot_revision END,
      checkout_stage = CASE
        WHEN abandoned_carts.checkout_stage IS NULL
          OR (CASE EXCLUDED.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
            > (CASE abandoned_carts.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
          THEN EXCLUDED.checkout_stage
        ELSE abandoned_carts.checkout_stage
      END,
      checkout_stage_updated_at = CASE
        WHEN abandoned_carts.checkout_stage IS NULL
          OR (CASE EXCLUDED.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
            > (CASE abandoned_carts.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
          THEN NOW()
        ELSE abandoned_carts.checkout_stage_updated_at
      END,
      recovery_suppressed_at = CASE
        WHEN (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) AND EXCLUDED.normalized_email IS NOT NULL
          AND EXCLUDED.normalized_email IS DISTINCT FROM abandoned_carts.normalized_email THEN NULL
        ELSE abandoned_carts.recovery_suppressed_at
      END,
      recovery_suppression_reason = CASE
        WHEN (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) AND EXCLUDED.normalized_email IS NOT NULL
          AND EXCLUDED.normalized_email IS DISTINCT FROM abandoned_carts.normalized_email THEN NULL
        ELSE abandoned_carts.recovery_suppression_reason
      END,
      last_activity_at = NOW(),
      utm_source = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_source, abandoned_carts.utm_source)
        ELSE abandoned_carts.utm_source END,
      utm_medium = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_medium, abandoned_carts.utm_medium)
        ELSE abandoned_carts.utm_medium END,
      utm_campaign = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_campaign, abandoned_carts.utm_campaign)
        ELSE abandoned_carts.utm_campaign END,
      updated_at = NOW()
    RETURNING id, recovery_status, checkout_stage
  `;

  const queries = [
    sql`SELECT pg_advisory_xact_lock(hashtext(${'abandoned-user:' + values.userId})::bigint)`,
  ];
  if (values.sessionId) {
    queries.push(sql`SELECT pg_advisory_xact_lock(hashtext(${'abandoned-session:' + values.sessionId})::bigint)`);
  }
  queries.push(expireReturnedAbandonedSnapshot(sql, values));
  const upsertIndex = queries.push(upsert) - 1;

  if (!values.sessionId) {
    const results = await runAtomicBatch(sql, queries);
    return results[upsertIndex];
  }

  const mergeIndex = queries.push(sql`
      UPDATE abandoned_carts AS user_cart
         SET email = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.email, user_cart.email) ELSE user_cart.email END,
             normalized_email = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.normalized_email, user_cart.normalized_email)
               ELSE user_cart.normalized_email END,
             phone = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.phone, user_cart.phone) ELSE user_cart.phone END,
             customer_first_name = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.customer_first_name, user_cart.customer_first_name)
               ELSE user_cart.customer_first_name END,
             customer_last_name = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.customer_last_name, user_cart.customer_last_name)
               ELSE user_cart.customer_last_name END,
             total_value = CASE
               WHEN (
                 (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
                 OR (guest_cart.snapshot_revision IS NOT NULL AND (
                   user_cart.snapshot_revision IS NULL
                   OR guest_cart.snapshot_revision > user_cart.snapshot_revision
                 ))
               ) AND NOT (
                 guest_cart.estimated_total_cents IS NULL
                 AND user_cart.estimated_total_cents IS NOT NULL
               ) THEN guest_cart.total_value
               ELSE user_cart.total_value
             END,
             subtotal_cents = CASE
               WHEN (
                 (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
                 OR (guest_cart.snapshot_revision IS NOT NULL AND (
                   user_cart.snapshot_revision IS NULL
                   OR guest_cart.snapshot_revision > user_cart.snapshot_revision
                 ))
               ) AND NOT (
                 guest_cart.estimated_total_cents IS NULL
                 AND user_cart.estimated_total_cents IS NOT NULL
               ) THEN COALESCE(guest_cart.subtotal_cents, user_cart.subtotal_cents)
               ELSE user_cart.subtotal_cents
             END,
             discount_cents = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.discount_cents, user_cart.discount_cents)
               ELSE user_cart.discount_cents END,
             tax_cents = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.tax_cents, user_cart.tax_cents)
               ELSE user_cart.tax_cents END,
             estimated_total_cents = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN COALESCE(guest_cart.estimated_total_cents, user_cart.estimated_total_cents)
               ELSE user_cart.estimated_total_cents END,
             snapshot_revision = CASE WHEN (
               (guest_cart.snapshot_revision IS NULL AND user_cart.snapshot_revision IS NULL)
               OR (guest_cart.snapshot_revision IS NOT NULL AND (
                 user_cart.snapshot_revision IS NULL
                 OR guest_cart.snapshot_revision > user_cart.snapshot_revision
               ))
             ) THEN guest_cart.snapshot_revision ELSE user_cart.snapshot_revision END,
             checkout_stage = CASE
               WHEN guest_cart.checkout_stage IS NOT NULL
                 AND (
                   user_cart.checkout_stage IS NULL
                   OR (CASE guest_cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                     > (CASE user_cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                 )
                 THEN guest_cart.checkout_stage
               ELSE user_cart.checkout_stage
             END,
             checkout_stage_updated_at = CASE
               WHEN guest_cart.checkout_stage IS NOT NULL
                 AND (
                   user_cart.checkout_stage IS NULL
                   OR (CASE guest_cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                     > (CASE user_cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                 )
                 THEN COALESCE(guest_cart.checkout_stage_updated_at, NOW())
               ELSE user_cart.checkout_stage_updated_at
             END,
             updated_at = NOW()
        FROM abandoned_carts AS guest_cart
       WHERE user_cart.user_id = ${values.userId}
         AND user_cart.recovery_status = 'active'
         AND guest_cart.session_id = ${values.sessionId}
         AND guest_cart.user_id IS NULL
         AND guest_cart.recovery_status = 'active'
       RETURNING user_cart.id, user_cart.recovery_status, user_cart.checkout_stage
    `) - 1;
  queries.push(sql`
      UPDATE abandoned_carts
         SET recovery_status = 'expired', updated_at = NOW()
       WHERE session_id = ${values.sessionId}
         AND recovery_status = 'active'
         AND user_id IS NULL
    `);
  const results = await runAtomicBatch(sql, queries);
  return results[mergeIndex]?.length ? results[mergeIndex] : results[upsertIndex];
}

async function upsertForSession(sql, values) {
  const upsert = sql`
    INSERT INTO abandoned_carts (
      session_id, email, normalized_email, phone, customer_first_name, customer_last_name,
      cart_contents, total_value, subtotal_cents, discount_cents, tax_cents,
      estimated_total_cents, has_artwork, snapshot_revision,
      checkout_stage, checkout_stage_updated_at,
      last_activity_at, recovery_status, utm_source, utm_medium, utm_campaign,
      created_at, updated_at
    ) VALUES (
      ${values.sessionId}, ${values.email}, ${values.email}, ${values.phone},
      ${values.firstName}, ${values.lastName}, ${values.cartJson}::jsonb,
      ${values.totalValue}, ${values.subtotalCents}, ${values.discountCents},
      ${values.taxCents}, ${values.estimatedTotalCents}, ${values.hasArtwork},
      ${values.snapshotRevision},
      ${values.stage}, NOW(), NOW(), 'active', ${values.utm.source},
      ${values.utm.medium}, ${values.utm.campaign}, NOW(), NOW()
    )
    ON CONFLICT (session_id)
    WHERE recovery_status = 'active' AND session_id IS NOT NULL
    DO UPDATE SET
      email = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.email, abandoned_carts.email) ELSE abandoned_carts.email END,
      normalized_email = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.normalized_email, abandoned_carts.normalized_email)
        ELSE abandoned_carts.normalized_email END,
      phone = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.phone, abandoned_carts.phone) ELSE abandoned_carts.phone END,
      customer_first_name = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.customer_first_name, abandoned_carts.customer_first_name)
        ELSE abandoned_carts.customer_first_name END,
      customer_last_name = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.customer_last_name, abandoned_carts.customer_last_name)
        ELSE abandoned_carts.customer_last_name END,
      cart_contents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.cart_contents ELSE abandoned_carts.cart_contents END,
      total_value = CASE
        WHEN NOT (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) THEN abandoned_carts.total_value
        WHEN EXCLUDED.estimated_total_cents IS NULL
          AND abandoned_carts.estimated_total_cents IS NOT NULL
          THEN abandoned_carts.total_value
        ELSE EXCLUDED.total_value
      END,
      subtotal_cents = CASE
        WHEN NOT (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) THEN abandoned_carts.subtotal_cents
        WHEN EXCLUDED.estimated_total_cents IS NULL
          AND abandoned_carts.estimated_total_cents IS NOT NULL
          THEN abandoned_carts.subtotal_cents
        ELSE EXCLUDED.subtotal_cents
      END,
      discount_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.discount_cents, abandoned_carts.discount_cents)
        ELSE abandoned_carts.discount_cents END,
      tax_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.tax_cents, abandoned_carts.tax_cents)
        ELSE abandoned_carts.tax_cents END,
      estimated_total_cents = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.estimated_total_cents, abandoned_carts.estimated_total_cents)
        ELSE abandoned_carts.estimated_total_cents END,
      has_artwork = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.has_artwork ELSE abandoned_carts.has_artwork END,
      snapshot_revision = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN EXCLUDED.snapshot_revision ELSE abandoned_carts.snapshot_revision END,
      checkout_stage = CASE
        WHEN abandoned_carts.checkout_stage IS NULL
          OR (CASE EXCLUDED.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
            > (CASE abandoned_carts.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
          THEN EXCLUDED.checkout_stage
        ELSE abandoned_carts.checkout_stage
      END,
      checkout_stage_updated_at = CASE
        WHEN abandoned_carts.checkout_stage IS NULL
          OR (CASE EXCLUDED.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
            > (CASE abandoned_carts.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
          THEN NOW()
        ELSE abandoned_carts.checkout_stage_updated_at
      END,
      recovery_suppressed_at = CASE
        WHEN (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) AND EXCLUDED.normalized_email IS NOT NULL
          AND EXCLUDED.normalized_email IS DISTINCT FROM abandoned_carts.normalized_email THEN NULL
        ELSE abandoned_carts.recovery_suppressed_at
      END,
      recovery_suppression_reason = CASE
        WHEN (
          (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
          OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
            abandoned_carts.snapshot_revision IS NULL
            OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
          ))
        ) AND EXCLUDED.normalized_email IS NOT NULL
          AND EXCLUDED.normalized_email IS DISTINCT FROM abandoned_carts.normalized_email THEN NULL
        ELSE abandoned_carts.recovery_suppression_reason
      END,
      last_activity_at = NOW(),
      utm_source = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_source, abandoned_carts.utm_source)
        ELSE abandoned_carts.utm_source END,
      utm_medium = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_medium, abandoned_carts.utm_medium)
        ELSE abandoned_carts.utm_medium END,
      utm_campaign = CASE WHEN (
        (EXCLUDED.snapshot_revision IS NULL AND abandoned_carts.snapshot_revision IS NULL)
        OR (EXCLUDED.snapshot_revision IS NOT NULL AND (
          abandoned_carts.snapshot_revision IS NULL
          OR EXCLUDED.snapshot_revision > abandoned_carts.snapshot_revision
        ))
      ) THEN COALESCE(EXCLUDED.utm_campaign, abandoned_carts.utm_campaign)
        ELSE abandoned_carts.utm_campaign END,
      updated_at = NOW()
    RETURNING id, recovery_status, checkout_stage
  `;
  const results = await runAtomicBatch(sql, [
    sql`SELECT pg_advisory_xact_lock(hashtext(${'abandoned-session:' + values.sessionId})::bigint)`,
    expireReturnedAbandonedSnapshot(sql, values),
    upsert,
  ]);
  return results[2];
}

async function rebindRecoveredSnapshot(sql, values) {
  const queries = [];
  if (values.userId) {
    queries.push(sql`SELECT pg_advisory_xact_lock(hashtext(${'abandoned-user:' + values.userId})::bigint)`);
  }
  if (values.sessionId) {
    queries.push(sql`SELECT pg_advisory_xact_lock(hashtext(${'abandoned-session:' + values.sessionId})::bigint)`);
  }
  queries.push(sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${'abandoned-recovery-cart:' + values.recoveryCartId})::bigint
    )
  `);
  queries.push(sql`
    WITH recovery_target AS MATERIALIZED (
      SELECT id
        FROM abandoned_carts
       WHERE id = ${values.recoveryCartId}::uuid
         AND recovery_status IN ('active', 'abandoned')
       FOR UPDATE
    )
    UPDATE abandoned_carts AS other_cart
       SET recovery_status = 'expired',
           recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL,
           updated_at = NOW()
      FROM recovery_target
     WHERE other_cart.id <> recovery_target.id
       AND other_cart.recovery_status = 'active'
       AND (
         (${values.userId}::uuid IS NOT NULL AND other_cart.user_id = ${values.userId}::uuid)
         OR (
           ${values.sessionId}::text IS NOT NULL
           AND other_cart.session_id = ${values.sessionId}
           AND (
             other_cart.user_id IS NULL
             OR (${values.userId}::uuid IS NOT NULL
                 AND other_cart.user_id = ${values.userId}::uuid)
           )
         )
       )
  `);
  const reboundIndex = queries.push(sql`
    WITH recovery_target AS MATERIALIZED (
      SELECT cart.id,
             (
               cart.recovery_status = 'abandoned'
               OR (${values.userId}::uuid IS NOT NULL
                   AND cart.user_id IS DISTINCT FROM ${values.userId}::uuid)
               OR (${values.userId}::uuid IS NULL AND (
                 cart.user_id IS NOT NULL
                 OR cart.session_id IS DISTINCT FROM ${values.sessionId}::text
               ))
               OR (cart.snapshot_revision IS NULL AND ${values.snapshotRevision}::bigint IS NULL)
               OR (${values.snapshotRevision}::bigint IS NOT NULL AND (
                 cart.snapshot_revision IS NULL
                 OR ${values.snapshotRevision}::bigint > cart.snapshot_revision
               ))
             ) AS accept_payload
        FROM abandoned_carts AS cart
       WHERE cart.id = ${values.recoveryCartId}::uuid
         AND cart.recovery_status IN ('active', 'abandoned')
       FOR UPDATE
    )
    UPDATE abandoned_carts AS cart
       SET user_id = ${values.userId}::uuid,
           session_id = CASE
             WHEN ${values.userId}::uuid IS NOT NULL THEN NULL
             ELSE ${values.sessionId}::text
           END,
           email = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.email}, cart.email) ELSE cart.email END,
           normalized_email = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.email}, cart.normalized_email) ELSE cart.normalized_email END,
           phone = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.phone}, cart.phone) ELSE cart.phone END,
           customer_first_name = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.firstName}, cart.customer_first_name)
             ELSE cart.customer_first_name END,
           customer_last_name = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.lastName}, cart.customer_last_name)
             ELSE cart.customer_last_name END,
           cart_contents = CASE WHEN recovery_target.accept_payload
             THEN ${values.cartJson}::jsonb ELSE cart.cart_contents END,
           total_value = CASE
             WHEN NOT recovery_target.accept_payload THEN cart.total_value
             WHEN ${values.estimatedTotalCents}::integer IS NULL
               AND cart.estimated_total_cents IS NOT NULL THEN cart.total_value
             ELSE ${values.totalValue}
           END,
           subtotal_cents = CASE
             WHEN NOT recovery_target.accept_payload THEN cart.subtotal_cents
             WHEN ${values.estimatedTotalCents}::integer IS NULL
               AND cart.estimated_total_cents IS NOT NULL THEN cart.subtotal_cents
             ELSE ${values.subtotalCents}
           END,
           discount_cents = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.discountCents}, cart.discount_cents)
             ELSE cart.discount_cents END,
           tax_cents = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.taxCents}, cart.tax_cents) ELSE cart.tax_cents END,
           estimated_total_cents = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.estimatedTotalCents}, cart.estimated_total_cents)
             ELSE cart.estimated_total_cents END,
           has_artwork = CASE WHEN recovery_target.accept_payload
             THEN ${values.hasArtwork} ELSE cart.has_artwork END,
           snapshot_revision = CASE WHEN recovery_target.accept_payload
             THEN ${values.snapshotRevision}::bigint ELSE cart.snapshot_revision END,
           checkout_stage = CASE
             WHEN cart.checkout_stage IS NULL
               OR (CASE ${values.stage}::text WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                 > (CASE cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
               THEN ${values.stage}
             ELSE cart.checkout_stage
           END,
           checkout_stage_updated_at = CASE
             WHEN cart.checkout_stage IS NULL
               OR (CASE ${values.stage}::text WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
                 > (CASE cart.checkout_stage WHEN 'payment_started' THEN 4 WHEN 'contact' THEN 3 WHEN 'checkout' THEN 2 ELSE 1 END)
               THEN NOW()
             ELSE cart.checkout_stage_updated_at
           END,
           recovery_status = 'active',
           abandoned_at = NULL,
           recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL,
           recovery_email_last_error = NULL,
           recovery_suppressed_at = CASE
             WHEN recovery_target.accept_payload
               AND ${values.email}::text IS NOT NULL
               AND ${values.email}::text IS DISTINCT FROM cart.normalized_email THEN NULL
             ELSE cart.recovery_suppressed_at
           END,
           recovery_suppression_reason = CASE
             WHEN recovery_target.accept_payload
               AND ${values.email}::text IS NOT NULL
               AND ${values.email}::text IS DISTINCT FROM cart.normalized_email THEN NULL
             ELSE cart.recovery_suppression_reason
           END,
           last_activity_at = NOW(),
           utm_source = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.utm.source}, cart.utm_source) ELSE cart.utm_source END,
           utm_medium = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.utm.medium}, cart.utm_medium) ELSE cart.utm_medium END,
           utm_campaign = CASE WHEN recovery_target.accept_payload
             THEN COALESCE(${values.utm.campaign}, cart.utm_campaign) ELSE cart.utm_campaign END,
           updated_at = NOW()
      FROM recovery_target
     WHERE cart.id = recovery_target.id
     RETURNING cart.id, cart.recovery_status, cart.checkout_stage
  `) - 1;
  const results = await runAtomicBatch(sql, queries);
  return results[reboundIndex];
}

async function handleSnapshotRequest(event, dependencies = {}) {
  const protectedBrowserRequest = requiresBrowserSource(event);
  if (!requestIsSameOrigin(event, {
    requireSource: protectedBrowserRequest,
    requireHttps: protectedBrowserRequest,
  })) {
    return response(403, { error: 'A valid same-origin browser request is required' });
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  if (typeof event.body === 'string' && event.body.length > MAX_BODY_LENGTH) {
    return response(413, { error: 'Snapshot payload is too large' });
  }

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL
      || process.env.DATABASE_URL
      || process.env.VITE_DATABASE_URL;
    if (!dependencies.sql && !databaseUrl) throw new Error('DATABASE_URL not configured');
    const sql = dependencies.sql || neon(databaseUrl);
    await (dependencies.ensureAbandonedCartSchema || ensureAbandonedCartSchema)(sql);

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return response(400, { error: 'Request body must be valid JSON' });
    }

    const suppliedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const requestedUserId = suppliedUserId && UUID_PATTERN.test(suppliedUserId)
      && suppliedUserId !== '00000000-0000-0000-0000-000000000000'
      ? suppliedUserId
      : null;
    if (suppliedUserId && !requestedUserId) {
      return response(400, {
        error: 'userId must be a valid customer identifier',
        code: 'INVALID_USER_ID',
      });
    }
    const userId = verifiedSnapshotUserId(event, requestedUserId);
    if (requestedUserId && !userId) {
      return response(401, {
        error: 'The requested signed-in cart owner could not be verified',
        code: 'CART_OWNER_UNVERIFIED',
      });
    }
    const sessionId = typeof body.sessionId === 'string' && SESSION_PATTERN.test(body.sessionId)
      ? body.sessionId
      : null;
    const existingCartId = typeof body.existingCartId === 'string' && UUID_PATTERN.test(body.existingCartId)
      ? body.existingCartId
      : null;
    const hasSnapshotRevision = Object.prototype.hasOwnProperty.call(body, 'snapshotRevision');
    const snapshotRevision = normalizeSnapshotRevision(body.snapshotRevision);
    if (hasSnapshotRevision && snapshotRevision === null) {
      return response(400, { error: 'snapshotRevision must be a positive safe integer' });
    }
    const hasRecoveryAuthority = Boolean(body.recoveryCartId || body.recoveryToken);
    const recoveryCartId = hasRecoveryAuthority
      ? verifiedRecoveryCartId(body.recoveryCartId, body.recoveryToken)
      : null;
    if (hasRecoveryAuthority && !recoveryCartId) {
      return response(403, {
        error: 'The cart recovery credential is invalid or expired',
        code: 'RECOVERY_CART_AUTHORITY_INVALID',
      });
    }
    if (!userId && !sessionId) {
      return response(400, { error: 'A valid userId or sessionId is required' });
    }
    if (!Array.isArray(body.cartItems)) {
      return response(400, { error: 'cartItems must be an array' });
    }

    const email = normalizeEmail(body.email);
    if (body.cartItems.length > 0) {
      const clientIp = clientIpFromEvent(event, { trustedOnly: protectedBrowserRequest });
      // The trusted Netlify edge IP and a keyed digest make the IP dimension
      // useful without persisting the raw address. An email-bearing production
      // capture fails closed when either protection input is unavailable.
      if (email && protectedBrowserRequest && (!clientIp || !rateLimitSecret())) {
        return response(503, { error: 'Cart capture protection is temporarily unavailable' });
      }
      try {
        const quota = await (dependencies.consumeCaptureQuota || consumeCaptureQuota)(sql, {
          sessionId,
          userId,
          email,
          ip: clientIp,
        });
        if (!quota.allowed) {
          return response(429, {
            error: 'Too many cart snapshot requests',
            retryAfterSeconds: quota.retryAfterSeconds,
          }, { 'Retry-After': String(quota.retryAfterSeconds) });
        }
      } catch (rateLimitError) {
        console.error('[save-cart-snapshot] Capture protection failed', {
          hasEmail: Boolean(email),
          code: rateLimitError?.code || null,
        });
        if (email) {
          return response(503, { error: 'Cart capture protection is temporarily unavailable' });
        }
        // A cart-only snapshot has no recovery recipient. Preserve ordinary
        // same-session cart persistence during a transient limiter outage.
      }
    }

    if (body.cartItems.length === 0) {
      const closed = await closeActiveSnapshot(sql, {
        userId,
        sessionId,
        cartId: existingCartId,
        snapshotRevision,
      });
      return response(200, {
        success: true,
        closed: true,
        cartId: closed[0]?.id || null,
        status: 'expired',
      });
    }

    const cartItems = sanitizeCartItems(body.cartItems);
    if (cartItems.length === 0) return response(400, { error: 'cartItems contained no valid items' });
    const fallbackSubtotalCents = calculateLineSubtotalCents(cartItems);
    const subtotalCents = normalizeCents(body.subtotalCents, fallbackSubtotalCents);
    const discountCents = normalizeCents(body.discountCents, null);
    const taxCents = normalizeCents(body.taxCents, null);
    const estimatedTotalCents = normalizeCents(body.estimatedTotalCents, null);
    const values = {
      userId,
      sessionId,
      existingCartId,
      recoveryCartId,
      snapshotRevision,
      email,
      phone: normalizePhone(body.phone),
      firstName: normalizeName(body.firstName),
      lastName: normalizeName(body.lastName),
      cartJson: JSON.stringify(cartItems),
      subtotalCents,
      discountCents,
      taxCents,
      estimatedTotalCents,
      totalValue: ((estimatedTotalCents ?? subtotalCents) / 100).toFixed(2),
      hasArtwork: cartItems.some(cartItemHasArtwork),
      stage: normalizeStage(body.stage),
      utm: extractUtm(body.metadata),
    };

    const result = recoveryCartId
      ? await rebindRecoveredSnapshot(sql, values)
      : userId
        ? await upsertForUser(sql, values)
        : await upsertForSession(sql, values);
    const saved = result[0];
    if (recoveryCartId && !saved) {
      return response(409, {
        error: 'The recovered cart is no longer active',
        code: 'RECOVERY_CART_UNAVAILABLE',
      });
    }
    if (!saved) throw new Error('Snapshot upsert returned no cart');

    console.log('[save-cart-snapshot] Saved bounded snapshot', {
      cartId: saved.id,
      owner: userId ? 'signed_in' : 'guest',
      itemCount: cartItems.length,
      hasEmail: Boolean(email),
      stage: saved.checkout_stage,
      rebound: Boolean(recoveryCartId),
    });
    return response(200, {
      success: true,
      cartId: saved.id,
      status: saved.recovery_status,
      stage: saved.checkout_stage,
      rebound: Boolean(recoveryCartId),
    });
  } catch (error) {
    console.error('[save-cart-snapshot] Error:', error);
    return response(500, {
      error: 'Failed to save cart snapshot',
      code: 'SNAPSHOT_SAVE_FAILED',
    });
  }
}

async function handler(event) {
  return handleSnapshotRequest(event);
}

module.exports = {
  handler,
  handleSnapshotRequest,
  normalizeStage,
  highestStage,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeSnapshotRevision,
  snapshotPayloadIsNewer,
  verifiedRecoveryCartId,
  sanitizeCartItems,
  sanitizeSnapshotMetadata,
  cartItemHasArtwork,
  calculateLineSubtotalCents,
  requestIsSameOrigin,
  isLocalCaptureRequest,
  requiresBrowserSource,
  expireReturnedAbandonedSnapshot,
  rebindRecoveredSnapshot,
  upsertForSession,
  upsertForUser,
  verifiedSnapshotUserId,
};
