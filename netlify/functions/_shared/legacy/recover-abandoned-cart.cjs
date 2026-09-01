'use strict';

const { neon } = require('@neondatabase/serverless');
const {
  RecoveryTokenError,
  verifyAbandonedCartRecoveryToken,
} = require('../abandoned-cart-recovery-token.cjs');

const MAX_REQUEST_BODY_BYTES = 4096;
const MAX_CART_CONTENTS_BYTES = 2 * 1024 * 1024;
const MAX_RECOVERED_ITEMS = 40;
const MAX_ITEM_BYTES = 64 * 1024;
const MAX_RESPONSE_ITEMS_BYTES = 48_000;
const HISTORICAL_CAPTURE_MAX_ITEM_BYTES = 8_000;
const MAX_OBJECT_DEPTH = 7;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 8192;
const SNAPSHOT_METADATA_KEY = '__bof_abandoned_cart_snapshot_v1';

const responseHeaders = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Origin',
};

const allowedItemKeys = new Set([
  'id',
  'product_type',
  'width_in',
  'height_in',
  'quantity',
  'material',
  'grommets',
  'pole_pockets',
  'pole_pocket_size',
  'pole_pocket_position',
  'rounded_corners',
  'rope_feet',
  'rope_placement',
  'area_sqft',
  'unit_price_cents',
  'rope_cost_cents',
  'rope_pricing_mode',
  'pole_pocket_cost_cents',
  'pole_pocket_pricing_mode',
  'line_total_cents',
  'file_key',
  'file_name',
  'file_url',
  'thumbnail_url',
  'web_preview_url',
  'print_ready_url',
  'is_pdf',
  'text_elements',
  'overlay_image',
  'overlay_images',
  'canva_design_id',
  'canvas_background_color',
  'image_scale',
  'image_scale_y',
  'image_position',
  'fit_mode',
  'aiDesign',
  'created_at',
  'source',
  'final_render_url',
  'final_render_file_key',
  'final_render_width_px',
  'final_render_height_px',
  'final_render_dpi',
  'artwork_manifest',
  'placement_preview',
  'composition_signature',
  'composition_revision',
  'yard_sign_sidedness',
  'yard_sign_step_stakes_enabled',
  'yard_sign_step_stakes_qty',
  'yard_sign_design_count',
  'yard_sign_designs',
  'yard_sign_signs_subtotal_cents',
  'yard_sign_stakes_subtotal_cents',
  'design_service_enabled',
  'design_request_text',
  'design_draft_preference',
  'design_uploaded_assets',
  'final_print_pdf_url',
  'final_print_pdf_file_key',
  'final_print_pdf_uploaded_at',
  'sameDayHitServiceSelected',
  'sameDayHitServicePrice',
  'has_artwork',
]);

const oversizedOptionalKeys = [
  'aiDesign',
  'text_elements',
  'overlay_image',
  'overlay_images',
  'artwork_manifest',
  'placement_preview',
  'yard_sign_designs',
  'design_uploaded_assets',
  'design_request_text',
];

const optionalArtworkPayloadKeys = new Set([
  ...oversizedOptionalKeys,
  'file_url',
  'thumbnail_url',
  'web_preview_url',
  'print_ready_url',
  'final_render_url',
]);

const commerceItemKeys = [
  'id',
  'product_type',
  'width_in',
  'height_in',
  'quantity',
  'material',
  'grommets',
  'pole_pockets',
  'pole_pocket_size',
  'pole_pocket_position',
  'rounded_corners',
  'rope_feet',
  'rope_placement',
  'area_sqft',
  'unit_price_cents',
  'rope_cost_cents',
  'pole_pocket_cost_cents',
  'rope_pricing_mode',
  'pole_pocket_pricing_mode',
  'line_total_cents',
  'yard_sign_sidedness',
  'yard_sign_step_stakes_enabled',
  'yard_sign_step_stakes_qty',
  'yard_sign_design_count',
  'yard_sign_signs_subtotal_cents',
  'yard_sign_stakes_subtotal_cents',
  'design_service_enabled',
  'sameDayHitServiceSelected',
  'sameDayHitServicePrice',
  'has_artwork',
];

const commerceCompactionKeys = [
  'area_sqft',
  'rope_pricing_mode',
  'pole_pocket_pricing_mode',
  'rounded_corners',
  'pole_pocket_size',
  'pole_pocket_position',
  'rope_placement',
  'yard_sign_design_count',
  'yard_sign_signs_subtotal_cents',
  'yard_sign_stakes_subtotal_cents',
  'sameDayHitServicePrice',
  'unit_price_cents',
  'rope_cost_cents',
  'pole_pocket_cost_cents',
];

const essentialItemKeys = new Set([
  'id',
  'product_type',
  'width_in',
  'height_in',
  'quantity',
  'material',
  'grommets',
  'pole_pockets',
  'unit_price_cents',
  'rope_cost_cents',
  'pole_pocket_cost_cents',
  'line_total_cents',
]);

const forbiddenNestedKeys = new Set([
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'userid',
  'sessionid',
  'customeremail',
  'customerphone',
  'customerid',
  'contact',
  'designdraftcontact',
  'shippingaddress',
  'billingaddress',
  'password',
  'secret',
  'token',
]);

function reply(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...responseHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  if (!entry) return '';
  return String(entry[1] || '').split(',')[0].trim();
}

function requestIsSameOrigin(event) {
  const headers = event?.headers || {};
  const fetchSite = headerValue(headers, 'sec-fetch-site').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const host = headerValue(headers, 'x-forwarded-host') || headerValue(headers, 'host');
  const origin = headerValue(headers, 'origin');
  const referer = headerValue(headers, 'referer');
  const candidate = origin || referer;
  if (!candidate) return true;
  if (!host) return false;

  try {
    const candidateUrl = new URL(candidate);
    if (!['http:', 'https:'].includes(candidateUrl.protocol)) return false;
    if (candidateUrl.host.toLowerCase() !== host.toLowerCase()) return false;
    const forwardedProtocol = headerValue(headers, 'x-forwarded-proto').toLowerCase();
    return !forwardedProtocol || `${forwardedProtocol}:` === candidateUrl.protocol;
  } catch {
    return false;
  }
}

function normalizedKey(key) {
  return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function safeUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_STRING_LENGTH) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeValue(value, key, depth = 0) {
  if (depth > MAX_OBJECT_DEPTH || value == null) return value == null ? value : undefined;
  if (forbiddenNestedKeys.has(normalizedKey(key))) return undefined;

  if (typeof value === 'string') {
    if (/(?:^|_)(?:url)$|Url$/.test(key)) return safeUrl(value) || undefined;
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) return undefined;
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeValue(entry, key, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      const sanitized = sanitizeValue(childValue, childKey, depth + 1);
      if (sanitized !== undefined) result[childKey] = sanitized;
    }
    return result;
  }
  return undefined;
}

function boundedNumber(value, { min, max, integer = false }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return integer ? Math.round(parsed) : parsed;
}

function boundedString(value, maxLength = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function boundedUtf8String(value, maxBytes) {
  if (typeof value !== 'string') return null;
  let result = '';
  let bytes = 0;
  for (const character of value.trim()) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result || null;
}

function sanitizeCartItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;

  const id = boundedString(rawItem.id, 256);
  const productType = boundedString(rawItem.product_type, 128) || 'banner';
  const productDefaults = {
    banner: { material: '13oz', grommets: 'none', polePockets: 'none' },
    yard_sign: { material: 'corrugated', grommets: 'none', polePockets: 'none' },
    car_magnet: { material: 'magnetic', grommets: 'none', polePockets: 'none' },
  };
  const defaults = productDefaults[productType] || productDefaults.banner;
  const material = boundedString(rawItem.material, 128) || defaults.material;
  const grommets = boundedString(rawItem.grommets, 128) || defaults.grommets;
  const polePockets = boundedString(rawItem.pole_pockets, 128) || defaults.polePockets;
  const widthIn = boundedNumber(rawItem.width_in, { min: 0.01, max: 1200 });
  const heightIn = boundedNumber(rawItem.height_in, { min: 0.01, max: 1200 });
  const quantity = boundedNumber(rawItem.quantity, { min: 1, max: 999, integer: true });
  const lineTotalCents = boundedNumber(rawItem.line_total_cents, {
    min: 0,
    max: 100_000_000,
    integer: true,
  });
  if (!id || widthIn == null || heightIn == null || quantity == null || lineTotalCents == null) {
    return null;
  }

  const item = {};
  for (const key of allowedItemKeys) {
    if (!Object.prototype.hasOwnProperty.call(rawItem, key)) continue;
    const sanitized = sanitizeValue(rawItem[key], key, 0);
    if (sanitized !== undefined) item[key] = sanitized;
  }

  item.id = id;
  item.product_type = productType;
  item.material = material;
  item.grommets = grommets;
  item.pole_pockets = polePockets;
  item.width_in = widthIn;
  item.height_in = heightIn;
  item.quantity = quantity;
  item.line_total_cents = lineTotalCents;

  let serialized = JSON.stringify(item);
  for (const optionalKey of oversizedOptionalKeys) {
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_ITEM_BYTES) break;
    delete item[optionalKey];
    serialized = JSON.stringify(item);
  }
  for (const key of Object.keys(item).reverse()) {
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_ITEM_BYTES) break;
    if (essentialItemKeys.has(key)) continue;
    delete item[key];
    serialized = JSON.stringify(item);
  }
  return Buffer.byteLength(serialized, 'utf8') <= MAX_ITEM_BYTES ? item : null;
}

function sanitizeCartItems(cartContents) {
  return prepareCartRecovery(cartContents).items;
}

function parseCartContents(cartContents) {
  let parsed = cartContents;
  if (typeof parsed === 'string') {
    if (Buffer.byteLength(parsed, 'utf8') > MAX_CART_CONTENTS_BYTES) {
      return { valid: false, rawItems: [], reason: 'stored_payload_oversized' };
    }
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { valid: false, rawItems: [], reason: 'stored_payload_invalid' };
    }
  }
  if (!Array.isArray(parsed)) {
    return { valid: false, rawItems: [], reason: 'stored_payload_invalid' };
  }
  return { valid: true, rawItems: parsed, reason: null };
}

function readSnapshotMetadata(rawItems) {
  const first = rawItems[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)
    || !Object.prototype.hasOwnProperty.call(first, SNAPSHOT_METADATA_KEY)) {
    return { present: false, valid: false, value: null };
  }

  const value = first[SNAPSHOT_METADATA_KEY];
  const valid = Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.version === 1
    && Number.isSafeInteger(value.sourceItemCount)
    && value.sourceItemCount >= 0
    && Number.isSafeInteger(value.storedItemCount)
    && value.storedItemCount >= 0
    && typeof value.complete === 'boolean'
  );
  return { present: true, valid, value: valid ? value : null };
}

function responseItemsBytes(items) {
  return Buffer.byteLength(JSON.stringify(items), 'utf8');
}

function stripOptionalArtworkPayloads(item) {
  const result = { ...item };
  for (const key of optionalArtworkPayloadKeys) delete result[key];
  return result;
}

function commerceItemSummary(item) {
  const stringLimits = {
    id: 256,
    product_type: 96,
    material: 96,
    grommets: 96,
    pole_pockets: 96,
    pole_pocket_size: 48,
    pole_pocket_position: 64,
    rounded_corners: 64,
    rope_placement: 64,
    rope_pricing_mode: 48,
    pole_pocket_pricing_mode: 48,
    yard_sign_sidedness: 48,
  };
  const result = {};
  for (const key of commerceItemKeys) {
    if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
    result[key] = Object.prototype.hasOwnProperty.call(stringLimits, key)
      ? boundedUtf8String(item[key], stringLimits[key])
      : item[key];
  }
  return result;
}

function fitRecoveryItems(items) {
  if (responseItemsBytes(items) <= MAX_RESPONSE_ITEMS_BYTES) {
    return { fits: true, items };
  }

  const withoutArtworkPayloads = items.map(stripOptionalArtworkPayloads);
  if (responseItemsBytes(withoutArtworkPayloads) <= MAX_RESPONSE_ITEMS_BYTES) {
    return { fits: true, items: withoutArtworkPayloads };
  }

  const summaries = items.map(commerceItemSummary);
  if (responseItemsBytes(summaries) <= MAX_RESPONSE_ITEMS_BYTES) {
    return { fits: true, items: summaries };
  }

  for (const key of commerceCompactionKeys) {
    for (const summary of summaries) delete summary[key];
    if (responseItemsBytes(summaries) <= MAX_RESPONSE_ITEMS_BYTES) {
      return { fits: true, items: summaries };
    }
  }
  return { fits: false, items: summaries };
}

function prepareCartRecovery(cartContents) {
  const parsed = parseCartContents(cartContents);
  if (!parsed.valid) {
    return {
      items: [],
      completeness: 'incomplete',
      reason: parsed.reason,
      sourceItemCount: null,
      storedItemCount: 0,
    };
  }

  const { rawItems } = parsed;
  const metadata = readSnapshotMetadata(rawItems);
  const storedPayloadBytes = responseItemsBytes(rawItems);
  const candidateItems = rawItems.slice(0, MAX_RECOVERED_ITEMS);
  const sanitizedItems = candidateItems.map(sanitizeCartItem).filter(Boolean);
  const fitted = fitRecoveryItems(sanitizedItems);
  const sourceItemCount = metadata.valid ? metadata.value.sourceItemCount : rawItems.length;

  let completeness = 'complete';
  let reason = null;
  if (rawItems.length > MAX_RECOVERED_ITEMS) {
    completeness = 'incomplete';
    reason = 'stored_item_count_oversized';
  } else if (sanitizedItems.length !== rawItems.length) {
    completeness = 'incomplete';
    reason = 'stored_items_invalid';
  } else if (!fitted.fits) {
    completeness = 'incomplete';
    reason = 'response_budget_exceeded';
  } else if (metadata.present && !metadata.valid) {
    completeness = 'incomplete';
    reason = 'snapshot_metadata_invalid';
  } else if (metadata.valid && (
    metadata.value.complete !== true
    || metadata.value.sourceItemCount !== metadata.value.storedItemCount
    || metadata.value.storedItemCount !== rawItems.length
  )) {
    completeness = 'incomplete';
    reason = 'snapshot_was_truncated';
  } else if (!metadata.present && rawItems.length === MAX_RECOVERED_ITEMS) {
    // Historical snapshots did not record their source count. A row exactly
    // at the old hard limit may be complete or may have been silently sliced;
    // never assert completeness when those states are indistinguishable.
    completeness = 'unknown';
    reason = 'historical_snapshot_at_limit';
  } else if (!metadata.present
    && storedPayloadBytes >= MAX_RESPONSE_ITEMS_BYTES - HISTORICAL_CAPTURE_MAX_ITEM_BYTES) {
    // The legacy capture loop accepted items up to 8 KB and stopped before a
    // 48 KB total. A metadata-less row in this final 8 KB window may have had
    // another source item rejected by that loop, so its completeness cannot
    // be proven even when fewer than 40 lines were stored.
    completeness = 'unknown';
    reason = 'historical_snapshot_near_size_limit';
  }

  return {
    items: fitted.items,
    completeness,
    reason,
    sourceItemCount,
    storedItemCount: rawItems.length,
  };
}

function readToken(event) {
  if (event.httpMethod === 'GET') {
    return String(event.queryStringParameters?.token || '').trim();
  }
  if (Buffer.byteLength(event.body || '', 'utf8') > MAX_REQUEST_BODY_BYTES) return null;
  try {
    const body = JSON.parse(event.body || '{}');
    return typeof body.token === 'string' ? body.token.trim() : '';
  } catch {
    return null;
  }
}

async function findSequenceDiscount(sql, cartId, sequenceNumber) {
  if (sequenceNumber === 1) return null;
  try {
    const deliveryRows = await sql`
      SELECT delivery_discount.code
        FROM cart_recovery_deliveries delivery
        JOIN discount_codes delivery_discount
          ON delivery_discount.cart_id = delivery.abandoned_cart_id
         AND UPPER(delivery_discount.code) = UPPER(delivery.discount_code)
       WHERE delivery.abandoned_cart_id = ${cartId}
         AND delivery.sequence_number = ${sequenceNumber}
         AND delivery.status = 'sent'
         AND delivery_discount.used = FALSE
         AND delivery_discount.expires_at > NOW()
       LIMIT 1
    `;
    if (deliveryRows.length && typeof deliveryRows[0].code === 'string') {
      return deliveryRows[0].code;
    }
  } catch (error) {
    // The email sender creates this additive table before issuing a signed
    // link. During a rolling deploy, fall back to legacy sent-event metadata.
    if (error?.code !== '42P01') throw error;
  }

  const rows = await sql`
    SELECT dc.code
      FROM cart_recovery_logs recovery_email
      JOIN discount_codes dc
        ON dc.cart_id = recovery_email.abandoned_cart_id
       AND UPPER(dc.code) = UPPER(recovery_email.metadata->>'discountCode')
     WHERE recovery_email.abandoned_cart_id = ${cartId}
       AND recovery_email.event_type = 'email_sent'
       AND recovery_email.email_sequence_number = ${sequenceNumber}
       AND dc.used = FALSE
       AND dc.expires_at > NOW()
     ORDER BY recovery_email.created_at DESC
     LIMIT 1
  `;
  return rows.length && typeof rows[0].code === 'string' ? rows[0].code : null;
}

async function recordRecoveryClick(sql, cartId, sequenceNumber, expiresAt) {
  const lockKey = `abandoned-cart-recovery-click:${cartId}:${sequenceNumber}`;
  const metadata = JSON.stringify({
    source: 'signed_recovery_link',
    tokenExpiresAt: new Date(expiresAt * 1000).toISOString(),
  });
  await sql`
    WITH click_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${lockKey})) AS acquired
    ), existing_click AS MATERIALIZED (
      SELECT recovery_log.id
        FROM cart_recovery_logs recovery_log
        CROSS JOIN click_lock
       WHERE recovery_log.abandoned_cart_id = ${cartId}
         AND recovery_log.event_type = 'email_clicked'
         AND recovery_log.email_sequence_number = ${sequenceNumber}
         AND recovery_log.metadata @> ${JSON.stringify({ source: 'signed_recovery_link' })}::jsonb
       LIMIT 1
    ), inserted_click AS (
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id,
        event_type,
        email_sequence_number,
        metadata,
        created_at
      )
      SELECT ${cartId}, 'email_clicked', ${sequenceNumber}, ${metadata}::jsonb, NOW()
        FROM click_lock
       WHERE NOT EXISTS (SELECT 1 FROM existing_click)
      RETURNING id
    )
    SELECT id FROM inserted_click
    UNION ALL
    SELECT id FROM existing_click
    LIMIT 1
  `;
}

function createRecoverAbandonedCartHandler({ createSql = neon, now = () => Date.now() } = {}) {
  return async function handler(event) {
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return reply(405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET, POST' });
    }
    if (!requestIsSameOrigin(event)) {
      return reply(403, { error: 'CROSS_ORIGIN_REQUEST_REJECTED' });
    }

    const token = readToken(event);
    if (token == null) return reply(413, { error: 'REQUEST_TOO_LARGE' });
    if (!token) return reply(400, { error: 'RECOVERY_TOKEN_REQUIRED' });

    let claims;
    try {
      claims = verifyAbandonedCartRecoveryToken(token, { now: now() });
    } catch (error) {
      if (error instanceof RecoveryTokenError && error.code === 'RECOVERY_SECRET_UNAVAILABLE') {
        console.error('[recover-abandoned-cart] Recovery signing secret is not configured');
        return reply(503, { error: 'RECOVERY_UNAVAILABLE' });
      }
      if (error instanceof RecoveryTokenError && error.code === 'RECOVERY_TOKEN_EXPIRED') {
        return reply(410, { error: 'RECOVERY_LINK_EXPIRED' });
      }
      return reply(401, { error: 'INVALID_RECOVERY_LINK' });
    }

    const databaseUrl = process.env.NETLIFY_DATABASE_URL
      || process.env.DATABASE_URL
      || process.env.VITE_DATABASE_URL;
    if (!databaseUrl) {
      console.error('[recover-abandoned-cart] Database is not configured');
      return reply(503, { error: 'RECOVERY_UNAVAILABLE' });
    }

    try {
      const sql = createSql(databaseUrl);
      const rows = await sql`
        SELECT cart_contents, recovery_status
          FROM abandoned_carts
         WHERE id = ${claims.cartId}
         LIMIT 1
      `;
      if (!rows.length) return reply(404, { error: 'RECOVERY_CART_NOT_FOUND' });
      if (!['active', 'abandoned'].includes(rows[0].recovery_status)) {
        return reply(410, { error: 'RECOVERY_CART_CLOSED' });
      }

      const recovery = prepareCartRecovery(rows[0].cart_contents);
      if (recovery.completeness === 'incomplete') {
        return reply(409, {
          success: false,
          complete: false,
          error: 'RECOVERY_CART_INCOMPLETE',
          reason: recovery.reason,
          sourceItemCount: recovery.sourceItemCount,
          storedItemCount: recovery.storedItemCount,
        });
      }
      if (recovery.completeness === 'unknown') {
        return reply(409, {
          success: false,
          complete: null,
          error: 'RECOVERY_CART_COMPLETENESS_UNKNOWN',
          reason: recovery.reason,
          sourceItemCount: recovery.sourceItemCount,
          storedItemCount: recovery.storedItemCount,
        });
      }
      if (!recovery.items.length) return reply(422, { error: 'RECOVERY_CART_EMPTY' });

      const discountCode = await findSequenceDiscount(sql, claims.cartId, claims.sequenceNumber);
      await recordRecoveryClick(sql, claims.cartId, claims.sequenceNumber, claims.expiresAt);

      return reply(200, {
        success: true,
        complete: true,
        // Return only the cart identity already authorized by this signed
        // credential. The browser carries both values into order creation so
        // a recovery opened in a new tab or on another device can retain exact
        // attribution without exposing customer/session ownership data.
        cartId: claims.cartId,
        recoveryToken: token,
        items: recovery.items,
        sourceItemCount: recovery.sourceItemCount,
        storedItemCount: recovery.storedItemCount,
        discountCode,
      });
    } catch (error) {
      console.error('[recover-abandoned-cart] Failed to recover cart:', error?.message || error);
      return reply(500, { error: 'RECOVERY_FAILED' });
    }
  };
}

const handler = createRecoverAbandonedCartHandler();

module.exports = {
  createRecoverAbandonedCartHandler,
  findSequenceDiscount,
  handler,
  recordRecoveryClick,
  prepareCartRecovery,
  requestIsSameOrigin,
  sanitizeCartItem,
  sanitizeCartItems,
};
