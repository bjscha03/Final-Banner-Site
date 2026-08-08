'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORDER_CONFIRMATION_TTL_SECONDS,
  ORDER_VIEW_TTL_SECONDS,
  confirmationMatchesPaidOrder,
  createGuestOrderViewToken,
  createGuestOrderViewUrl,
  createOrderConfirmationToken,
  createPaidOrderConfirmationToken,
  readOrderConfirmationToken,
  readOrderViewToken,
  verifyGuestOrderViewToken,
  verifyOrderConfirmationToken,
} = require('../_shared/order-confirmation-token.cjs');

const secret = 'test-only-order-confirmation-secret';
const nowSeconds = 1_800_000_000;
const order = {
  id: '86cd85b5-8f8e-4a72-8d63-243dadfc9914',
  status: 'paid',
  paypal_order_id: 'PAYPAL-ORDER-123',
  paypal_capture_id: 'PAYPAL-CAPTURE-456',
  checkout_idempotency_key: 'checkout-key-with-at-least-32-random-characters',
  created_at: '2026-08-06T18:00:00.000Z',
  total_cents: 10300,
  payment_method: 'paypal',
};

const createToken = (overrides = {}, options = {}) => createOrderConfirmationToken({
  orderId: order.id,
  paypalOrderId: order.paypal_order_id,
  captureId: order.paypal_capture_id,
  ...overrides,
}, { secret, nowSeconds, ...options });

test('confirmation token is short-lived and bound to all three payment identifiers', () => {
  const token = createToken();
  const claims = verifyOrderConfirmationToken(token, {
    orderId: order.id,
    paypalOrderId: order.paypal_order_id,
    captureId: order.paypal_capture_id,
  }, { secret, nowSeconds });

  assert.equal(claims.orderId, order.id);
  assert.equal(claims.exp - claims.iat, ORDER_CONFIRMATION_TTL_SECONDS);
  assert.equal(confirmationMatchesPaidOrder(claims, order), true);
  assert.equal(confirmationMatchesPaidOrder(claims, { ...order, status: 'pending' }), false);
  assert.equal(confirmationMatchesPaidOrder(claims, { ...order, paypal_capture_id: 'OTHER' }), false);
});

test('confirmation token cannot authorize a different order or PayPal capture', () => {
  const token = createToken();

  assert.equal(verifyOrderConfirmationToken(token, { orderId: 'different-order' }, { secret, nowSeconds }), null);
  assert.equal(verifyOrderConfirmationToken(token, { captureId: 'different-capture' }, { secret, nowSeconds }), null);
  assert.equal(verifyOrderConfirmationToken(token, { paypalOrderId: 'different-paypal-order' }, { secret, nowSeconds }), null);
});

test('tampered and expired confirmation tokens are rejected', () => {
  const token = createToken();
  const [payload, signature] = token.split('.');
  const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(verifyOrderConfirmationToken(`${tamperedPayload}.${signature}`, {}, { secret, nowSeconds }), null);
  assert.equal(verifyOrderConfirmationToken(token, {}, {
    secret,
    nowSeconds: nowSeconds + ORDER_CONFIRMATION_TTL_SECONDS,
  }), null);
});

test('only a paid order with PayPal capture proof can receive a token', () => {
  assert.throws(
    () => createPaidOrderConfirmationToken({ ...order, status: 'pending' }, { secret, nowSeconds }),
    /paid order/i,
  );
  assert.throws(
    () => createPaidOrderConfirmationToken({ ...order, paypal_capture_id: null }, { secret, nowSeconds }),
    /captureId is required/i,
  );
  assert.ok(createPaidOrderConfirmationToken(order, { secret, nowSeconds }));
});

test('Stripe confirmation token v2 is provider-neutral and bound to intent plus charge', () => {
  const stripeOrder = {
    ...order,
    payment_method: 'stripe',
    paypal_order_id: null,
    paypal_capture_id: null,
    stripe_payment_intent_id: 'pi_test_123',
    stripe_charge_id: 'ch_test_456',
  };
  const token = createPaidOrderConfirmationToken(stripeOrder, { secret, nowSeconds });
  const claims = verifyOrderConfirmationToken(token, { orderId: stripeOrder.id }, {
    secret,
    nowSeconds,
    order: stripeOrder,
  });
  assert.equal(claims.v, 2);
  assert.equal(claims.provider, 'stripe');
  assert.equal(claims.paymentId, stripeOrder.stripe_payment_intent_id);
  assert.equal(confirmationMatchesPaidOrder(claims, stripeOrder), true);
  assert.equal(confirmationMatchesPaidOrder(claims, { ...stripeOrder, stripe_charge_id: 'ch_other' }), false);
  assert.equal(verifyOrderConfirmationToken(token, {}, {
    secret,
    nowSeconds,
    order: { ...stripeOrder, stripe_payment_intent_id: 'pi_other' },
  }), null);
});

test('confirmation credential is read only from its request header', () => {
  const token = createToken();
  assert.equal(readOrderConfirmationToken({
    headers: { 'x-order-confirmation-token': token },
    queryStringParameters: { orderConfirmationToken: 'query-token-must-not-be-used' },
  }), token);
  assert.equal(readOrderConfirmationToken({
    headers: {},
    queryStringParameters: { orderConfirmationToken: token },
  }), '');
});

test('guest order view token is distinct, long-lived, and paid/payment-bound', () => {
  const token = createGuestOrderViewToken(order, { secret, nowSeconds });
  const claims = verifyGuestOrderViewToken(token, order, { secret, nowSeconds });

  assert.equal(claims.orderId, order.id);
  assert.equal(claims.exp - claims.iat, ORDER_VIEW_TTL_SECONDS);
  assert.equal(verifyGuestOrderViewToken(token, { ...order, id: 'different-order' }, { secret, nowSeconds }), null);
  assert.equal(verifyGuestOrderViewToken(token, { ...order, paypal_capture_id: 'OTHER' }, { secret, nowSeconds }), null);
  assert.equal(verifyGuestOrderViewToken(token, { ...order, status: 'pending' }, { secret, nowSeconds }), null);
  assert.equal(verifyGuestOrderViewToken(token, { ...order, status: 'shipped' }, { secret, nowSeconds })?.orderId, order.id);
});

test('guest order view token rejects tampering, expiry, and the short-lived confirmation purpose', () => {
  const viewToken = createGuestOrderViewToken(order, { secret, nowSeconds });
  const confirmationToken = createToken();
  const [payload, signature] = viewToken.split('.');
  const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(verifyGuestOrderViewToken(`${tamperedPayload}.${signature}`, order, { secret, nowSeconds }), null);
  assert.equal(verifyGuestOrderViewToken(viewToken, order, {
    secret,
    nowSeconds: nowSeconds + ORDER_VIEW_TTL_SECONDS,
  }), null);
  assert.equal(verifyGuestOrderViewToken(confirmationToken, order, { secret, nowSeconds }), null);
  assert.equal(verifyOrderConfirmationToken(viewToken, {}, { secret, nowSeconds }), null);
});

test('emailed guest order URL carries the credential only in the fragment', () => {
  const url = new URL(createGuestOrderViewUrl('https://www.bannersonthefly.com', order, {
    secret,
    nowSeconds,
  }));

  assert.equal(url.pathname, `/orders/${order.id}`);
  assert.equal(url.search, '');
  assert.ok(url.hash.startsWith('#orderView='));
  const token = new URLSearchParams(url.hash.slice(1)).get('orderView');
  assert.ok(verifyGuestOrderViewToken(token, order, { secret, nowSeconds }));
});

test('guest view credential is accepted only from its dedicated request header', () => {
  const token = createGuestOrderViewToken(order, { secret, nowSeconds });
  assert.equal(readOrderViewToken({
    headers: { 'x-order-view-token': token },
    queryStringParameters: { orderView: 'query-token-must-not-be-used' },
  }), token);
  assert.equal(readOrderViewToken({
    headers: {},
    queryStringParameters: { orderView: token },
  }), '');
});

test('new orders can use their random checkout key when no global signing secret exists', () => {
  const names = [
    'ORDER_VIEW_TOKEN_SECRET',
    'ORDER_VIEW_TOKEN_SECRET_PREVIOUS',
    'ORDER_CONFIRMATION_TOKEN_SECRET',
    'AUTH_SESSION_SECRET',
    'CLOUDINARY_API_SECRET',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const confirmationToken = createPaidOrderConfirmationToken(order, { nowSeconds });
    const viewToken = createGuestOrderViewToken(order, { nowSeconds });

    assert.ok(verifyOrderConfirmationToken(confirmationToken, { orderId: order.id }, {
      order,
      nowSeconds,
    }));
    assert.ok(verifyGuestOrderViewToken(viewToken, order, { nowSeconds }));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
