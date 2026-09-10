const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createAbandonedCartRecoveryToken,
} = require('../_shared/abandoned-cart-recovery-token.cjs');

const {
  normalizedCartSessionId,
  normalizedOrderAbandonedCartSessionId,
  normalizedUuid,
  resolveAbandonedCartLink,
} = require('../_shared/legacy/create-order-core.cjs')._test;

const CART_ID = 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60';
const OTHER_CART_ID = 'b73d720b-9ff6-4cbb-8aa8-32e71c147e71';
const USER_ID = '1f692f32-9f8d-4a26-9a39-31c60f036331';
const RECOVERY_SECRET = 'order-link-recovery-secret';

function withRecoverySecret(run) {
  const previous = process.env.ABANDONED_CART_RECOVERY_SECRET;
  process.env.ABANDONED_CART_RECOVERY_SECRET = RECOVERY_SECRET;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previous === undefined) delete process.env.ABANDONED_CART_RECOVERY_SECRET;
      else process.env.ABANDONED_CART_RECOVERY_SECRET = previous;
    });
}

test('normalizes only bounded cart ownership identifiers', () => {
  assert.equal(normalizedUuid(` ${CART_ID.toUpperCase()} `), CART_ID);
  assert.equal(normalizedUuid('not-a-uuid'), null);
  assert.equal(normalizedUuid('00000000-0000-0000-0000-000000000000'), null);
  assert.equal(normalizedCartSessionId('session_abc-123:xyz'), 'session_abc-123:xyz');
  assert.equal(normalizedCartSessionId('bad session id'), null);
});

test('normalizes the delayed-snapshot session hint without treating test orders as recoveries', () => {
  assert.equal(normalizedOrderAbandonedCartSessionId({
    abandonedCartSessionId: ' checkout_session:abc-123 ',
  }), 'checkout_session:abc-123');
  assert.equal(normalizedOrderAbandonedCartSessionId({
    abandoned_cart_session_id: 'snake_case_session',
  }), 'snake_case_session');
  assert.equal(normalizedOrderAbandonedCartSessionId({
    abandonedCartSessionId: 'bad session id',
  }), null);
  assert.equal(normalizedOrderAbandonedCartSessionId({
    abandonedCartSessionId: 'a'.repeat(201),
  }), null);
  assert.equal(normalizedOrderAbandonedCartSessionId({
    abandonedCartSessionId: 'real-session',
    is_test_order: true,
  }), null);
});

test('links a submitted cart only through an ownership-check query', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{ id: CART_ID }];
  };

  const result = await resolveAbandonedCartLink(sql, {
    cartId: CART_ID,
    sessionId: 'session_abc-123',
    userId: USER_ID,
    email: ' Buyer@Example.com ',
    isTestOrder: false,
  });

  assert.equal(result, CART_ID);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /recovery_status IN \('active', 'abandoned'\)/);
  assert.match(calls[0].query, /user_id/);
  assert.match(calls[0].query, /session_id/);
  assert.match(calls[0].query, /LOWER\(BTRIM\(email\)\)/);
  assert.ok(calls[0].values.includes('buyer@example.com'));
});

test('does not query or link invalid and test cart hints', async () => {
  let calls = 0;
  const sql = async () => { calls += 1; return [{ id: CART_ID }]; };
  assert.equal(await resolveAbandonedCartLink(sql, { cartId: 'bad', email: 'buyer@example.com' }), null);
  assert.equal(await resolveAbandonedCartLink(sql, { cartId: CART_ID, email: 'buyer@example.com', isTestOrder: true }), null);
  assert.equal(calls, 0);
});

test('a signed recovery credential authorizes only its exact submitted cart', async () => withRecoverySecret(async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{ id: CART_ID }];
  };
  const recoveryToken = createAbandonedCartRecoveryToken({
    cartId: CART_ID,
    sequenceNumber: 2,
    expiresInSeconds: 3600,
    secret: RECOVERY_SECRET,
  });

  assert.equal(await resolveAbandonedCartLink(sql, {
    cartId: CART_ID,
    recoveryToken,
    isTestOrder: false,
  }), CART_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.includes(true), true);

  calls.length = 0;
  assert.equal(await resolveAbandonedCartLink(sql, {
    cartId: OTHER_CART_ID,
    recoveryToken,
    sessionId: 'session_that_must_not_bypass_a_mismatch',
    email: 'buyer@example.com',
    isTestOrder: false,
  }), null);
  assert.equal(calls.length, 0);

  assert.equal(await resolveAbandonedCartLink(sql, {
    cartId: CART_ID,
    recoveryToken: `${recoveryToken}tampered`,
    sessionId: 'session_that_must_not_bypass_tampering',
    email: 'buyer@example.com',
    isTestOrder: false,
  }), null);
  assert.equal(calls.length, 0);

  assert.equal(await resolveAbandonedCartLink(sql, {
    cartId: CART_ID,
    recoveryToken,
    isTestOrder: true,
  }), null);
  assert.equal(calls.length, 0);
}));

// Keep this source-level check aligned with the current PayPal attribution variable.
test('both provider paths carry the validated cart link and bounded session hint into the order row', () => {
  const core = fs.readFileSync(path.resolve(__dirname, '../_shared/legacy/create-order-core.cjs'), 'utf8');
  const stripe = fs.readFileSync(path.resolve(__dirname, '../_shared/stripe-checkout-service.cjs'), 'utf8');
  const paypal = fs.readFileSync(path.resolve(__dirname, '../../../src/components/checkout/PayPalCheckoutReliable.tsx'), 'utf8');

  assert.match(core, /abandoned_cart_id, abandoned_cart_session_id\)/);
  assert.match(core, /\$\{linkedAbandonedCartId\}, \$\{linkedAbandonedCartSessionId\}\)/);
  assert.match(core, /this value is never positive email or recovery attribution on its own/);
  assert.match(core, /idx_orders_abandoned_cart_session_created_at/);
  assert.match(stripe, /abandonedCartId: input\?\.abandonedCartId/);
  assert.match(stripe, /abandonedCartSessionId: input\?\.abandonedCartSessionId/);
  assert.match(stripe, /abandonedCartRecoveryToken: input\?\.abandonedCartRecoveryToken/);
  assert.match(core, /verifyAbandonedCartRecoveryToken\(submittedRecoveryToken\)/);
  assert.match(paypal, /selectAbandonedCartPaymentAttribution\(\{/);
  assert.match(paypal, /\.\.\.abandonedCartAttribution/);
  assert.match(paypal, /const abandonedCartSessionId = getAbandonedCartSessionId\(\);/);
  assert.match(paypal, /sessionId: abandonedCartSessionId/);
});
