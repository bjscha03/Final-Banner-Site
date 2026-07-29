const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOrderAccessToken,
  verifyOrderAccessToken,
} = require('../_shared/order-email-access.cjs');

const secret = 'test-order-link-secret';
const nowMs = Date.UTC(2026, 6, 28, 23, 0, 0);
const orderId = '2ad3018b-680a-463e-b761-9fdcf8a0d993';
const email = 'dmc112298@gmail.com';

test('signed order token grants only the matching order and checkout email', () => {
  const token = createOrderAccessToken(orderId, email, {
    secret,
    nowMs,
    ttlSeconds: 300,
  });

  assert.ok(token);
  assert.equal(verifyOrderAccessToken(token, orderId, email, { secret, nowMs }), true);
  assert.equal(verifyOrderAccessToken(token, `${orderId}-wrong`, email, { secret, nowMs }), false);
  assert.equal(verifyOrderAccessToken(token, orderId, 'other@example.com', { secret, nowMs }), false);
  assert.equal(verifyOrderAccessToken(`${token}tampered`, orderId, email, { secret, nowMs }), false);
});

test('signed order token expires and email matching is case-insensitive', () => {
  const token = createOrderAccessToken(orderId, 'DMC112298@GMAIL.COM', {
    secret,
    nowMs,
    ttlSeconds: 60,
  });

  assert.equal(verifyOrderAccessToken(token, orderId, email, { secret, nowMs: nowMs + 59_000 }), true);
  assert.equal(verifyOrderAccessToken(token, orderId, email, { secret, nowMs: nowMs + 61_000 }), false);
});
