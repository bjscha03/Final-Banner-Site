'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reservation = require('../_shared/payment-discount-reservation.cjs');
const checkout = require('../_shared/stripe-checkout-service.cjs');

const source = fs.readFileSync(
  path.resolve(__dirname, '../_shared/payment-discount-reservation.cjs'),
  'utf8',
);

const appliedNew20Order = (overrides = {}) => ({
  id: 'order-new20',
  status: 'pending',
  user_id: null,
  email: 'buyer@example.com',
  discount_code: 'NEW20',
  applied_discount_type: 'promo',
  applied_discount_cents: 2000,
  is_test_order: false,
  ...overrides,
});

test('NEW20 locks every identity used by its user-or-email ownership predicate', () => {
  const guest = reservation.customerReservationIdentities(appliedNew20Order());
  const signedIn = reservation.customerReservationIdentities(appliedNew20Order({
    user_id: '11111111-1111-4111-8111-111111111111',
    email: 'BUYER@example.com',
  }));
  const sameUserNewEmail = reservation.customerReservationIdentities(appliedNew20Order({
    user_id: '11111111-1111-4111-8111-111111111111',
    email: 'new-address@example.com',
  }));

  assert.ok(guest.includes('email:buyer@example.com'));
  assert.ok(signedIn.includes('email:buyer@example.com'));
  assert.ok(signedIn.includes('user:11111111-1111-4111-8111-111111111111'));
  assert.ok(sameUserNewEmail.includes('user:11111111-1111-4111-8111-111111111111'));
  assert.match(source, /sql\.transaction/);
  assert.match(source, /ORDER BY lock_id/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /isolationLevel:\s*'ReadCommitted'/);
  assert.match(source, /LOWER\(candidate\.email\)/);
  assert.match(source, /candidate\.user_id/);
});

test('concurrent signed-in and guest NEW20 claims for the same email have one winner', async () => {
  const signedIn = appliedNew20Order({
    id: 'order-signed-in',
    user_id: '11111111-1111-4111-8111-111111111111',
  });
  const guest = appliedNew20Order({ id: 'order-guest' });
  let arrived = 0;
  let openBarrier;
  const barrier = new Promise((resolve) => { openBarrier = resolve; });
  let owner = null;
  let serialized = Promise.resolve();

  const sqlFor = (order) => {
    const sql = async () => [];
    sql.transaction = async () => {
      arrived += 1;
      if (arrived === 2) openBarrier();
      await barrier;
      const result = serialized.then(() => {
        const sameCustomer = owner && (
          (order.user_id && owner.user_id === order.user_id)
          || owner.email.toLowerCase() === order.email.toLowerCase()
        );
        if (!owner) {
          owner = order;
          return [{ id: order.id }];
        }
        return sameCustomer && owner.id !== order.id ? [] : [{ id: order.id }];
      });
      serialized = result.then(() => undefined, () => undefined);
      return [[{ acquired: 1 }], await result];
    };
    return sql;
  };

  const outcomes = await Promise.allSettled([
    checkout.claimOrderDiscountForPayment(sqlFor(signedIn), signedIn),
    checkout.claimOrderDiscountForPayment(sqlFor(guest), guest),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(outcomes.find(({ status }) => status === 'rejected').reason.code, 'CHECKOUT_DETAILS_CHANGED');
});

test('an abandoned unreserved pending NEW20 order does not block the first checkout that reaches payment', async () => {
  let query = '';
  const sql = async () => [];
  sql.transaction = async (build) => {
    const statements = [];
    build((strings) => {
      statements.push(strings.join(' '));
      return Promise.resolve([]);
    });
    query = statements[1];
    return [[{ acquired: 1 }], [{ id: 'order-paying-now' }]];
  };
  const result = await reservation.claimPaymentDiscount(
    sql,
    appliedNew20Order({ id: 'order-paying-now' }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.claimed, true);
  assert.doesNotMatch(query, /unreserved_winner/);
  assert.doesNotMatch(query, /ORDER BY candidate\.created_at/);
  assert.match(query, /payment_reconciliation_status = 'discount_reserved'/);
});

test('stored-code reservation locks the pending order before claiming inventory', async () => {
  let query = '';
  const result = await reservation.claimPaymentDiscount(async (strings) => {
    query = strings.join(' ');
    return [{ id: 'order-stored' }];
  }, {
    id: 'order-stored',
    status: 'pending',
    email: 'buyer@example.com',
    abandoned_cart_id: '11111111-1111-4111-8111-111111111111',
    discount_code: 'ONCE20',
    applied_discount_type: 'promo',
    applied_discount_cents: 2000,
    is_test_order: false,
  });

  assert.equal(result.ok, true);
  assert.match(query, /locked_target AS MATERIALIZED/);
  assert.match(query, /FOR UPDATE OF target/);
  assert.ok(query.indexOf('locked_target AS MATERIALIZED') < query.indexOf('UPDATE discount_codes dc'));
  assert.match(query, /FROM locked_target/);
  assert.match(query, /target\.abandoned_cart_id, target\.email/);
  assert.match(query, /dc\.cart_id IS NULL OR dc\.cart_id = locked_target\.abandoned_cart_id/);
  assert.match(query, /LOWER\(BTRIM\(dc\.email\)\) = LOWER\(BTRIM\(locked_target\.email\)\)/);
  assert.match(query, /dc\.activated_at IS NOT NULL/);
  assert.match(query, /dc\.expires_at > NOW\(\)/);
});

test('recovery-code reservation locks and rechecks the exact active cart after order creation', async () => {
  let query = '';
  const result = await reservation.claimPaymentDiscount(async (strings) => {
    const currentQuery = strings.join(' ');
    if (/locked_recovery_cart AS MATERIALIZED/.test(currentQuery)) query = currentQuery;
    return [];
  }, {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'pending',
    email: 'buyer@example.com',
    abandoned_cart_id: '11111111-1111-4111-8111-111111111111',
    discount_code: 'CART25-SECURE',
    applied_discount_type: 'promo',
    applied_discount_cents: 2500,
    is_test_order: false,
  });

  assert.equal(result.ok, false);
  assert.match(query, /locked_recovery_cart AS MATERIALIZED/);
  assert.match(query, /locked_target\.abandoned_cart_id = recovery_cart\.id/);
  assert.match(query, /recovery_cart\.recovery_status IN \('active', 'abandoned'\)/);
  assert.match(query, /FOR UPDATE OF recovery_cart/);
  assert.match(query, /completed_order\.id <> locked_target\.id/);
  assert.match(query, /completed_order\.abandoned_cart_id = recovery_cart\.id/);
  assert.match(query, /COALESCE\(completed_order\.is_test_order, FALSE\) = FALSE/);
  assert.match(
    query,
    /completed_order\.status, ''\)\)\) IN \(\s*'paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'/,
  );
  assert.match(query, /completed_order\.status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
  assert.match(query, /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status/);
  assert.match(query, /dc\.cart_id IN \(SELECT id FROM locked_recovery_cart\)/);
  assert.ok(query.indexOf('locked_recovery_cart AS MATERIALIZED') < query.indexOf('UPDATE discount_codes dc'));
});

test('reservations are never stolen solely because an order timestamp is old', () => {
  assert.doesNotMatch(source, /INTERVAL\s+'24 hours'|updated_at\s*</i);
  assert.match(source, /Only an explicit release/);
});

test('paid-order retry can durably complete its stored-code reservation', async () => {
  let query = '';
  const result = await reservation.completePaymentDiscount(async (strings) => {
    query = strings.join(' ');
    return [{ code: 'ONCE20' }];
  }, {
    id: 'order-paid',
    status: 'paid',
    user_id: '11111111-1111-4111-8111-111111111111',
    email: 'buyer@example.com',
    discount_code: 'ONCE20',
    applied_discount_type: 'promo',
    applied_discount_cents: 2000,
    is_test_order: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'stored');
  assert.match(query, /used_by_user_id/);
  assert.match(query, /used_by_email/);
  assert.match(query, /order_id = COALESCE\(order_id/);
});

test('a promo label that lost to a quantity discount never touches inventory', async () => {
  let queries = 0;
  const result = await reservation.claimPaymentDiscount(async () => {
    queries += 1;
    return [];
  }, {
    id: 'order-quantity',
    discount_code: 'ONCE20',
    applied_discount_type: 'quantity',
    applied_discount_cents: 3000,
    is_test_order: false,
  });
  assert.equal(result.kind, 'not_applied');
  assert.equal(queries, 0);
});

test('recovery discount completion emits idempotent applied and used funnel events', async () => {
  const calls = [];
  await reservation.logRecoveryDiscountConsumption(async (strings, ...values) => {
    calls.push({ query: strings.join(' '), values });
    return [];
  }, {
    id: '22222222-2222-4222-8222-222222222222',
    discount_code: 'CART25-SECURE',
    applied_discount_cents: 2500,
  }, {
    cart_id: '11111111-1111-4111-8111-111111111111',
    campaign: 'abandoned_cart_large_banner_25',
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].values.includes('discount_applied'));
  assert.ok(calls[1].values.includes('coupon_used'));
  for (const call of calls) {
    assert.match(call.query, /WHERE NOT EXISTS/);
    assert.match(call.query, /metadata->>'order_id'/);
    assert.match(call.query, /ON CONFLICT DO NOTHING/);
  }
});

test('an unavailable rolling-deploy analytics vocabulary cannot fail payment completion', async () => {
  let calls = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await reservation.completePaymentDiscount(async () => {
      calls += 1;
      if (calls === 1) {
        return [{
          code: 'CART25-SECURE',
          cart_id: '11111111-1111-4111-8111-111111111111',
          campaign: 'abandoned_cart_large_banner_25',
        }];
      }
      const error = new Error('event vocabulary not migrated');
      error.code = '23514';
      throw error;
    }, {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'paid',
      email: 'buyer@example.com',
      discount_code: 'CART25-SECURE',
      applied_discount_type: 'promo',
      applied_discount_cents: 2500,
      is_test_order: false,
    });
    assert.deepEqual(result, { ok: true, kind: 'stored' });
    assert.equal(calls, 3);
  } finally {
    console.warn = originalWarn;
  }
});
