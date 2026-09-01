const { neon } = require('@neondatabase/serverless');
const { createHash, randomUUID } = require('crypto');
const { normalizeArtworkManifest } = require('../artwork-manifest.cjs');
const {
  PreviewArtifactValidationError,
  normalizeCartItemPlacement,
} = require('../preview-artifact.cjs');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');
const {
  reconcileSameDayFlags,
  getEasternTimeParts,
} = require('../sameDayService.cjs');
const { addPostTaxServiceFees } = require('../order-total-reconciliation.cjs');
const { validateDiscountForCheckout } = require('../discount-validation.cjs');
const { computeTotals, getFeatureFlags } = require('../checkoutTotals.cjs');
const { runAtomicBatch, isUniqueViolation } = require('../atomic-batch.cjs');
const { repriceStripeCart: repriceCheckoutCart } = require('../stripe-server-pricing.cjs');
const { markAbandonedCartRecovered } = require('../abandoned-cart-order-recovery.cjs');
const { verifyAbandonedCartRecoveryToken } = require('../abandoned-cart-recovery-token.cjs');

let orderSchemaReadyPromise = null;

// Stripe is the only checkout path that calls this module in-process. A
// Symbol cannot be recreated through JSON, so a browser cannot forge the
// trusted mode or mark a live charge as a preview/test order.
const TRUSTED_STRIPE_CONTEXT = Symbol('trusted-stripe-create-order-context');

function createTrustedStripeContext(mode) {
  if (!['test', 'live'].includes(mode)) {
    throw new TypeError('Trusted Stripe mode must be test or live.');
  }
  return Object.freeze({ [TRUSTED_STRIPE_CONTEXT]: mode });
}

function ensureOrderSchemaOnce(migrate) {
  if (!orderSchemaReadyPromise) {
    orderSchemaReadyPromise = Promise.resolve()
      .then(migrate)
      .catch((error) => {
        // A transient migration failure must be visible to the request and
        // retryable by a later invocation; never mark a failed schema ready.
        orderSchemaReadyPromise = null;
        throw error;
      });
  }
  return orderSchemaReadyPromise;
}

// Guard: only treat a value as a "real" authenticated user id if it is a
// proper non-zero UUID. Placeholder values like the all-zero UUID, the
// literal string "guest", empty strings, etc. are NOT real user ids and
// MUST be ignored — otherwise we throw "User <id> not found in database"
// for every guest checkout.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRealUserId(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v === 'guest' || v.startsWith('guest-') || v.startsWith('guest_')) return false;
  if (!_UUID_RE.test(v)) return false;
  if (v.replace(/-/g, '').replace(/0/g, '') === '') return false; // all-zero UUID
  if (v === '00000000-0000-0000-0000-000000000001') return false; // observed placeholder
  return true;
}

function normalizedUuid(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (!_UUID_RE.test(candidate)) return null;
  if (!candidate.replace(/-/g, '').replace(/0/g, '')) return null;
  return candidate;
}

function normalizedCartSessionId(value) {
  const sessionId = typeof value === 'string' ? value.trim() : '';
  if (!sessionId || sessionId.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) return null;
  return sessionId;
}

function normalizedOrderAbandonedCartSessionId(orderData) {
  if (orderData?.is_test_order === true) return null;
  return normalizedCartSessionId(
    orderData?.abandonedCartSessionId || orderData?.abandoned_cart_session_id,
  );
}

async function resolveAbandonedCartLink(sql, {
  cartId,
  sessionId,
  userId,
  email,
  recoveryToken,
  isTestOrder,
}) {
  if (isTestOrder) return null;
  const submittedCartId = normalizedUuid(cartId);
  if (!submittedCartId) return null;
  const submittedSessionId = normalizedCartSessionId(sessionId);
  const resolvedUserId = normalizedUuid(userId);
  const emailCandidate = String(email || '').trim().toLowerCase();
  const normalizedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate)
    ? emailCandidate
    : null;
  const submittedRecoveryToken = typeof recoveryToken === 'string' ? recoveryToken.trim() : '';
  let tokenAuthorizesExactCart = false;
  if (submittedRecoveryToken) {
    try {
      const claims = verifyAbandonedCartRecoveryToken(submittedRecoveryToken);
      // A valid token for any other cart is an authorization failure, never a
      // reason to fall through to weaker browser-provided identity hints.
      if (normalizedUuid(claims.cartId) !== submittedCartId) return null;
      tokenAuthorizesExactCart = true;
    } catch {
      return null;
    }
  }
  if (!tokenAuthorizesExactCart && !resolvedUserId && !submittedSessionId && !normalizedEmail) return null;

  try {
    const rows = await sql`
      SELECT id
        FROM abandoned_carts
       WHERE id = ${submittedCartId}::uuid
         AND recovery_status IN ('active', 'abandoned')
         AND (
           ${tokenAuthorizesExactCart}
           OR (${resolvedUserId}::uuid IS NOT NULL AND user_id = ${resolvedUserId}::uuid)
           OR (${submittedSessionId}::text IS NOT NULL AND session_id = ${submittedSessionId})
           OR (${normalizedEmail}::text IS NOT NULL
               AND LOWER(BTRIM(email)) = ${normalizedEmail})
         )
       LIMIT 1
    `;
    return rows[0]?.id ? String(rows[0].id) : null;
  } catch (error) {
    if (['42P01', '42703'].includes(String(error?.code || ''))) {
      console.warn('[create-order] abandoned-cart link schema is unavailable; continuing without attribution');
      return null;
    }
    throw error;
  }
}

function isSecureCheckoutKey(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9_-]{32,200}$/.test(value.trim());
}

function canonicalQuoteForCheckout(items, orderData) {
  return {
    items: (items || []).map((item, index) => ({
      index,
      cartItemId: cleanText(item?.id, 160),
      productType: item?.product_type || 'banner',
      unitPriceCents: Number(item?.unit_price_cents || 0),
      lineTotalCents: Number(item?.line_total_cents || 0),
      ropeFeet: Number(item?.rope_feet || 0),
      ropeCostCents: Number(item?.rope_cost_cents || 0),
      polePocketCostCents: Number(item?.pole_pocket_cost_cents || 0),
      yardSignSignsSubtotalCents: Number(item?.yard_sign_signs_subtotal_cents || 0),
      yardSignStakesSubtotalCents: Number(item?.yard_sign_stakes_subtotal_cents || 0),
    })),
    subtotalCents: Number(orderData?.subtotal_cents || 0),
    taxCents: Number(orderData?.tax_cents || 0),
    shippingCents: Number(orderData?.shipping_cents || 0),
    totalCents: Number(orderData?.total_cents || 0),
    appliedDiscountCents: Number(orderData?.applied_discount_cents || 0),
    appliedDiscountLabel: orderData?.applied_discount_label || '',
    appliedDiscountType: orderData?.applied_discount_type || 'none',
    discountCode: orderData?.discountCode?.code || null,
    sameDayFeeCents: Number(orderData?.same_day_fee_cents || 0),
    saturdayFeeCents: Number(orderData?.saturday_fee_cents || 0),
  };
}

async function revalidateRecoveryDiscountForCanonicalIdentity(sql, {
  discount,
  userEmail,
  userId,
  checkoutKey,
  recoveryCartId,
}) {
  if (!discount?.code || discount.recoveryOffer !== true) {
    return { valid: true, discount };
  }
  return validateDiscountForCheckout({
    sql,
    code: discount.code,
    email: userEmail,
    userId,
    checkoutKey,
    recoveryCartId,
    requireRecoveryEmailMatch: true,
    requireRecoveryCartMatch: true,
  });
}

// Helper to detect bad URLs (blob:, data:, or huge strings)

function cleanText(value, max = 1000) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function normalizeAttribution(input) {
  const a = input && typeof input === 'object' ? input : {};
  return {
    google_click_id: cleanText(a.google_click_id || a.gclid, 255),
    gbraid: cleanText(a.gbraid, 255),
    wbraid: cleanText(a.wbraid, 255),
    landing_page: cleanText(a.landing_page, 1000),
    referrer: cleanText(a.referrer, 1000),
    utm_source: cleanText(a.utm_source, 255),
    utm_medium: cleanText(a.utm_medium, 255),
    utm_campaign: cleanText(a.utm_campaign, 255),
    utm_term: cleanText(a.utm_term, 255),
    utm_content: cleanText(a.utm_content, 255),
    consent_status: cleanText(a.consent_status, 255) || 'unknown',
  };
}

function safeOrderLogSummary(orderData) {
  const order = orderData && typeof orderData === 'object' ? orderData : {};
  return {
    paymentMethod: String(order.payment_method || 'unspecified').slice(0, 40),
    paymentStatus: String(order.payment_status || 'unspecified').slice(0, 40),
    itemCount: Array.isArray(order.items) ? order.items.length : 0,
    hasUserId: Boolean(order.user_id),
    hasCustomerEmail: Boolean(order.email),
    hasShippingAddress: Boolean(order.shipping_street || order.shippingAddress),
    hasDiscountCode: Boolean(order.discountCode?.code),
    sameDayRequested: order.sameDayHitService === true,
    saturdayRequested: order.saturdayDelivery === true,
  };
}

function isBadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
}

// Clean item of any bad URLs before database insert
function cleanItemForDb(item) {
  const cleaned = { ...item };
  
  // Clean direct URL fields
  if (isBadUrl(cleaned.file_url)) cleaned.file_url = null;
  if (isBadUrl(cleaned.thumbnail_url)) cleaned.thumbnail_url = null;
  if (isBadUrl(cleaned.web_preview_url)) cleaned.web_preview_url = null;
  if (isBadUrl(cleaned.print_ready_url)) cleaned.print_ready_url = null;
  
  // Clean overlay_image
  if (cleaned.overlay_image && typeof cleaned.overlay_image === 'object') {
    const oi = { ...cleaned.overlay_image };
    if (isBadUrl(oi.url)) oi.url = null;
    if (isBadUrl(oi.originalUrl)) oi.originalUrl = null;
    if (isBadUrl(oi.thumbnailUrl)) oi.thumbnailUrl = null;
    cleaned.overlay_image = oi;
  }
  
  // Clean overlay_images array
  if (Array.isArray(cleaned.overlay_images)) {
    cleaned.overlay_images = cleaned.overlay_images.map(img => {
      if (!img || typeof img !== 'object') return img;
      const ci = { ...img };
      if (isBadUrl(ci.url)) ci.url = null;
      if (isBadUrl(ci.originalUrl)) ci.originalUrl = null;
      if (isBadUrl(ci.thumbnailUrl)) ci.thumbnailUrl = null;
      return ci;
    });
  }
  if (cleaned.canvas_state_json) {
    try {
      const scene = typeof cleaned.canvas_state_json === 'string' ? JSON.parse(cleaned.canvas_state_json) : cleaned.canvas_state_json;
      if (isBadUrl(scene.previewUrl)) delete scene.previewUrl;
      cleaned.canvas_state_json = JSON.stringify(scene);
    } catch {
      // validatePrintSceneV2 provides the caller-facing parse error.
    }
  }
  
  return cleaned;
}

function validatePrintSceneV2(canvasStateJson) {
  if (!canvasStateJson) return null;
  let scene;
  try {
    scene = typeof canvasStateJson === 'string' ? JSON.parse(canvasStateJson) : canvasStateJson;
  } catch (err) {
    throw new Error('Invalid canvas_state_json: ' + err.message);
  }
  if (!scene || scene.sceneVersion !== 2) return null;
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  for (const obj of objects) {
    if (!obj || obj.visible === false || obj.type !== 'image') continue;
    const source = obj.source || {};
    const url = source.originalUrl;
    if (!url || typeof url !== 'string') {
      throw new Error(`Version 2 print scene image ${obj.id || '(unknown)'} is missing a permanent production source URL.`);
    }
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      throw new Error(`Version 2 print scene image ${obj.id || '(unknown)'} contains a temporary production source URL.`);
    }
    if (!source.publicId) {
      throw new Error(`Version 2 print scene image ${obj.id || '(unknown)'} is missing a production public ID.`);
    }
  }
  return scene;
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numericValue(value, fallback = 0) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(value) {
  if (value === false || value === 0 || value === null || value === undefined) return false;
  if (typeof value === 'string' && ['false', '0', 'none', 'no', 'off', ''].includes(value.trim().toLowerCase())) return false;
  return true;
}

function itemSignatureProjection(item) {
  const polePockets = booleanValue(item.pole_pockets)
    && item.pole_pockets !== 'none'
    && item.pole_pockets !== 'false';

  return {
    product_type: item.product_type || 'banner',
    width_in: numericValue(item.width_in),
    height_in: numericValue(item.height_in),
    quantity: numericValue(item.quantity, 1),
    material: item.material || '13oz',
    grommets: item.grommets || 'none',
    rounded_corners: item.rounded_corners || null,
    rope_feet: numericValue(item.rope_feet),
    rope_placement: item.rope_placement || null,
    pole_pockets: polePockets,
    pole_pocket_position: item.pole_pocket_position || null,
    pole_pocket_size: item.pole_pocket_size || null,
    pole_pocket_cost_cents: numericValue(item.pole_pocket_cost_cents),
    line_total_cents: numericValue(item.line_total_cents),
    file_key: item.file_key || null,
    file_name: item.file_name || item.artwork_manifest?.originalFilename || null,
    file_url: item.file_url || null,
    artwork_manifest: canonicalJson(item.artwork_manifest),
    placement_preview: canonicalJson(item.placement_preview),
    original_filename: item.artwork_manifest?.originalFilename || item.file_name || null,
    print_ready_url: item.print_ready_url || null,
    web_preview_url: item.web_preview_url || null,
    text_elements: canonicalJson(item.text_elements, []),
    overlay_image: canonicalJson(item.overlay_image),
    overlay_images: canonicalJson(item.overlay_images),
    canvas_background_color: item.canvas_background_color || '#FFFFFF',
    image_scale: numericValue(item.image_scale, 1),
    image_position: canonicalJson(item.image_position, { x: 0, y: 0 }),
    thumbnail_url: item.thumbnail_url || null,
    final_render_url: item.final_render_url || null,
    final_render_file_key: item.final_render_file_key || null,
    final_render_width_px: item.final_render_width_px == null ? null : numericValue(item.final_render_width_px),
    final_render_height_px: item.final_render_height_px == null ? null : numericValue(item.final_render_height_px),
    final_render_dpi: item.final_render_dpi == null ? null : numericValue(item.final_render_dpi),
    canvas_state_json: canonicalJson(item.canvas_state_json),
    design_service_enabled: booleanValue(item.design_service_enabled),
    design_request_text: item.design_request_text || null,
    design_draft_preference: item.design_draft_preference || null,
    design_draft_contact: item.design_draft_contact || null,
    design_uploaded_assets: canonicalJson(item.design_uploaded_assets, []),
    yard_sign_sidedness: item.yard_sign_sidedness ?? null,
    yard_sign_step_stakes_enabled: booleanValue(item.yard_sign_step_stakes_enabled),
    yard_sign_step_stakes_qty: numericValue(item.yard_sign_step_stakes_qty),
    yard_sign_design_count: numericValue(item.yard_sign_design_count),
    yard_sign_designs: canonicalJson(item.yard_sign_designs),
    yard_sign_signs_subtotal_cents: numericValue(item.yard_sign_signs_subtotal_cents),
    yard_sign_stakes_subtotal_cents: numericValue(item.yard_sign_stakes_subtotal_cents),
  };
}

function prepareOrderItems(rawItems) {
  if (rawItems === undefined || rawItems === null) return [];
  if (!Array.isArray(rawItems)) {
    const error = new TypeError('Order items must be an array.');
    error.code = 'ORDER_ITEMS_INVALID';
    throw error;
  }

  return rawItems.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      const error = new TypeError(`Order item ${index + 1} must be an object.`);
      error.code = 'ORDER_ITEM_INVALID';
      throw error;
    }

    validatePrintSceneV2(rawItem.canvas_state_json);
    const item = normalizeCartItemPlacement(cleanItemForDb(rawItem));
    item.artwork_manifest = normalizeArtworkManifest(item);

    const quantity = Number(item.quantity ?? 1);
    const lineTotalCents = Number(item.line_total_cents ?? 0);
    const width = Number(item.width_in ?? 0);
    const height = Number(item.height_in ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0
      || !Number.isFinite(lineTotalCents) || lineTotalCents < 0
      || !Number.isFinite(width) || width < 0
      || !Number.isFinite(height) || height < 0) {
      const error = new TypeError(`Order item ${index + 1} has invalid numeric values.`);
      error.code = 'ORDER_ITEM_INVALID';
      throw error;
    }

    item.quantity = quantity;
    item.line_total_cents = lineTotalCents;
    item.width_in = width;
    item.height_in = height;
    item.pole_pockets = booleanValue(item.pole_pockets);
    item.design_service_enabled = booleanValue(item.design_service_enabled);
    item.yard_sign_step_stakes_enabled = booleanValue(item.yard_sign_step_stakes_enabled);

    return item;
  });
}

function buildItemSignature(items) {
  const payload = items.map(itemSignatureProjection);
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function idempotencyConflict(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  error.details = details;
  return error;
}

async function findExistingOrderByIdentity(sql, orderData) {
  const candidates = [];

  if (orderData.checkout_idempotency_key) {
    candidates.push(...await sql`
      SELECT * FROM orders
      WHERE checkout_idempotency_key = ${orderData.checkout_idempotency_key}
      LIMIT 2
    `);
  }
  if (orderData.paypal_order_id || orderData.paypal_capture_id) {
    candidates.push(...await sql`
      SELECT * FROM orders
      WHERE (${orderData.paypal_order_id || null} IS NOT NULL AND paypal_order_id = ${orderData.paypal_order_id || null})
         OR (${orderData.paypal_capture_id || null} IS NOT NULL AND paypal_capture_id = ${orderData.paypal_capture_id || null})
      LIMIT 2
    `);
  }
  if (orderData.stripe_payment_intent_id) {
    candidates.push(...await sql`
      SELECT * FROM orders
      WHERE stripe_payment_intent_id = ${orderData.stripe_payment_intent_id}
      LIMIT 2
    `);
  }

  const distinct = [...new Map(candidates.map((order) => [String(order.id), order])).values()];
  if (distinct.length > 1) {
    throw idempotencyConflict(
      'ORDER_IDEMPOTENCY_IDENTITY_CONFLICT',
      'The submitted payment identifiers are already bound to different orders.',
      { orderIds: distinct.map((order) => order.id) },
    );
  }
  return distinct[0] || null;
}

async function verifyExistingOrderMatches(sql, existingOrder, expectedOrder, expectedItemCount, expectedItemSignature) {
  const countRows = await sql`
    SELECT COUNT(*)::integer AS item_count
    FROM order_items
    WHERE order_id = ${existingOrder.id}
  `;
  const actualItemCount = Number(countRows[0]?.item_count ?? -1);
  const storedItemCount = Number(existingOrder.expected_item_count ?? -1);
  const storedItemSignature = String(existingOrder.item_signature || '');
  const existingStatus = String(existingOrder.status || '');
  const expectedStatus = String(expectedOrder.status || '');
  const statusMatches = existingStatus === expectedStatus
    || (expectedStatus === 'pending'
      && ['paid', 'in_production', 'shipped', 'delivered', 'refunded'].includes(existingStatus));

  if (storedItemCount < 0 || !storedItemSignature) {
    throw idempotencyConflict(
      'ORDER_IDEMPOTENCY_UNVERIFIED',
      'An older matching order exists but has no item-integrity metadata; it cannot be returned as a safe retry.',
      { orderId: existingOrder.id, actualItemCount, expectedItemCount },
    );
  }
  if (storedItemCount !== expectedItemCount
    || actualItemCount !== expectedItemCount
    || storedItemSignature !== expectedItemSignature
    || Number(existingOrder.total_cents) !== Number(expectedOrder.total_cents)
    || String(existingOrder.email || '').toLowerCase() !== String(expectedOrder.email || '').toLowerCase()
    || !statusMatches) {
    throw idempotencyConflict(
      'ORDER_IDEMPOTENCY_PAYLOAD_CONFLICT',
      'The idempotency key is already bound to a different or incomplete order payload.',
      {
        orderId: existingOrder.id,
        actualItemCount,
        storedItemCount,
        expectedItemCount,
      },
    );
  }

  return existingOrder;
}

function isDeployPreviewEnvironment() {
  return process.env.CONTEXT === 'deploy-preview'
    || /^https:\/\/deploy-preview-\d+--.+\.netlify\.app$/i.test(process.env.DEPLOY_PRIME_URL || '');
}

function applyAdminDeployPreviewTestOrder(orderData) {
  const isDeployPreview = isDeployPreviewEnvironment();
  if (!isDeployPreview) {
    const error = new Error('Deploy Preview test checkout is only available in Netlify Deploy Previews.');
    error.code = 'ADMIN_TEST_ORDER_NOT_AUTHORIZED';
    error.isDeployPreview = false;
    throw error;
  }

  orderData.payment_method = 'admin_deploy_preview_test';
  orderData.payment_status = 'paid';
  orderData.is_test_order = true;
  orderData.test_order_reason = 'Admin no-payment checkout from Netlify Deploy Preview';
  orderData.paypal_order_id = null;
  orderData.paypal_capture_id = null;
  orderData.stripe_payment_intent_id = null;
  orderData.user_id = null;
  orderData.email = orderData.email || 'admin-preview-test@bannersonthefly.local';
  return orderData;
}

function applySandboxPayPalTestOrder(orderData) {
  const paypalEnvironment = String(process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
  const paymentMethod = String(orderData.payment_method || '').trim().toLowerCase();
  if (paymentMethod !== 'paypal') return orderData;

  // Test-order classification is server authority. A public live PayPal
  // request must never be able to hide a captured order, skip discount
  // reservation, or bypass recovery bookkeeping by submitting this flag.
  if (paypalEnvironment === 'live') {
    orderData.is_test_order = false;
    orderData.test_order_reason = null;
    return orderData;
  }

  orderData.is_test_order = true;
  orderData.test_order_reason = `PayPal ${paypalEnvironment || 'sandbox'} environment`;
  return orderData;
}

function resolveAuthorizedOrderStatus(orderData, { allowDirectPaid = false } = {}) {
  if (orderData?.payment_status === 'pending') return 'pending';
  if (allowDirectPaid) return 'paid';
  return null;
}

function normalizeCustomerName(name) {
  const fullName = String(name || '').trim().replace(/\s+/g, ' ');
  const firstName = fullName ? fullName.split(' ')[0] : null;
  return { fullName: fullName || null, firstName };
}

function applyAuthoritativeOrderTotals(orderData) {
  const flags = getFeatureFlags();
  const totals = computeTotals(orderData.items || [], 0.06, {
    freeShipping: flags.freeShipping,
    minFloorCents: !flags.minOrderFloor ? 0 : flags.minOrderCents,
    shippingMethodLabel: flags.shippingMethodLabel,
  }, orderData.discountCode || null);

  orderData.subtotal_cents = totals.adjusted_subtotal_cents;
  orderData.tax_cents = totals.tax_cents;
  orderData.total_cents = totals.total_cents;
  orderData.min_order_adjustment_cents = totals.min_order_adjustment_cents;
  orderData.shipping_cents = totals.shipping_cents;
  orderData.applied_discount_cents = totals.applied_discount_cents || 0;
  orderData.applied_discount_type = totals.applied_discount_type || 'none';
  if (totals.applied_discount_type === 'quantity') {
    const percentage = Math.round(totals.applied_discount_rate * 100);
    orderData.applied_discount_label = `Qty Discount (${percentage}% off)`;
  } else if (totals.applied_discount_type === 'promo') {
    orderData.applied_discount_label = `Promo: ${orderData.discountCode?.code || 'Applied'}`;
  } else {
    orderData.applied_discount_label = '';
  }
  return totals;
}




// Send order confirmation email by calling notify-order function
async function sendOrderConfirmationEmail(orderId) {
  const payload = JSON.stringify({ orderId });
  const originCandidates = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_URL,
    process.env.PUBLIC_SITE_URL,
    'https://bannersonthefly.com',
    'https://www.bannersonthefly.com',
  ].filter(Boolean);

  let lastError = null;

  for (const origin of originCandidates) {
    const notifyUrl = `${String(origin).replace(/\/$/, '')}/.netlify/functions/notify-order`;
    try {
      console.log('[create-order] notify-order start', { orderId, notifyUrl });
      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const rawBody = await response.text();
      let result = {};
      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        result = { rawBody };
      }

      console.log('[create-order] notify-order response', {
        orderId,
        notifyUrl,
        status: response.status,
        ok: response.ok,
        result,
      });

      if (response.ok && result.ok) {
        return { ok: true, id: result.id, notifyUrl };
      }

      lastError = new Error(result.error || `notify-order failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
      console.error('[create-order] notify-order request failed', {
        orderId,
        notifyUrl,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: false,
    error: lastError?.message || 'Email send failed',
  };
}

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let orderData = null;

  try {
    // Check if database URL is available
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL or DATABASE_URL environment variable not set'
        }),
      };
    }
    // Construct the Neon client only after configuration has been checked.
    // Import-time connection creation made every consumer of this shared
    // module (including Stripe OPTIONS/config smoke paths) crash before it
    // could return a controlled fail-closed response when the variable was
    // absent. The connection remains request-local and Neon HTTP itself is
    // stateless; all existing order queries below use this same `sql` value.
    const sql = neon(databaseUrl);

    orderData = JSON.parse(event.body);
    const trustedStripeMode = context && context[TRUSTED_STRIPE_CONTEXT];
    const requestedPaymentMethod = String(orderData.payment_method || '').trim().toLowerCase();
    const isPayPalPendingCheckout = !trustedStripeMode
      && requestedPaymentMethod === 'paypal'
      && orderData.payment_status === 'pending';
    const submittedExpectedTotalCents = isPayPalPendingCheckout
      ? Number(orderData.total_cents)
      : null;
    if (isPayPalPendingCheckout && !isSecureCheckoutKey(orderData.checkout_idempotency_key)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'CHECKOUT_KEY_INVALID',
          message: 'Secure checkout could not be initialized. Refresh checkout and try again.',
        }),
      };
    }
    if (!trustedStripeMode && (requestedPaymentMethod === 'stripe' || orderData.stripe_payment_intent_id)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'STRIPE_CREATE_ORDER_NOT_AUTHORIZED',
          message: 'Stripe orders must be created by the verified payment endpoint.',
        }),
      };
    }
    if (trustedStripeMode) {
      orderData.payment_method = 'stripe';
      orderData.payment_status = 'pending';
      orderData.is_test_order = trustedStripeMode === 'test';
      orderData.test_order_reason = trustedStripeMode === 'test'
        ? 'Stripe test-mode checkout'
        : null;
      orderData.paypal_order_id = null;
      orderData.paypal_capture_id = null;
      orderData.stripe_payment_intent_id = null;
    }
    const isAdminDeployPreviewTest = orderData.checkout_mode === 'admin_deploy_preview_test';
    if (isAdminDeployPreviewTest) {
      try {
        applyAdminDeployPreviewTestOrder(orderData);
      } catch (authError) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: authError.code || 'ADMIN_TEST_ORDER_NOT_AUTHORIZED',
            message: 'Deploy Preview environment is required for test checkout.',
            details: {
              isDeployPreview: Boolean(authError.isDeployPreview),
            },
          }),
        };
      }
    }
    // Browser input is never evidence that money moved. Stripe and PayPal
    // both create a pending order first, then their provider-verified
    // finalizers transition that same row to paid. The only direct paid write
    // retained here is the explicitly authorized, non-production Deploy
    // Preview test path above.
    const requestedStatus = resolveAuthorizedOrderStatus(orderData, {
      allowDirectPaid: isAdminDeployPreviewTest,
    });
    if (!requestedStatus) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'PAYMENT_ORDER_CREATION_NOT_AUTHORIZED',
          message: 'Paid orders must be created by an authoritative payment finalizer.',
        }),
      };
    }
    applySandboxPayPalTestOrder(orderData);

    try {
      // Normalize and validate every item before constructing any transactional
      // query. The same prepared objects drive totals, signatures and inserts.
      orderData.items = prepareOrderItems(orderData.items);
      if (trustedStripeMode || isPayPalPendingCheckout) {
        // The browser supplies product configuration, never price authority.
        // Both provider paths use the same registry-backed calculator before
        // any order row or provider amount can be created.
        orderData.items = repriceCheckoutCart(orderData.items);
      }
    } catch (error) {
      if (error instanceof PreviewArtifactValidationError) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            ok: false,
            error: error.code,
            message: error.message,
            details: error.details,
          }),
        };
      }
      if (error.code === 'ORDER_ITEMS_INVALID'
          || error.code === 'ORDER_ITEM_INVALID'
          || error?.name === 'StripePricingError') {
        return {
          statusCode: error?.statusCode || 400,
          headers,
          body: JSON.stringify({
            ok: false,
            error: error.code,
            message: error.message,
            ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}),
          }),
        };
      }
      throw error;
    }

    await ensureOrderSchemaOnce(async () => {
    // AUTO-MIGRATE: Ensure text_elements and overlay_image columns exist before processing order
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS text_elements JSONB DEFAULT '[]'::jsonb
      `;
      console.log('✅ Database migration: text_elements column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS is_test_order BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS test_order_reason TEXT
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_orders_is_test_order
          ON orders(is_test_order)
          WHERE is_test_order = TRUE
      `;
      console.log('✅ Database migration: test order columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Test order columns migration warning:', migrationError.message);
      throw migrationError;
    }
    
    // Add shipping address columns to orders table
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_name TEXT,
        ADD COLUMN IF NOT EXISTS customer_first_name TEXT,
        ADD COLUMN IF NOT EXISTS shipping_name TEXT,
        ADD COLUMN IF NOT EXISTS shipping_street TEXT,
        ADD COLUMN IF NOT EXISTS shipping_street2 TEXT,
        ADD COLUMN IF NOT EXISTS shipping_city TEXT,
        ADD COLUMN IF NOT EXISTS shipping_state TEXT,
        ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
        ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US'
      `;
      console.log('✅ Database migration: shipping address columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Shipping address migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Add discount columns to orders table
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS applied_discount_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS applied_discount_label TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS applied_discount_type TEXT DEFAULT 'none'
      `;
      console.log('✅ Database migration: discount columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Discount columns migration warning:', migrationError.message);
      throw migrationError;
    }
    
    // AUTO-MIGRATE: Add Same-Day Hit Service columns to orders table
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS same_day_hit_service BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS saturday_delivery BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS same_day_fee_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS saturday_fee_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS order_timestamp_et TEXT,
        ADD COLUMN IF NOT EXISTS same_day_qualified BOOLEAN DEFAULT FALSE
      `;
      console.log('✅ Database migration: same-day hit service columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Same-day hit service migration warning:', migrationError.message);
      throw migrationError;
    }


    // AUTO-MIGRATE: Attribution columns used by server-side conversion fallback.
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS google_click_id TEXT,
        ADD COLUMN IF NOT EXISTS gbraid TEXT,
        ADD COLUMN IF NOT EXISTS wbraid TEXT,
        ADD COLUMN IF NOT EXISTS landing_page TEXT,
        ADD COLUMN IF NOT EXISTS referrer TEXT,
        ADD COLUMN IF NOT EXISTS utm_source TEXT,
        ADD COLUMN IF NOT EXISTS utm_medium TEXT,
        ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
        ADD COLUMN IF NOT EXISTS utm_term TEXT,
        ADD COLUMN IF NOT EXISTS utm_content TEXT,
        ADD COLUMN IF NOT EXISTS consent_status TEXT
      `;
      console.log('✅ Database migration: attribution columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Attribution columns migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Stripe payment columns. The dedicated migration file
    // (database-migrations/add-stripe-columns.sql) may not have been
    // applied on every environment. Without these columns, the INSERT
    // below fails with `column "payment_method" does not exist` and the
    // Stripe pending-order create returns the generic "Failed to create
    // order" we were debugging. Idempotent / safe to run on every call.
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
        ADD COLUMN IF NOT EXISTS payment_method TEXT
      `;
      // Unique index for PaymentIntent dedupe (matches add-stripe-columns.sql).
      try {
        await sql`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id
            ON orders(stripe_payment_intent_id)
            WHERE stripe_payment_intent_id IS NOT NULL
        `;
      } catch (idxErr) {
        console.warn('⚠️ stripe_payment_intent_id index migration warning:', idxErr.message);
        throw idxErr;
      }
      console.log('✅ Database migration: stripe_payment_intent_id + payment_method columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Stripe columns migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: PayPal identifiers must be unique so duplicate PayPal
    // callbacks, refreshes, or webhook retries return the same website order
    // instead of creating duplicate paid orders/conversions.
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS paypal_order_id TEXT,
        ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT,
        ADD COLUMN IF NOT EXISTS expected_item_count INTEGER,
        ADD COLUMN IF NOT EXISTS item_signature TEXT,
        ADD COLUMN IF NOT EXISTS abandoned_cart_id UUID,
        ADD COLUMN IF NOT EXISTS abandoned_cart_session_id TEXT
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id
          ON orders(paypal_order_id)
          WHERE paypal_order_id IS NOT NULL
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_orders_abandoned_cart_session_created_at
          ON orders(abandoned_cart_session_id, created_at DESC)
          WHERE abandoned_cart_session_id IS NOT NULL
      `;
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS checkout_idempotency_key TEXT,
        ADD COLUMN IF NOT EXISTS payment_reconciliation_status TEXT DEFAULT 'not_required'
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_idempotency_key ON orders(checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_capture_id
          ON orders(paypal_capture_id)
          WHERE paypal_capture_id IS NOT NULL
      `;
      console.log('✅ Database migration: PayPal order/capture unique indexes verified/created');
    } catch (migrationError) {
      console.warn('⚠️ PayPal identifier migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Stripe charge id + wallet type columns. Mirrors
    // database-migrations/add-stripe-charge-id.sql so finalize/webhook
    // can persist the underlying charge id (for Stripe-dashboard ↔
    // admin lookups) and the wallet type (apple_pay / google_pay /
    // link / null) without requiring an out-of-band schema deploy.
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_wallet_type TEXT,
        ADD COLUMN IF NOT EXISTS customer_phone TEXT
      `;
      try {
        await sql`
          CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge_id
            ON orders(stripe_charge_id)
            WHERE stripe_charge_id IS NOT NULL
        `;
      } catch (idxErr) {
        console.warn('⚠️ stripe_charge_id index migration warning:', idxErr.message);
        throw idxErr;
      }
      console.log('✅ Database migration: stripe_charge_id + stripe_wallet_type columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Stripe charge/wallet columns migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS overlay_image JSONB DEFAULT NULL, ADD COLUMN IF NOT EXISTS overlay_images JSONB DEFAULT NULL, ADD COLUMN IF NOT EXISTS canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF' 
      `;
      console.log('✅ Database migration: overlay_image column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Ensure pole pocket columns exist
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_position TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: pole_pocket_position column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS rope_placement TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: rope_placement column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_size TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: pole_pocket_size column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_cost_cents INTEGER DEFAULT 0
      `;
      console.log('✅ Database migration: pole_pocket_cost_cents column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS rounded_corners TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: rounded_corners column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Ensure final_render columns exist (added for print-pipeline fix)
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS final_render_url TEXT,
        ADD COLUMN IF NOT EXISTS final_render_file_key TEXT,
        ADD COLUMN IF NOT EXISTS final_render_width_px INTEGER,
        ADD COLUMN IF NOT EXISTS final_render_height_px INTEGER,
        ADD COLUMN IF NOT EXISTS final_render_dpi INTEGER,
        ADD COLUMN IF NOT EXISTS canvas_state_json TEXT
      `;
      console.log('✅ Database migration: final_render + canvas_state_json columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ final_render/canvas_state migration warning:', migrationError.message);
      throw migrationError;
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS artwork_manifest JSONB,
        ADD COLUMN IF NOT EXISTS placement_preview JSONB,
        ADD COLUMN IF NOT EXISTS production_pdf_status TEXT DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS production_pdf_error TEXT,
        ADD COLUMN IF NOT EXISTS original_filename TEXT
      `;
    } catch (migrationError) {
      console.warn('Artwork manifest migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Ensure image_scale, image_position, thumbnail_url columns exist
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS image_scale NUMERIC DEFAULT 1,
        ADD COLUMN IF NOT EXISTS image_position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb,
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT
      `;
      console.log('✅ Database migration: image_scale, image_position, thumbnail_url columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ image_scale/image_position/thumbnail_url migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Ensure product_type column exists (Phase 1 product-type registry)
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'banner'
      `;
      console.log('✅ Database migration: product_type column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ product_type migration warning:', migrationError.message);
      throw migrationError;
    }

    // AUTO-MIGRATE: Ensure yard sign metadata columns exist
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS yard_sign_sidedness TEXT,
        ADD COLUMN IF NOT EXISTS yard_sign_step_stakes_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS yard_sign_step_stakes_qty INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS yard_sign_design_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS yard_sign_designs JSONB,
        ADD COLUMN IF NOT EXISTS yard_sign_signs_subtotal_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS yard_sign_stakes_subtotal_cents INTEGER DEFAULT 0
      `;
      console.log('✅ Database migration: yard sign columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ yard sign columns migration warning:', migrationError.message);
      throw migrationError;
    }
    });
    
    console.log('Creating order:', safeOrderLogSummary(orderData));
    console.log('Database URL available:', !!databaseUrl);
    console.log('📦 Items received:', orderData.items?.length || 0);
    if (orderData.items && orderData.items.length > 0) {
      orderData.items.forEach((item, index) => {
        console.log(`[CREATE_ORDER_DEBUG] Item ${index + 1}:`, {
          product_type: item.product_type || 'banner',
          width_in: item.width_in,
          height_in: item.height_in,
          quantity: item.quantity,
          material: item.material,
          pole_pockets: item.pole_pockets,
          has_artwork_file: Boolean(item.file_key || item.file_url),
          has_text_elements: Array.isArray(item.text_elements) && item.text_elements.length > 0,
          has_final_render: Boolean(item.final_render_url || item.final_render_file_key),
          final_render_width_px: item.final_render_width_px || 'NONE',
          final_render_height_px: item.final_render_height_px || 'NONE',
          final_render_dpi: item.final_render_dpi || 'NONE',
          canvas_state_json: item.canvas_state_json ? 'YES (' + item.canvas_state_json.length + ' chars)' : 'NONE',
        });
      });
    }

    const retiredCampaignTypes = new Set(['design_deposit', 'graduation_final_payment']);
    if ((orderData.items || []).some((item) => retiredCampaignTypes.has(item.product_type))) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          error: 'This retired campaign can no longer accept payments.',
          code: 'RETIRED_CAMPAIGN_ITEM',
        }),
      };
    }

    // SERVER-SIDE: Validate yard sign quantities (must be multiples of 10, min 10, max 90)
    const YARD_SIGN_INCREMENT = 10;
    const YARD_SIGN_MIN_QTY = 10;
    const YARD_SIGN_MAX_QTY = 90;
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        if (item.product_type === 'yard_sign') {
          const qty = item.quantity || 0;
          if (qty < YARD_SIGN_MIN_QTY || qty > YARD_SIGN_MAX_QTY || qty % YARD_SIGN_INCREMENT !== 0) {
            console.error(`❌ Yard sign quantity validation failed: quantity=${qty}`);
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
              body: JSON.stringify({
                error: `Yard signs must be ordered in increments of ${YARD_SIGN_INCREMENT} (${YARD_SIGN_MIN_QTY}, 20, 30, etc.), with a minimum of ${YARD_SIGN_MIN_QTY} and maximum of ${YARD_SIGN_MAX_QTY}.`,
                code: 'YARD_SIGN_QUANTITY_INVALID',
              }),
            };
          }
        }
      }
    }

    // ALWAYS recalculate totals server-side from line_total_cents
    {
      // Resolve the promotion from Neon using only the submitted code. Never
      // trust a browser-supplied percentage or fixed amount when calculating
      // the amount that will be persisted and charged.
      if (orderData.discountCode?.code) {
        const authoritativeDiscount = await validateDiscountForCheckout({
          sql,
          code: orderData.discountCode.code,
          email: orderData.email || null,
          userId: isRealUserId(orderData.user_id) ? orderData.user_id : null,
          checkoutKey: orderData.checkout_idempotency_key || null,
        });
        if (!authoritativeDiscount.valid) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              error: authoritativeDiscount.error || 'Invalid discount code',
              code: 'DISCOUNT_CODE_INVALID',
            }),
          };
        }
        orderData.discountCode = authoritativeDiscount.discount;
      } else {
        orderData.discountCode = null;
      }

      // Recalculate totals from line items. Recovery offers carry only trusted
      // database scope metadata; browser-supplied percentages and item IDs are
      // discarded by validation above.
      const recalculatedTotals = applyAuthoritativeOrderTotals(orderData);

      // Log pricing calculation
      console.info('pricing', {
        orderId: 'pending',  // NOTE: orderId not yet generated at this point
        raw_subtotal_cents: recalculatedTotals.raw_subtotal_cents,
        adjusted_subtotal_cents: recalculatedTotals.adjusted_subtotal_cents,
        min_order_adjustment_cents: recalculatedTotals.min_order_adjustment_cents,
        shipping_cents: recalculatedTotals.shipping_cents,
        tax_cents: recalculatedTotals.tax_cents,
        total_cents: recalculatedTotals.total_cents,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Server-recalculated order totals:', {
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: orderData.total_cents,
        min_order_adjustment_cents: orderData.min_order_adjustment_cents
      });
    }

    // Generate UUID for the order
    const orderId = randomUUID();

    // Order number functionality removed - using UUID as primary identifier

    // Insert order into database with simplified approach
    console.log('Inserting order with ID:', orderId);
    console.log('Order input summary:', safeOrderLogSummary(orderData));

    // Handle user_id - CRITICAL FIX: Always use real user email, never guest email
    let finalUserId = null;
    let userEmail = null; // CHANGED: Don't default to guest email

    console.log('🔍 ORDER CREATION DEBUG:');
    console.log('Order data received:', safeOrderLogSummary(orderData));

    // Sanitize incoming user_id. Placeholder values (all-zero UUID,
    // "guest", malformed strings) must be treated as if no user_id was
    // provided so guest checkout (Stripe pending orders, etc.) works.
    const rawIncomingUserId = orderData.user_id;
    const sanitizedUserId = isRealUserId(rawIncomingUserId) ? rawIncomingUserId : null;
    if (rawIncomingUserId && !sanitizedUserId) {
      console.log('🛡️ Ignoring placeholder/guest user_id; treating as guest order');
    }

    // STEP 1: If we have a real user_id, find the user and get their REAL email
    if (sanitizedUserId) {
      try {
        console.log('🔍 Resolving authenticated profile for order');
        const userCheck = await sql`
          SELECT id, email, username, full_name FROM profiles WHERE id = ${sanitizedUserId}
        `;

        if (userCheck.length > 0) {
          finalUserId = sanitizedUserId;
          userEmail = userCheck[0].email; // CRITICAL: Use the REAL user email
          console.log('✅ User found in profiles table:');
          console.log('   - Authenticated profile resolved: true');
        } else {
          // The user_id passed validation as a real-looking UUID but is
          // not present in the profiles table. If we have a usable email
          // on the order, treat this as a guest order rather than failing
          // — this matches the expectation that Stripe pending orders
          // can be created for guests.
          console.log('⚠️ Authenticated profile was not found; falling back to guest/email path');
          if (!orderData.email) {
            // No email and no resolvable user → we genuinely cannot
            // attribute the order. Fail loudly as before.
            throw new Error('Authenticated profile was not found and no customer email was provided.');
          }
        }
      } catch (userError) {
        console.error('❌ Error checking user profile:', userError);
        throw userError; // Don't continue with invalid user
      }
    }

    // STEP 2: If no user_id provided, check if we have email in order data
    // Legacy PayPal behavior may associate an order by email. Stripe's new
    // path has a signed-session user id available at its entrypoint and must
    // not let an unauthenticated browser claim account ownership by merely
    // typing that account's email address.
    if (!trustedStripeMode && !isPayPalPendingCheckout && !finalUserId && orderData.email) {
      try {
        console.log('🔍 No user_id provided, trying to resolve a profile by email');
        const emailCheck = await sql`
          SELECT id, email FROM profiles WHERE email = ${orderData.email}
        `;
        if (emailCheck.length > 0) {
          finalUserId = emailCheck[0].id;
          userEmail = emailCheck[0].email;
          console.log('✅ User profile found by email');
        } else {
          console.log('No user profile found by email; continuing as guest');
        }
      } catch (emailError) {
        console.error('❌ Error checking user by email:', emailError);
      }
    }

    // STEP 3: Final validation - ALWAYS ensure we have an email
    if (!userEmail) {
      console.log('❌ No userEmail found, checking orderData.email');
      console.log('   - has resolved user ID:', Boolean(finalUserId));
      console.log('   - has resolved email:', Boolean(userEmail));
      console.log('   - has submitted email:', Boolean(orderData.email));

      // Use provided email or fail
      if (orderData.email && orderData.email !== 'guest@example.com') {
        userEmail = orderData.email;
        console.log('✅ Using submitted email for guest order');
      } else {
        throw new Error('Cannot create order: No valid email provided. Email is required for all orders.');
      }
    }

    // Ensure we have a valid email (allow guest emails with timestamp)
    if (!userEmail || userEmail === 'guest@example.com') {
      throw new Error('Cannot create order: Valid email address is required');
    }

    console.log('Order customer identity resolved:', {
      hasUserId: Boolean(finalUserId),
      hasEmail: Boolean(userEmail),
    });

    // A browser-provided cart UUID is only a hint. Resolve it before final
    // recovery-discount validation so both the recipient and the exact source
    // cart are bound before an order can be persisted or paid.
    const linkedAbandonedCartId = await resolveAbandonedCartLink(sql, {
      cartId: orderData.abandonedCartId || orderData.abandoned_cart_id,
      sessionId: orderData.abandonedCartSessionId || orderData.abandoned_cart_session_id,
      userId: finalUserId,
      email: userEmail,
      recoveryToken: orderData.abandonedCartRecoveryToken || orderData.abandoned_cart_recovery_token,
      isTestOrder: orderData.is_test_order === true,
    });
    orderData.abandoned_cart_id = linkedAbandonedCartId;

    // Pricing initially validates the submitted code before the canonical
    // account email and recovery-cart ownership are loaded. Revalidate against
    // both canonical values so a copied code cannot fund a different cart.
    const canonicalRecoveryDiscount = await revalidateRecoveryDiscountForCanonicalIdentity(sql, {
      discount: orderData.discountCode,
      userEmail,
      userId: finalUserId,
      checkoutKey: orderData.checkout_idempotency_key || null,
      recoveryCartId: linkedAbandonedCartId,
    });
    if (!canonicalRecoveryDiscount.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          error: canonicalRecoveryDiscount.error || 'Invalid discount code',
          code: 'DISCOUNT_CODE_INVALID',
        }),
      };
    }
    orderData.discountCode = canonicalRecoveryDiscount.discount;
    // Recompute after canonical binding. This is deliberately the last base
    // price calculation before post-tax service fees are reconciled.
    applyAuthoritativeOrderTotals(orderData);
    // The cart snapshot can finish after this order write. Preserve only the
    // bounded session hint so server reconciliation can find that late row;
    // this value is never positive email or recovery attribution on its own.
    const linkedAbandonedCartSessionId = normalizedOrderAbandonedCartSessionId(orderData);
    orderData.abandoned_cart_session_id = linkedAbandonedCartSessionId;

    const normalizedShippingAddress = normalizeShippingAddress({
      ...orderData,
      ...(orderData.shippingAddress || {}),
    });
    orderData.shipping_name = normalizedShippingAddress.name || null;
    orderData.shipping_street = normalizedShippingAddress.line1 || null;
    orderData.shipping_street2 = normalizedShippingAddress.line2 || null;
    orderData.shipping_city = normalizedShippingAddress.city || null;
    orderData.shipping_state = normalizedShippingAddress.state || null;
    orderData.shipping_zip = normalizedShippingAddress.postalCode || null;
    orderData.shipping_country = normalizedShippingAddress.country || 'US';

    const resolvedCustomerName = orderData.customer_name || orderData.shipping_name || null;
    const normalizedCustomerName = normalizeCustomerName(resolvedCustomerName);
    orderData.customer_name = normalizedCustomerName.fullName;
    orderData.customer_first_name = normalizedCustomerName.firstName;

    // ----- Same-Day Hit Service: server-side reconciliation -----
    // The client may have requested same-day / Saturday delivery flags.
    // Re-validate them server-side using ET clock + product eligibility,
    // and recompute the fee values from the eligible subtotal. We never
    // trust client fee amounts.
    const sameDayNow = new Date();
    const sameDayResult = reconcileSameDayFlags({
      now: sameDayNow,
      items: Array.isArray(orderData.items) ? orderData.items : [],
      requestedSameDay: !!orderData.sameDayHitService,
      requestedSaturday: !!orderData.saturdayDelivery,
    });

    // Hard fail if the client claimed same-day but the window has passed.
    if (orderData.sameDayHitService && !sameDayResult.sameDay) {
      console.warn('create-order: same-day rejected', {
        reason: sameDayResult.rejectionReason,
        ETnow: sameDayResult.eval && sameDayResult.eval.ETnow && sameDayResult.eval.ETnow.display,
      });
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'SAME_DAY_NOT_AVAILABLE',
          message: 'Same-Day Hit Service is no longer available for today’s production window.',
          reason: sameDayResult.rejectionReason,
        }),
      };
    }

    const orderSameDayHitService = sameDayResult.sameDay;
    const orderSaturdayDelivery = sameDayResult.saturday;
    const orderSameDayFeeCents = sameDayResult.fees.sameDayFeeCents;
    const orderSaturdayFeeCents = sameDayResult.fees.saturdayFeeCents;
    const orderSameDayQualified = sameDayResult.eval.windowOpen && sameDayResult.eval.hasEligibleItem;
    const orderTimestampEt = getEasternTimeParts(sameDayNow);
    // computeTotals intentionally calculates tax before these optional
    // services. Add the server-authoritative fees to the persisted/payment
    // total exactly once so checkout, DB, PayPal, and analytics share a ledger.
    orderData.total_cents = addPostTaxServiceFees({
      baseTotalCents: orderData.total_cents,
      sameDayFeeCents: orderSameDayFeeCents,
      saturdayFeeCents: orderSaturdayFeeCents,
    });
    orderData.same_day_fee_cents = orderSameDayFeeCents;
    orderData.saturday_fee_cents = orderSaturdayFeeCents;

    if (isPayPalPendingCheckout) {
      if (!Number.isInteger(submittedExpectedTotalCents) || submittedExpectedTotalCents <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            ok: false,
            error: 'EXPECTED_TOTAL_INVALID',
            message: 'The displayed checkout total is invalid. Refresh checkout and try again.',
          }),
        };
      }
      if (submittedExpectedTotalCents !== Number(orderData.total_cents)) {
        const canonicalQuote = canonicalQuoteForCheckout(orderData.items, orderData);
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            ok: false,
            error: 'STALE_CART_TOTAL',
            message: 'Your order total changed. Review the updated total before paying.',
            details: {
              restartCheckout: true,
              safeToRetry: false,
              bindingState: 'restart_required',
              serverTotalCents: Number(orderData.total_cents),
              canonicalQuote,
              subtotalCents: Number(orderData.subtotal_cents || 0),
              taxCents: Number(orderData.tax_cents || 0),
              appliedDiscountCents: Number(orderData.applied_discount_cents || 0),
              sameDayFeeCents: Number(orderData.same_day_fee_cents || 0),
              saturdayFeeCents: Number(orderData.saturday_fee_cents || 0),
              items: orderData.items.map((item, index) => ({
                index,
                cartItemId: item.id || null,
                productType: item.product_type || 'banner',
                unitPriceCents: Number(item.unit_price_cents || 0),
                lineTotalCents: Number(item.line_total_cents || 0),
                ropeFeet: Number(item.rope_feet || 0),
                ropeCostCents: Number(item.rope_cost_cents || 0),
                polePocketCostCents: Number(item.pole_pocket_cost_cents || 0),
              })),
            },
          }),
        };
      }
    }
    const attribution = normalizeAttribution(orderData.attribution || orderData);

    if (orderData.paypal_order_id || orderData.paypal_capture_id) {
      const capturedCurrency = String(orderData.paypal_captured_currency || '').toUpperCase();
      const capturedAmountCents = Number(orderData.paypal_captured_amount_cents);
      if (capturedCurrency && capturedCurrency !== 'USD') {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_CURRENCY_MISMATCH' }),
        };
      }
      if (Number.isFinite(capturedAmountCents) && capturedAmountCents > 0 && capturedAmountCents !== Number(orderData.total_cents || 0)) {
        console.warn('create-order: PayPal capture amount does not match server-calculated order total', {
          paypal_order_id: orderData.paypal_order_id,
          paypal_capture_id: orderData.paypal_capture_id,
          capturedAmountCents,
          serverTotalCents: orderData.total_cents,
        });
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ ok: false, error: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH' }),
        };
      }
    }

    // Payment providers persist pending orders here before capture. A paid
    // status reached this point only through the authorized preview-test path
    // above; production settlement belongs to the verified finalizers.
    const expectedItemCount = orderData.items.length;
    const expectedItemSignature = buildItemSignature(orderData.items);
    const expectedOrderIdentity = {
      email: userEmail,
      total_cents: orderData.total_cents,
      status: requestedStatus,
    };
    const existingOrder = await findExistingOrderByIdentity(sql, orderData);
    if (existingOrder) {
      const verifiedOrder = await verifyExistingOrderMatches(
        sql,
        existingOrder,
        expectedOrderIdentity,
        expectedItemCount,
        expectedItemSignature,
      );
      console.log('create-order: verified idempotent retry', verifiedOrder.id);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, orderId: verifiedOrder.id, order: verifiedOrder, deduped: true }),
      };
    }
    if (requestedStatus === 'pending') {
      console.log('[create-order] Creating PENDING order (pre-payment hold):', {
        orderId,
        hasCustomerEmail: Boolean(userEmail),
        total_cents: orderData.total_cents,
        payment_method: orderData.payment_method || null,
      });
    }

    const persistenceQueries = [sql`
      INSERT INTO orders (id, user_id, email, customer_name, customer_first_name, customer_phone, subtotal_cents, tax_cents, total_cents, status, paypal_order_id, paypal_capture_id, stripe_payment_intent_id, payment_method, checkout_idempotency_key, payment_reconciliation_status, shipping_name, shipping_street, shipping_street2, shipping_city, shipping_state, shipping_zip, shipping_country, discount_code, applied_discount_cents, applied_discount_label, applied_discount_type, same_day_hit_service, saturday_delivery, same_day_fee_cents, saturday_fee_cents, order_timestamp_et, same_day_qualified, is_test_order, test_order_reason, google_click_id, gbraid, wbraid, landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content, consent_status, expected_item_count, item_signature, abandoned_cart_id, abandoned_cart_session_id)
      VALUES (${orderId}, ${finalUserId}, ${userEmail}, ${orderData.customer_name || null}, ${orderData.customer_first_name || null}, ${orderData.customer_phone || null}, ${orderData.subtotal_cents || 0}, ${orderData.tax_cents || 0}, ${orderData.total_cents || 0}, ${requestedStatus}, ${orderData.paypal_order_id || null}, ${orderData.paypal_capture_id || null}, ${orderData.stripe_payment_intent_id || null}, ${orderData.payment_method || (orderData.stripe_payment_intent_id ? 'stripe' : (orderData.paypal_order_id ? 'paypal' : null))}, ${orderData.checkout_idempotency_key || null}, ${requestedStatus === 'pending' ? 'awaiting_capture' : 'not_required'}, ${orderData.shipping_name || null}, ${orderData.shipping_street || null}, ${orderData.shipping_street2 || null}, ${orderData.shipping_city || null}, ${orderData.shipping_state || null}, ${orderData.shipping_zip || null}, ${orderData.shipping_country || 'US'}, ${orderData.discountCode?.code || null}, ${orderData.applied_discount_cents || 0}, ${orderData.applied_discount_label || ''}, ${orderData.applied_discount_type || 'none'}, ${orderSameDayHitService}, ${orderSaturdayDelivery}, ${orderSameDayFeeCents}, ${orderSaturdayFeeCents}, ${orderTimestampEt.display}, ${orderSameDayQualified}, ${orderData.is_test_order === true}, ${orderData.test_order_reason || null}, ${attribution.google_click_id}, ${attribution.gbraid}, ${attribution.wbraid}, ${attribution.landing_page}, ${attribution.referrer}, ${attribution.utm_source}, ${attribution.utm_medium}, ${attribution.utm_campaign}, ${attribution.utm_term}, ${attribution.utm_content}, ${attribution.consent_status}, ${expectedItemCount}, ${expectedItemSignature}, ${linkedAbandonedCartId}, ${linkedAbandonedCartSessionId})
      RETURNING *
    `];

    // Every query is built from the already-normalized items before the fixed
    // Neon HTTP transaction begins.
    for (const item of orderData.items) {
        console.log("[Create Order] Cleaned item file_key:", item.file_key, "file_url:", item.file_url ? item.file_url.substring(0, 80) : null);
        console.log('[CREATE_ORDER_DEBUG] === PERSISTING ORDER ITEM ===');
        console.log('[CREATE_ORDER_DEBUG] order_id:', orderId);
        console.log('[CREATE_ORDER_DEBUG] dimensions:', item.width_in, '×', item.height_in, 'inches');
        console.log('[CREATE_ORDER_DEBUG] final_render_url:', item.final_render_url ? item.final_render_url.substring(0, 80) : 'NULL');
        console.log('[CREATE_ORDER_DEBUG] final_render_file_key:', item.final_render_file_key || 'NULL');
        console.log('[CREATE_ORDER_DEBUG] final_render_width_px:', item.final_render_width_px || 'NULL');
        console.log('[CREATE_ORDER_DEBUG] final_render_height_px:', item.final_render_height_px || 'NULL');
        console.log('[CREATE_ORDER_DEBUG] final_render_dpi:', item.final_render_dpi || 'NULL');
        console.log('[CREATE_ORDER_DEBUG] canvas_state_json:', item.canvas_state_json ? 'YES (' + item.canvas_state_json.length + ' chars)' : 'NULL');
        console.log('[CREATE_ORDER_DEBUG] thumbnail_url:', item.thumbnail_url ? item.thumbnail_url.substring(0, 80) : 'NULL');
        console.log('[CREATE_ORDER_DEBUG] ===========================');
        const polePocketsValue = item.pole_pockets &&
          item.pole_pockets !== 'none' &&
          item.pole_pockets !== 'false' &&
          item.pole_pockets !== false;

        persistenceQueries.push(sql`
              INSERT INTO order_items (
                id, order_id, product_type, width_in, height_in, quantity, material,
                grommets, rounded_corners, rope_feet, rope_placement, pole_pockets, pole_pocket_position, pole_pocket_size, pole_pocket_cost_cents,
                line_total_cents, file_key, file_name, file_url, artwork_manifest, placement_preview, original_filename, print_ready_url, web_preview_url, text_elements, overlay_image, overlay_images, canvas_background_color, image_scale, image_position, thumbnail_url, final_render_url, final_render_file_key, final_render_width_px, final_render_height_px, final_render_dpi, canvas_state_json,
                design_service_enabled, design_request_text, design_draft_preference, design_draft_contact, design_uploaded_assets,
                yard_sign_sidedness, yard_sign_step_stakes_enabled, yard_sign_step_stakes_qty, yard_sign_design_count, yard_sign_designs, yard_sign_signs_subtotal_cents, yard_sign_stakes_subtotal_cents
              )
              VALUES (
                ${randomUUID()},
                ${orderId},
                ${item.product_type || 'banner'},
                ${item.width_in || 0},
                ${item.height_in || 0},
                ${item.quantity || 1},
                ${item.material || '13oz'},
                ${item.grommets || 'none'},
                ${item.rounded_corners || null},
                ${item.rope_feet || 0},
                ${item.rope_placement || null},
                ${polePocketsValue},
                ${item.pole_pocket_position || null},
                ${item.pole_pocket_size || null},
                ${item.pole_pocket_cost_cents || 0},
                ${item.line_total_cents || 0},
                ${item.file_key || null},
                ${item.file_name || item.artwork_manifest?.originalFilename || null},
                ${item.file_url || null},
                ${item.artwork_manifest ? JSON.stringify(item.artwork_manifest) : null}::jsonb,
                ${item.placement_preview ? JSON.stringify(item.placement_preview) : null}::jsonb,
                ${item.artwork_manifest?.originalFilename || item.file_name || null},
                ${item.print_ready_url || null},
                ${item.web_preview_url || null},
                ${item.text_elements ? JSON.stringify(item.text_elements) : '[]'},
                ${item.overlay_image ? JSON.stringify(item.overlay_image) : null},
                ${item.overlay_images ? JSON.stringify(item.overlay_images) : null},
                ${item.canvas_background_color || '#FFFFFF'},
                ${item.image_scale ?? 1},
                ${item.image_position ? JSON.stringify(item.image_position) : '{"x": 0, "y": 0}'},
                ${item.thumbnail_url || null},
                ${item.final_render_url || null},
                ${item.final_render_file_key || null},
                ${item.final_render_width_px || null},
                ${item.final_render_height_px || null},
                ${item.final_render_dpi || null},
                ${item.canvas_state_json || null},
                ${item.design_service_enabled || false},
                ${item.design_request_text || null},
                ${item.design_draft_preference || null},
                ${item.design_draft_contact || null},
                ${item.design_uploaded_assets ? JSON.stringify(item.design_uploaded_assets) : '[]'},
                ${item.yard_sign_sidedness ?? null},
                ${item.yard_sign_step_stakes_enabled ?? false},
                ${item.yard_sign_step_stakes_qty ?? 0},
                ${item.yard_sign_design_count ?? 0},
                ${item.yard_sign_designs ? JSON.stringify(item.yard_sign_designs) : null},
                ${item.yard_sign_signs_subtotal_cents ?? 0},
                ${item.yard_sign_stakes_subtotal_cents ?? 0}
              )
            `);
    }

    let transactionResults;
    try {
      transactionResults = await runAtomicBatch(sql, persistenceQueries);
    } catch (writeError) {
      if (!isUniqueViolation(writeError)) throw writeError;

      // A concurrent request may have committed the same identity first.
      // Return it only after verifying both the request signature and that all
      // expected child rows committed.
      const concurrentOrder = await findExistingOrderByIdentity(sql, orderData);
      if (!concurrentOrder) throw writeError;
      const verifiedOrder = await verifyExistingOrderMatches(
        sql,
        concurrentOrder,
        expectedOrderIdentity,
        expectedItemCount,
        expectedItemSignature,
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, orderId: verifiedOrder.id, order: verifiedOrder, deduped: true }),
      };
    }

    const orderResult = transactionResults[0];
    if (!orderResult || orderResult.length === 0) {
      throw new Error('Failed to create order - no result returned from database');
    }

    const order = orderResult[0];
    console.log('Order and all order items committed atomically:', order.id);

    if (finalUserId && normalizedCustomerName.fullName) {
      try {
        await sql`
          UPDATE profiles
          SET full_name = COALESCE(NULLIF(full_name, ''), ${normalizedCustomerName.fullName})
          WHERE id = ${finalUserId}
        `;
      } catch (profileUpdateError) {
        console.warn('⚠️ Could not update profile full_name:', profileUpdateError.message);
      }
    }

    // Process AI artwork automatically for orders containing AI designs.
    // Skipped for pending pre-payment orders — finalize-order will run it.
    if (requestedStatus !== 'pending') try {
      const aiItems = orderData.items?.filter(item => item.aiDesign) || [];
      
      if (aiItems.length > 0) {
        console.log(`Processing AI artwork for ${aiItems.length} items in order ${orderId}`);
        
        const artworkProcessingResponse = await fetch(`${process.env.URL || 'https://bannersonthefly.com'}/.netlify/functions/ai-artwork-processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderId,
            orderItems: aiItems,
            triggerSource: 'order_creation'
          }),
        });

        if (artworkProcessingResponse.ok) {
          const processingResult = await artworkProcessingResponse.json();
          console.log('AI artwork processing completed:', processingResult.processedItems?.length || 0, "items");
          
          // Update order items with processed artwork URLs
          for (const processedItem of processingResult.processedItems) {
            if (processedItem.success !== false) {
              try {
                await sql`
                  UPDATE order_items 
                  SET 
                    print_ready_url = ${processedItem.printReadyUrl || null},
                    web_preview_url = ${processedItem.webPreviewUrl || null},
                    artwork_metadata_url = ${processedItem.artworkMetadataUrl || null}
                  WHERE order_id = ${orderId} AND id = ${processedItem.orderItemId}
                `;
                console.log(`Updated order item ${processedItem.orderItemId} with processed artwork URLs`);
              } catch (updateError) {
                console.error(`Failed to update order item ${processedItem.orderItemId} with artwork URLs:`, updateError);
                // Don't fail the order - artwork processing succeeded but DB update failed
              }
            }
          }
        } else {
          console.error('AI artwork processing failed:', await artworkProcessingResponse.text());
          // Don't fail the order creation - artwork processing can be retried later
        }
      }
    } catch (artworkError) {
      console.error('Error processing AI artwork:', artworkError);
      // Don't fail the order creation - artwork processing can be retried later
    }


    console.log('All order items created successfully');

    // PENDING ORDERS: Stop here. Abandoned-cart cleanup, discount-code
    // consumption, intake updates and emails all happen after the
    // payment provider confirms the charge (see stripe-finalize-order
    // and stripe-webhook). Returning early keeps the database state
    // consistent if the customer never completes payment.
    if (requestedStatus === 'pending') {
      console.log('[create-order] PENDING order persisted, awaiting payment confirmation:', {
        orderId,
        hasCustomerEmail: Boolean(userEmail),
        total_cents: orderData.total_cents || 0,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          orderId,
          status: 'pending',
          order: {
            id: orderId,
            email: userEmail,
            subtotal_cents: orderData.subtotal_cents || 0,
            tax_cents: orderData.tax_cents || 0,
            total_cents: orderData.total_cents || 0,
            currency: orderData.currency || 'USD',
            status: 'pending',
          },
        }),
      };
    }

    // Direct paid-order creation is a legacy path. Use the same exact-link-
    // first recovery service as Stripe and PayPal settlement so one purchase
    // cannot recover multiple historical carts.
    try {
      await markAbandonedCartRecovered(sql, {
        ...order,
        user_id: finalUserId,
        email: userEmail,
        abandoned_cart_id: linkedAbandonedCartId,
      });
    } catch (recoveryError) {
      console.error('Error marking abandoned cart as recovered:', recoveryError);
      // Recovery bookkeeping is non-critical and must never roll back a paid order.
    }

    // Mark database discount code as used after successful order creation.
    // NEW20 is a virtual promo tracked by the orders table, not discount_codes.
    // All other codes stored in discount_codes must be invalidated here so they
    // cannot be reused by any subsequent checkout session.
    if (orderData.discountCode && orderData.discountCode.code) {
      const dcCode = String(orderData.discountCode.code).trim().toUpperCase();
      if (dcCode !== 'NEW20' && orderData.discountCode.source !== 'trade_show') {
        try {
          const normalizedEmailForDiscount = userEmail ? userEmail.toLowerCase() : null;
          await sql`
            UPDATE discount_codes
            SET
              used            = TRUE,
              used_at         = NOW(),
              used_by_user_id = ${finalUserId}::UUID,
              used_by_email   = CASE
                WHEN ${normalizedEmailForDiscount}::TEXT IS NOT NULL THEN
                  COALESCE(used_by_email, ARRAY[]::TEXT[]) || ARRAY[${normalizedEmailForDiscount}::TEXT]
                ELSE used_by_email
              END,
              order_id        = ${orderId},
              updated_at      = NOW()
            WHERE code = ${dcCode}
          `;
          console.log('[create-order] Discount code marked as used:', {
            code: dcCode,
            orderId,
            email: normalizedEmailForDiscount,
            timestamp: new Date().toISOString(),
          });
        } catch (discountUpdateError) {
          // Log but do not fail the order – the code was validated before checkout
          console.error('[create-order] Failed to mark discount code as used:', discountUpdateError.message);
        }
      }
    }

    // Normal product order — send standard order confirmation email.
    try {
      console.log('Sending order confirmation email for order:', orderId);
      const emailResult = await sendOrderConfirmationEmail(orderId);
      if (emailResult.ok) {
        console.log('Order confirmation email sent successfully, email ID:', emailResult.id);
      } else {
        console.error('Failed to send order confirmation email:', emailResult.error);
      }
    } catch (emailError) {
      console.error('Error sending order confirmation email:', emailError);
    }

    const response = {
      ok: true,
      orderId: orderId,
      order: {
        id: orderId,
        user_id: finalUserId,
        email: userEmail,
        subtotal_cents: orderData.subtotal_cents || 0,
        tax_cents: orderData.tax_cents || 0,
        total_cents: orderData.total_cents || 0,
        applied_discount_cents: orderData.applied_discount_cents || 0,
        applied_discount_label: orderData.applied_discount_label || "",
        applied_discount_type: orderData.applied_discount_type || "none",
        discount_code: orderData.discountCode?.code || null,
        same_day_fee_cents: orderSameDayFeeCents,
        saturday_fee_cents: orderSaturdayFeeCents,
        status: requestedStatus,
        payment_method: orderData.payment_method || null,
        is_test_order: orderData.is_test_order === true,
        test_order_reason: orderData.test_order_reason || null,
        currency: orderData.currency || 'USD',
        tracking_number: null,
        tracking_carrier: null,
        created_at: orderResult[0]?.created_at || new Date().toISOString(),
        shipping_name: orderData.shipping_name || null,
        shipping_street: orderData.shipping_street || null,
        shipping_street2: orderData.shipping_street2 || null,
        shipping_city: orderData.shipping_city || null,
        shipping_state: orderData.shipping_state || null,
        shipping_zip: orderData.shipping_zip || null,
        shipping_country: orderData.shipping_country || 'US',
        shippingAddress: {
          name: orderData.shipping_name || '',
          line1: orderData.shipping_street || '',
          line2: orderData.shipping_street2 || '',
          city: orderData.shipping_city || '',
          state: orderData.shipping_state || '',
          postalCode: orderData.shipping_zip || '',
          country: orderData.shipping_country || 'US',
        },
        items: orderData.items || []
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('❌ CRITICAL ERROR creating order:', error);
    console.error('Error stack:', error.stack);
    console.error('Order input summary that failed:', safeOrderLogSummary(orderData));

    return {
      statusCode: error.statusCode || 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.statusCode ? error.code : 'Failed to create order',
        details: error.message,
        integrity: error.details,
      }),
    };
  }
};

exports._test = {
  isDeployPreviewEnvironment,
  applyAdminDeployPreviewTestOrder,
  applySandboxPayPalTestOrder,
  prepareOrderItems,
  buildItemSignature,
  verifyExistingOrderMatches,
  ensureOrderSchemaOnce,
  isSecureCheckoutKey,
  canonicalQuoteForCheckout,
  normalizedUuid,
  normalizedCartSessionId,
  normalizedOrderAbandonedCartSessionId,
  resolveAbandonedCartLink,
  revalidateRecoveryDiscountForCanonicalIdentity,
  resolveAuthorizedOrderStatus,
};

exports.createTrustedStripeContext = createTrustedStripeContext;
