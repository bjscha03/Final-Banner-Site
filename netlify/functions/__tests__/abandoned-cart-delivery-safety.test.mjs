import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sendModule = require('../_shared/legacy/send-abandoned-cart-email.cjs');
const detector = require('../_shared/legacy/detect-abandoned-carts.cjs');
const deleteModule = require('../_shared/legacy/delete-abandoned-cart.cjs');
const discountModule = require('../_shared/legacy/generate-discount.cjs');
const suppressionModule = require('../_shared/email-suppression.cjs');
const tokenModule = require('../_shared/cart-recovery-token.cjs');
const strictRecoveryToken = require('../_shared/abandoned-cart-recovery-token.cjs');
const unsubscribeModule = require('../_shared/recovery-email-unsubscribe.cjs');
const paidRecovery = require('../_shared/abandoned-cart-order-recovery.cjs');
const stripeCheckout = require('../_shared/stripe-checkout-service.cjs');
const discountValidation = require('../_shared/discount-validation.cjs');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

const cartId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  ABANDONED_CART_RECOVERY_SECRET: process.env.ABANDONED_CART_RECOVERY_SECRET,
  RECOVERY_EMAIL_TOKEN_SECRET: process.env.RECOVERY_EMAIL_TOKEN_SECRET,
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

function queryText(first) {
  return Array.isArray(first) ? first.join('?') : String(first || '');
}

test.before(() => {
  process.env.AUTH_SESSION_SECRET = 'test-admin-session-secret';
  process.env.ABANDONED_CART_RECOVERY_SECRET = 'test-cart-recovery-secret';
  process.env.RECOVERY_EMAIL_TOKEN_SECRET = 'test-unsubscribe-secret';
  process.env.NETLIFY_DATABASE_URL = 'postgres://recovery-test.invalid/db';
  process.env.RESEND_API_KEY = 're_test_key';
});

test.after(() => {
  sendModule._test.resetDependencies();
  detector._test.resetDependencies();
  unsubscribeModule._test.resetDependencies();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function deliveryFixture({ providerError = null } = {}) {
  const state = { claim: false, sent: 0, failed: false, sends: 0, payload: null, options: null };
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'guest-session',
    email: ' Buyer@Example.com ',
    normalized_email: 'buyer@example.com',
    cart_contents: [{ width_in: 48, height_in: 24, quantity: 2, material: 'vinyl', line_total_cents: 5000 }],
    total_value: '50.00',
    estimated_total_cents: 5000,
    discount_code: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-09-01T00:00:00.000Z',
  };
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) {
      return [{ ...cart, recovery_emails_sent: state.sent }];
    }
    if (/SELECT id[\s\S]+FROM orders/i.test(query)) return [];
    if (/\beligible AS\s*\(/i.test(query)) {
      if (state.claim || state.sent > 0) return [];
      state.claim = true;
      return [{ ...cart, recovery_status: 'abandoned', recovery_email_claim_sequence: 1 }];
    }
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [{ id: cartId }];
    }
    if (/AS stop_reason[\s\S]+recovery_email_claim_sequence/i.test(query)) return [{ stop_reason: null }];
    if (/WITH delivered AS/i.test(query)) {
      assert.equal(state.claim, true);
      state.sent = 1;
      state.claim = false;
      return [{ id: cartId }];
    }
    if (/WITH failed AS/i.test(query)) {
      state.failed = true;
      state.claim = false;
      return [];
    }
    return [];
  };
  const resend = {
    emails: {
      send: async (payload, options) => {
        state.sends += 1;
        state.payload = payload;
        state.options = options;
        if (providerError) return { data: null, error: { message: providerError, statusCode: 503 } };
        return { data: { id: 'recovery-message-1' }, error: null };
      },
    },
  };
  return { state, sql, resend };
}

test('concurrent sequence claims produce one Resend call and one durable completion', async () => {
  const fixture = deliveryFixture();
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  const results = await Promise.all([
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
  ]);

  assert.equal(fixture.state.sends, 1);
  assert.equal(fixture.state.sent, 1);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.skipped).length, 1);
  assert.equal(fixture.state.options.idempotencyKey, `abandoned-cart/${cartId}/sequence/1`);
  assert.ok(fixture.state.options.signal instanceof AbortSignal);
  assert.equal(fixture.state.options.signal.aborted, false);
  assert.equal(fixture.state.payload.to, 'buyer@example.com');
  assert.match(fixture.state.payload.html, /\/checkout\?recovery=/);
  assert.doesNotMatch(fixture.state.payload.html, /recover_cart|[?&]cart=/);
  assert.match(fixture.state.payload.headers['List-Unsubscribe'], /recovery-email-unsubscribe\?token=/);

  const recoveryHref = fixture.state.payload.html.match(/href="(https:\/\/bannersonthefly\.com\/checkout\?recovery=[^"]+)/)?.[1];
  assert.ok(recoveryHref);
  const recoveryToken = new URL(recoveryHref).searchParams.get('recovery');
  assert.deepEqual(strictRecoveryToken.verifyAbandonedCartRecoveryToken(recoveryToken), {
    cartId,
    sequenceNumber: 1,
    expiresAt: strictRecoveryToken.verifyAbandonedCartRecoveryToken(recoveryToken).expiresAt,
  });
});

test('Resend {data,error} failures release the claim for the next hourly retry', async () => {
  const fixture = deliveryFixture({ providerError: 'temporary provider outage' });
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  await assert.rejects(
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
    /temporary provider outage/,
  );
  assert.equal(fixture.state.sends, 1);
  assert.equal(fixture.state.sent, 0);
  assert.equal(fixture.state.failed, true);
  assert.equal(fixture.state.claim, false);
});

test('the established three recovery subjects, offer levels, and expiry copy remain unchanged', () => {
  const data = {
    cartItems: [{
      width_in: 48,
      height_in: 24,
      quantity: 2,
      material: '<script>vinyl</script>',
      line_total_cents: 5000,
    }],
    totalValue: 50,
    discountCode: '<CODE&VALUE>',
    recoveryUrl: 'https://bannersonthefly.com/checkout?recovery=signed-token',
    unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/recovery-email-unsubscribe?token=signed-token',
  };
  const first = sendModule.generateEmailHTML(1, data);
  const second = sendModule.generateEmailHTML(2, data);
  const third = sendModule.generateEmailHTML(3, data);

  assert.equal(first.subject, '👋 You left something behind at Banners On The Fly');
  assert.equal(second.subject, "🎁 Here's 10% off to complete your order");
  assert.equal(third.subject, '🔥 LAST CHANCE: 15% off your order (expires soon!)');
  assert.match(first.html, /Your cart is waiting for you!/);
  assert.doesNotMatch(first.html, /10% off|15% off/);
  assert.match(second.html, /10% off • Expires in 48 hours/);
  assert.match(second.html, /You Save:[\s\S]+New Total:/);
  assert.match(third.html, /15% off • Expires in 24 hours/);
  assert.match(third.html, /You Save:[\s\S]+Final Price:[\s\S]+This is your last chance!/);
  assert.doesNotMatch(second.html, /<script>/);
  assert.match(second.html, /&lt;script&gt;vinyl&lt;\/script&gt;/);
  assert.match(second.html, /&lt;CODE&amp;VALUE&gt;/);
  for (const email of [first, second, third]) {
    assert.match(email.html, /checkout\?recovery=signed-token/);
    assert.match(email.html, /Unsubscribe from cart-recovery emails/);
  }
});

test('upgrading to the 15% offer expires the prior unused cart offer and recovered carts reject non-owner bearer codes', async () => {
  let issueQuery = '';
  let issueValues = [];
  const code = await sendModule._test.getOrCreateDiscountCode(async (first, ...values) => {
    const query = queryText(first);
    if (/WITH superseded_offers AS/i.test(query)) {
      issueQuery = query;
      issueValues = values;
      return [{ code: 'CART15-UPGRADED' }];
    }
    return [];
  }, {
    id: cartId,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    discount_code: 'CART10-PRIOR',
  }, 3);
  assert.equal(code, 'CART15-UPGRADED');
  assert.match(issueQuery, /UPDATE discount_codes/);
  assert.match(issueQuery, /used = FALSE/);
  assert.match(issueQuery, /discount_percentage < \?/);
  assert.match(issueQuery, /expires_at = LEAST\(expires_at, NOW\(\)\)/);
  assert.doesNotMatch(issueQuery, /SET used = TRUE/);
  assert.equal(issueValues.includes(15), true);
  assert.equal(issueValues.includes(24), true);

  const validation = await discountValidation.validateDiscountForCheckout({
    sql: async (first) => {
      const query = queryText(first);
      if (/FROM trade_show_promo_codes/i.test(query)) return [];
      if (/FROM discount_codes/i.test(query)) return [{
        id: 'discount-prior',
        code: 'CART10-PRIOR',
        discount_percentage: 10,
        used: false,
        expires_at: '2099-01-01T00:00:00.000Z',
        email: 'buyer@example.com',
        cart_id: cartId,
        recovery_cart_status: 'recovered',
        owned_by_checkout: false,
      }];
      return [];
    },
    code: 'CART10-PRIOR',
    email: 'buyer@example.com',
    checkoutKey: 'checkout-owned-prior-offer',
  });
  assert.equal(validation.valid, false);
  assert.match(validation.error, /no longer active/i);
});

test('recovery suppressions win and cold-outreach prior_customer does not suppress', async () => {
  const queryResults = [
    [{ reason: 'unsubscribed' }],
  ];
  const suppressed = await suppressionModule.findEmailSuppression(async () => queryResults.shift() || [], 'buyer@example.com');
  assert.deepEqual(suppressed, {
    suppressed: true,
    reason: 'unsubscribed',
    source: 'recovery_email_suppressions',
  });

  const priorCustomerSql = async (first) => {
    const query = queryText(first);
    if (/FROM outbound_suppressions/i.test(query)) return [{ reason: 'prior_customer' }];
    return [];
  };
  assert.deepEqual(
    await suppressionModule.findEmailSuppression(priorCustomerSql, 'buyer@example.com'),
    { suppressed: false, reason: null, source: null },
  );

  const bounceSql = async (first) => {
    const query = queryText(first);
    if (/FROM outbound_suppressions/i.test(query)) return [{ reason: 'hard_bounce' }];
    return [];
  };
  assert.deepEqual(await suppressionModule.findEmailSuppression(bounceSql, 'buyer@example.com'), {
    suppressed: true,
    reason: 'hard_bounce',
    source: 'outbound_suppressions',
  });

  const outboundReasons = [
    'unsubscribe', 'unsubscribed', 'complaint', 'spam_complaint', 'hard_bounce', 'legal',
    'blocklist', 'manual', 'wrong_contact', 'duplicate', 'provider_suppressed',
    'consent_false', 'consent_withdrawn',
  ];
  let outboundQuery = '';
  for (const reason of outboundReasons) {
    const result = await suppressionModule.findEmailSuppression(async (first) => {
      const query = queryText(first);
      if (/FROM recovery_email_suppressions/i.test(query)) return [];
      if (/FROM outbound_suppressions/i.test(query)) {
        outboundQuery = query;
        return [{ reason }];
      }
      return [];
    }, 'buyer@example.com');
    assert.deepEqual(result, { suppressed: true, reason, source: 'outbound_suppressions' });
  }
  for (const reason of outboundReasons) assert.match(outboundQuery, new RegExp(`'${reason}'`));
});

test('unsubscribe tokens hide the email and both footer and one-click POST persist suppression', async () => {
  const token = tokenModule.createRecoveryUnsubscribeToken('Buyer@Example.com', {
    secret: 'unsubscribe-test-secret',
    nowSeconds: 1_000,
  });
  assert.equal(token.includes('buyer'), false);
  assert.deepEqual(
    tokenModule.verifyRecoveryUnsubscribeToken(token, { secret: 'unsubscribe-test-secret', nowSeconds: 1_001 }).email,
    'buyer@example.com',
  );
  assert.equal(
    tokenModule.verifyRecoveryUnsubscribeToken(`${token}x`, { secret: 'unsubscribe-test-secret', nowSeconds: 1_001 }),
    null,
  );

  process.env.RECOVERY_EMAIL_TOKEN_SECRET = 'unsubscribe-test-secret';
  const liveToken = tokenModule.createRecoveryUnsubscribeToken('Buyer@Example.com', {
    secret: 'unsubscribe-test-secret',
  });
  const queries = [];
  unsubscribeModule._test.setEnsureSchema(async () => {});
  unsubscribeModule._test.setNeonFactory(() => async (first, ...values) => {
    queries.push({ query: queryText(first), values });
    return [{ normalized_email: 'buyer@example.com' }];
  });
  const response = await unsubscribeModule.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    queryStringParameters: { token: liveToken },
    body: 'List-Unsubscribe=One-Click',
  });
  assert.equal(response.statusCode, 200);
  assert.match(queries[0].query, /INSERT INTO recovery_email_suppressions/i);
  assert.match(queries[0].query, /UPDATE abandoned_carts/i);
  assert.equal(queries[0].values.includes('buyer@example.com'), true);
  assert.equal(response.body.includes('buyer@example.com'), false);
});

test('manual recovery mutations require a verified admin session', async () => {
  const event = { httpMethod: 'POST', headers: {}, body: JSON.stringify({ cartId, sequenceNumber: 1 }) };
  assert.equal((await sendModule.handler(event)).statusCode, 401);
  assert.equal((await discountModule.handler({ ...event, body: JSON.stringify({ cartId }) })).statusCode, 401);
  assert.equal((await deleteModule.handler({ ...event, httpMethod: 'DELETE', body: JSON.stringify({ cartId }) })).statusCode, 401);
});

test('the scheduler keeps failed sequences retryable at 1/24/72 hours and records no-email abandonment', async () => {
  const queries = [];
  const sql = async (first) => {
    queries.push(queryText(first));
    return [];
  };
  await detector._test.abandonInactiveCarts(sql);
  await detector._test.dueCandidates(sql, 1);
  await detector._test.dueCandidates(sql, 2);
  await detector._test.dueCandidates(sql, 3);
  assert.match(queries[0], /last_activity_at <= NOW\(\) - INTERVAL '1 hour'/);
  assert.doesNotMatch(queries[0], /AND\s+NULLIF\(BTRIM\(email\)/);
  assert.match(queries[1], /recovery_emails_sent = 0/);
  assert.match(queries[2], /recovery_emails_sent = 1/);
  assert.match(queries[2], /INTERVAL '24 hours'/);
  assert.match(queries[3], /recovery_emails_sent = 2/);
  assert.match(queries[3], /INTERVAL '72 hours'/);
  assert.deepEqual(detector._test.deliverySummary([
    { success: true }, { skipped: true }, { failed: true }, null,
  ]), { sent: 1, skipped: 1, failed: 2 });
});

test('paid-order recovery prefers the exact validated cart and never runs for test orders', async () => {
  const calls = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    calls.push({ query, values });
    if (/UPDATE abandoned_carts/i.test(query)) return [{ id: cartId }];
    return [];
  };
  const order = {
    id: orderId,
    abandoned_cart_id: cartId,
    user_id: userId,
    email: 'buyer@example.com',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  };
  const recovered = await paidRecovery.markAbandonedCartRecovered(sql, order);
  assert.deepEqual(recovered, [{ id: cartId }]);
  assert.match(calls[0].query, /cart\.id = .*::uuid/);
  assert.match(calls[0].query, /cart\.created_at <=/);
  assert.match(calls[0].query, /ORDER BY cart\.last_activity_at DESC/);
  assert.match(calls[0].query, /LIMIT 1/);
  assert.match(calls[0].query, /SET abandoned_cart_id = COALESCE/);
  assert.match(calls[0].query, /'cart_recovered'/);
  assert.equal(calls[0].values.includes(cartId), true);
  assert.equal(calls[0].values.includes(userId), true);

  calls.length = 0;
  assert.deepEqual(await paidRecovery.markAbandonedCartRecovered(sql, { ...order, is_test_order: true }), []);
  assert.equal(calls.length, 0);
});

test('paid-order recovery trusts an exact server-validated cart link when customer identity changed', async () => {
  const calls = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    calls.push({ query, values });
    if (/UPDATE abandoned_carts/i.test(query)) return [{ id: cartId }];
    return [];
  };

  const recovered = await paidRecovery.markAbandonedCartRecovered(sql, {
    id: orderId,
    abandoned_cart_id: cartId,
    user_id: null,
    email: 'changed-at-checkout@example.net',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  });

  assert.deepEqual(recovered, [{ id: cartId }]);
  assert.equal(calls[0].values.includes(cartId), true);
  assert.match(calls[0].query, /cart\.id = .*::uuid/);
  assert.match(calls[0].query, /::uuid IS NULL[\s\S]+cart\.user_id/);
});

test('a persisted cart session is exclusive and never falls through to another user or email cart', async () => {
  let query = '';
  let values = [];
  const recovered = await paidRecovery.markAbandonedCartRecovered(async (first, ...boundValues) => {
    query = queryText(first);
    values = boundValues;
    return [];
  }, {
    id: orderId,
    abandoned_cart_id: null,
    abandoned_cart_session_id: 'intended_checkout_session',
    user_id: userId,
    email: 'buyer@example.com',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  });

  assert.deepEqual(recovered, []);
  assert.equal(values.includes('intended_checkout_session'), true);
  assert.match(query, /\?::text IS NOT NULL[\s\S]+cart\.session_id = \?::text/);
  assert.match(query, /last_activity_at >= \?::timestamptz - INTERVAL '30 minutes'/);
  assert.match(query, /last_activity_at <= \?::timestamptz \+ INTERVAL '10 minutes'/);
  assert.match(query, /\?::text IS NULL[\s\S]+cart\.user_id[\s\S]+LOWER\(BTRIM\(cart\.email\)\)/);
});

test('Stripe and every PayPal settlement projection retain the authoritative cart session hint', async () => {
  const stripeQueries = [];
  const sql = async (first) => {
    stripeQueries.push(queryText(first));
    return [{
      id: orderId,
      checkout_idempotency_key: 'checkout-key',
      abandoned_cart_session_id: 'intended_checkout_session',
    }];
  };
  await stripeCheckout.loadStripeOrder(sql, { paymentIntentId: 'pi_test' });
  await stripeCheckout.loadStripeOrder(sql, { orderId });
  await stripeCheckout.loadStripeOrder(sql, { checkoutKey: 'checkout-key' });
  assert.equal(stripeQueries.length, 3);
  assert.equal(stripeQueries.every((query) => /abandoned_cart_session_id/.test(query)), true);

  const paypalSource = fs.readFileSync(
    path.resolve(testDirectory, '../_shared/legacy/paypal-capture-final.cjs'),
    'utf8',
  );
  assert.equal(
    (paypalSource.match(/to_jsonb\(orders\)->>'abandoned_cart_session_id' AS abandoned_cart_session_id/g) || []).length,
    3,
  );
  assert.match(paypalSource, /RETURNING id,[\s\S]+abandoned_cart_session_id[\s\S]+if \(!persisted\)/);
  assert.match(paypalSource, /if \(!persisted\)[\s\S]+SELECT id,[\s\S]+abandoned_cart_session_id/);
});

test('completed-order checks keep exact attribution while stopping older same-identity carts', async () => {
  let query = '';
  const result = await sendModule._test.findCompletedOrder(async (first) => {
    query = queryText(first);
    return [{ id: orderId, recovery_target: false }];
  }, {
    id: cartId,
    user_id: userId,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    created_at: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(result.recovery_target, false);
  assert.match(query, /abandoned_cart_id/);
  assert.match(query, /status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'\)/);
  assert.match(query, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
  assert.match(query, /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/);
  assert.match(query, /abandoned_cart_id' = \?::text\s+OR \(\s*NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL/s);
  assert.match(query, /NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL[\s\S]*order_row\.user_id[\s\S]*LOWER\(BTRIM\(order_row\.email\)\)/);
  assert.match(query, /abandoned_cart_id', ''\) IS NOT NULL[\s\S]*linked_cart\.user_id[\s\S]*linked_cart\.session_id/);
  assert.match(query, /order_row\.created_at <= candidate\.last_activity_at \+ INTERVAL '96 hours'/);
  assert.ok(
    (query.match(/order_row\.created_at <= \?[\s\S]{0,80}INTERVAL '96 hours'/g) || []).length >= 3,
    'identity and explicit-other-cart inference must remain bounded',
  );
  assert.match(query, /ORDER BY candidate\.last_activity_at DESC/);
  assert.match(query, /LIMIT 1/);

  let settlementQuery = '';
  await detector._test.settleCompletedCarts(async (first) => {
    settlementQuery = queryText(first);
    return [];
  });
  assert.match(settlementQuery, /WITH cart_batch AS/);
  assert.match(settlementQuery, /FOR UPDATE SKIP LOCKED/);
  assert.match(settlementQuery, /status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'\)/);
  assert.match(settlementQuery, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
  assert.match(settlementQuery, /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/);
  assert.match(settlementQuery, /abandoned_cart_id' = cart\.id::text\s+OR \(\s+NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL/s);
  assert.match(settlementQuery, /NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL[\s\S]*order_row\.user_id[\s\S]*LOWER\(BTRIM\(order_row\.email\)\)/);
  assert.match(settlementQuery, /cart_id = recovery_target_id AS recovery_target/);
  assert.match(settlementQuery, /WHEN targets\.recovery_target AND targets\.order_status <> 'refunded' THEN 'recovered'/);
  assert.match(settlementQuery, /WHERE settled\.recovery_target/);
  assert.match(settlementQuery, /SET abandoned_cart_id = COALESCE/);
  assert.match(settlementQuery, /'cart_recovered'/);
  assert.match(settlementQuery, /batch_order\.created_at <= batch_cart\.last_activity_at \+ INTERVAL '96 hours'/);
  assert.ok(
    (settlementQuery.match(/order_row\.created_at <= cart\.last_activity_at \+ INTERVAL '96 hours'/g) || []).length >= 3,
    'scheduled identity and explicit-other-cart inference must remain bounded',
  );
});

test('a refunded completed order stops delivery without recording positive recovery', async () => {
  let query = '';
  let values = [];
  await sendModule._test.markRecovered(async (first, ...boundValues) => {
    query = queryText(first);
    values = boundValues;
    return [];
  }, cartId, orderId, 2, true, 'refunded');

  assert.equal(values.includes('expired'), true);
  assert.equal(values.includes('completed_order_refunded'), true);
  assert.equal(values.includes(false), true);
  assert.match(query, /recovery_status = \?/);
  assert.match(query, /WHERE \?\s+AND NOT EXISTS/);
});
