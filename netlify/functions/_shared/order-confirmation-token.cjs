'use strict';

const crypto = require('crypto');

const ORDER_CONFIRMATION_HEADER = 'x-order-confirmation-token';
const ORDER_CONFIRMATION_PURPOSE = 'paid-order-confirmation';
const ORDER_CONFIRMATION_TTL_SECONDS = 15 * 60;
const ORDER_VIEW_HEADER = 'x-order-view-token';
const ORDER_VIEW_PURPOSE = 'guest-paid-order-view';
const ORDER_VIEW_TTL_SECONDS = 90 * 24 * 60 * 60;
const ORDER_VIEW_FRAGMENT_PARAM = 'orderView';
const PAID_ORDER_STATUSES = new Set([
  'paid',
  'completed',
  'complete',
  'succeeded',
  'in_production',
  'shipped',
  'delivered',
  'fulfilled',
]);

function uniqueSecrets(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function confirmationSecrets(order, options = {}) {
  if (options.secret) return [String(options.secret)];
  return uniqueSecrets([
    process.env.ORDER_CONFIRMATION_TOKEN_SECRET,
    process.env.AUTH_SESSION_SECRET,
    process.env.CLOUDINARY_API_SECRET,
    order?.checkout_idempotency_key,
  ]);
}

function orderViewSecrets(order, options = {}) {
  if (options.secret) return [String(options.secret)];
  return uniqueSecrets([
    process.env.ORDER_VIEW_TOKEN_SECRET,
    process.env.ORDER_CONFIRMATION_TOKEN_SECRET,
    process.env.AUTH_SESSION_SECRET,
    process.env.CLOUDINARY_API_SECRET,
    // A previous dedicated key lets operations rotate ORDER_VIEW_TOKEN_SECRET
    // without invalidating links that are still within their 90-day lifetime.
    process.env.ORDER_VIEW_TOKEN_SECRET_PREVIOUS,
    // New checkouts already have a cryptographically random per-order key. It
    // is a release-safe fallback when no global signing secret is configured.
    order?.checkout_idempotency_key,
  ]);
}

function cleanBoundValue(value, name, maxLength = 200) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${name} is required to create an order confirmation token`);
  }
  return normalized;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signatureFor(purpose, payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${purpose}.${payload}`)
    .digest('base64url');
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createOrderConfirmationToken(claims, options = {}) {
  const secret = confirmationSecrets(options.order, options)[0];
  if (!secret) throw new Error('ORDER_CONFIRMATION_TOKEN_SECRET is not configured');

  const issuedAt = Number.isFinite(options.nowSeconds)
    ? Math.floor(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const ttlSeconds = Number.isFinite(options.ttlSeconds)
    ? Math.max(1, Math.min(Math.floor(options.ttlSeconds), ORDER_CONFIRMATION_TTL_SECONDS))
    : ORDER_CONFIRMATION_TTL_SECONDS;
  const payload = base64url(JSON.stringify({
    v: 1,
    purpose: ORDER_CONFIRMATION_PURPOSE,
    orderId: cleanBoundValue(claims?.orderId, 'orderId', 100),
    paypalOrderId: cleanBoundValue(claims?.paypalOrderId, 'paypalOrderId'),
    captureId: cleanBoundValue(claims?.captureId, 'captureId'),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));

  return `${payload}.${signatureFor(ORDER_CONFIRMATION_PURPOSE, payload, secret)}`;
}

function createProviderOrderConfirmationToken(claims, options = {}) {
  const secret = confirmationSecrets(options.order, options)[0];
  if (!secret) throw new Error('ORDER_CONFIRMATION_TOKEN_SECRET is not configured');

  const provider = cleanBoundValue(claims?.provider, 'provider', 30).toLowerCase();
  if (!['stripe'].includes(provider)) {
    throw new Error('Unsupported payment provider for order confirmation token');
  }
  const issuedAt = Number.isFinite(options.nowSeconds)
    ? Math.floor(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const ttlSeconds = Number.isFinite(options.ttlSeconds)
    ? Math.max(1, Math.min(Math.floor(options.ttlSeconds), ORDER_CONFIRMATION_TTL_SECONDS))
    : ORDER_CONFIRMATION_TTL_SECONDS;
  const payload = base64url(JSON.stringify({
    v: 2,
    purpose: ORDER_CONFIRMATION_PURPOSE,
    provider,
    orderId: cleanBoundValue(claims?.orderId, 'orderId', 100),
    paymentId: cleanBoundValue(claims?.paymentId, 'paymentId'),
    paymentReference: cleanBoundValue(claims?.paymentReference || '-', 'paymentReference'),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));

  return `${payload}.${signatureFor(ORDER_CONFIRMATION_PURPOSE, payload, secret)}`;
}

function createPaidOrderConfirmationToken(order, options = {}) {
  if (!PAID_ORDER_STATUSES.has(String(order?.status || '').toLowerCase())) {
    throw new Error('A paid order is required to create an order confirmation token');
  }
  const stripeIntentId = String(order?.stripe_payment_intent_id || '').trim();
  if (stripeIntentId) {
    return createProviderOrderConfirmationToken({
      provider: 'stripe',
      orderId: order.id,
      paymentId: stripeIntentId,
      paymentReference: String(order?.stripe_charge_id || '').trim() || '-',
    }, { ...options, order });
  }
  return createOrderConfirmationToken({
    orderId: order.id,
    paypalOrderId: order.paypal_order_id,
    captureId: order.paypal_capture_id,
  }, { ...options, order });
}

function verifyOrderConfirmationToken(token, expected = {}, options = {}) {
  const normalizedToken = String(token || '').trim();
  const secrets = confirmationSecrets(options.order, options);
  if (!secrets.length || !normalizedToken || normalizedToken.length > 4096) return null;

  const parts = normalizedToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  if (!secrets.some((secret) => constantTimeEqual(
    signature,
    signatureFor(ORDER_CONFIRMATION_PURPOSE, payload, secret),
  ))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Number.isFinite(options.nowSeconds)
      ? Math.floor(options.nowSeconds)
      : Math.floor(Date.now() / 1000);

    if (![1, 2].includes(claims?.v) || claims?.purpose !== ORDER_CONFIRMATION_PURPOSE) return null;
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    if (claims.iat > now + 60 || claims.exp <= now) return null;
    if (claims.exp <= claims.iat || claims.exp - claims.iat > ORDER_CONFIRMATION_TTL_SECONDS) return null;
    if (claims.v === 1) {
      if (!claims.orderId || !claims.paypalOrderId || !claims.captureId) return null;
      if (expected.orderId && !constantTimeEqual(claims.orderId, expected.orderId)) return null;
      if (expected.paypalOrderId && !constantTimeEqual(claims.paypalOrderId, expected.paypalOrderId)) return null;
      if (expected.captureId && !constantTimeEqual(claims.captureId, expected.captureId)) return null;
    } else {
      if (!claims.orderId || claims.provider !== 'stripe' || !claims.paymentId || !claims.paymentReference) return null;
      if (expected.orderId && !constantTimeEqual(claims.orderId, expected.orderId)) return null;
      if (expected.provider && !constantTimeEqual(claims.provider, expected.provider)) return null;
      if (expected.paymentId && !constantTimeEqual(claims.paymentId, expected.paymentId)) return null;
      if (expected.paymentReference && !constantTimeEqual(claims.paymentReference, expected.paymentReference)) return null;
      if (options.order) {
        const orderIntent = String(options.order.stripe_payment_intent_id || '').trim();
        const orderCharge = String(options.order.stripe_charge_id || '').trim() || '-';
        if (!orderIntent || !constantTimeEqual(claims.paymentId, orderIntent)) return null;
        if (!constantTimeEqual(claims.paymentReference, orderCharge)) return null;
      }
    }

    return claims;
  } catch {
    return null;
  }
}

function paymentBindingForOrder(order) {
  const paypalOrderId = String(order?.paypal_order_id || '').trim();
  const paypalCaptureId = String(order?.paypal_capture_id || '').trim();
  if (paypalOrderId && paypalCaptureId) {
    return `paypal:${paypalOrderId}:${paypalCaptureId}`;
  }

  const stripeIntentId = String(order?.stripe_payment_intent_id || '').trim();
  const stripeChargeId = String(order?.stripe_charge_id || '').trim();
  if (stripeIntentId) {
    return `stripe:${stripeIntentId}:${stripeChargeId || '-'}`;
  }

  // Historical orders may predate provider-reference columns. The signed
  // fallback stays bound to immutable order/payment facts rather than email or
  // other customer PII. It is accepted only while the order remains settled.
  const orderId = String(order?.id || '').trim();
  const createdAt = String(order?.created_at || '').trim();
  const totalCents = Number(order?.total_cents);
  const paymentMethod = String(order?.payment_method || 'legacy').trim().toLowerCase();
  if (orderId && createdAt && Number.isSafeInteger(totalCents) && totalCents >= 0) {
    return `legacy:${orderId}:${createdAt}:${totalCents}:${paymentMethod}`;
  }
  return '';
}

function paymentBindingDigest(order) {
  const binding = paymentBindingForOrder(order);
  return binding
    ? crypto.createHash('sha256').update(binding).digest('base64url')
    : '';
}

function createGuestOrderViewToken(order, options = {}) {
  if (!PAID_ORDER_STATUSES.has(String(order?.status || '').toLowerCase())) {
    throw new Error('A paid order is required to create a guest order view token');
  }
  const orderId = cleanBoundValue(order?.id, 'orderId', 100);
  const paymentDigest = paymentBindingDigest(order);
  if (!paymentDigest) {
    throw new Error('Payment binding is required to create a guest order view token');
  }
  const secret = orderViewSecrets(order, options)[0];
  if (!secret) throw new Error('ORDER_VIEW_TOKEN_SECRET is not configured');

  const issuedAt = Number.isFinite(options.nowSeconds)
    ? Math.floor(options.nowSeconds)
    : Math.floor(Date.now() / 1000);
  const ttlSeconds = Number.isFinite(options.ttlSeconds)
    ? Math.max(1, Math.min(Math.floor(options.ttlSeconds), ORDER_VIEW_TTL_SECONDS))
    : ORDER_VIEW_TTL_SECONDS;
  const payload = base64url(JSON.stringify({
    v: 1,
    purpose: ORDER_VIEW_PURPOSE,
    orderId,
    paymentDigest,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));

  return `${payload}.${signatureFor(ORDER_VIEW_PURPOSE, payload, secret)}`;
}

function verifyGuestOrderViewToken(token, order, options = {}) {
  const normalizedToken = String(token || '').trim();
  const secrets = orderViewSecrets(order, options);
  if (!secrets.length || !normalizedToken || normalizedToken.length > 4096) return null;

  const parts = normalizedToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;
  if (!secrets.some((secret) => constantTimeEqual(
    signature,
    signatureFor(ORDER_VIEW_PURPOSE, payload, secret),
  ))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Number.isFinite(options.nowSeconds)
      ? Math.floor(options.nowSeconds)
      : Math.floor(Date.now() / 1000);
    const expectedOrderId = String(order?.id || '').trim();
    const expectedPaymentDigest = paymentBindingDigest(order);

    if (claims?.v !== 1 || claims?.purpose !== ORDER_VIEW_PURPOSE) return null;
    if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
    if (claims.iat > now + 60 || claims.exp <= now) return null;
    if (claims.exp <= claims.iat || claims.exp - claims.iat > ORDER_VIEW_TTL_SECONDS) return null;
    if (!claims.orderId || !claims.paymentDigest || !expectedOrderId || !expectedPaymentDigest) return null;
    if (!constantTimeEqual(claims.orderId, expectedOrderId)) return null;
    if (!constantTimeEqual(claims.paymentDigest, expectedPaymentDigest)) return null;
    if (!PAID_ORDER_STATUSES.has(String(order?.status || '').toLowerCase())) return null;
    return claims;
  } catch {
    return null;
  }
}

function createGuestOrderViewUrl(origin, order, options = {}) {
  const parsedOrigin = new URL(String(origin || ''));
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new Error('A valid site origin is required to create an order view URL');
  }
  const token = createGuestOrderViewToken(order, options);
  const url = new URL(`/orders/${encodeURIComponent(cleanBoundValue(order?.id, 'orderId', 100))}`, parsedOrigin);
  url.hash = new URLSearchParams({ [ORDER_VIEW_FRAGMENT_PARAM]: token }).toString();
  return url.toString();
}

function readOrderConfirmationToken(event) {
  const headers = event?.headers || {};
  return String(
    headers[ORDER_CONFIRMATION_HEADER]
    || headers['X-Order-Confirmation-Token']
    || '',
  ).trim();
}

function readOrderViewToken(event) {
  const headers = event?.headers || {};
  return String(
    headers[ORDER_VIEW_HEADER]
    || headers['X-Order-View-Token']
    || '',
  ).trim();
}

function confirmationMatchesPaidOrder(claims, order) {
  if (!claims || !order || !PAID_ORDER_STATUSES.has(String(order.status || '').toLowerCase())) return false;
  if (!constantTimeEqual(claims.orderId, order.id)) return false;
  if (claims.v === 2 && claims.provider === 'stripe') {
    return Boolean(
      order.stripe_payment_intent_id
      && constantTimeEqual(claims.paymentId, order.stripe_payment_intent_id)
      && constantTimeEqual(claims.paymentReference, String(order.stripe_charge_id || '').trim() || '-'),
    );
  }
  return Boolean(
    constantTimeEqual(claims.paypalOrderId, order.paypal_order_id)
    && constantTimeEqual(claims.captureId, order.paypal_capture_id),
  );
}

module.exports = {
  ORDER_CONFIRMATION_HEADER,
  ORDER_CONFIRMATION_PURPOSE,
  ORDER_CONFIRMATION_TTL_SECONDS,
  ORDER_VIEW_FRAGMENT_PARAM,
  ORDER_VIEW_HEADER,
  ORDER_VIEW_PURPOSE,
  ORDER_VIEW_TTL_SECONDS,
  PAID_ORDER_STATUSES,
  confirmationMatchesPaidOrder,
  constantTimeEqual,
  createGuestOrderViewToken,
  createGuestOrderViewUrl,
  createOrderConfirmationToken,
  createProviderOrderConfirmationToken,
  createPaidOrderConfirmationToken,
  paymentBindingForOrder,
  readOrderConfirmationToken,
  readOrderViewToken,
  verifyGuestOrderViewToken,
  verifyOrderConfirmationToken,
};
