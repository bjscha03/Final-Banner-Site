'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const credit = require('../_shared/credit-paypal-service.cjs');
const auth = require('../_shared/server-auth.cjs');
const createHandler = require('../_shared/legacy/paypal-create-credits-order.cjs');
const captureHandler = require('../_shared/legacy/paypal-capture-credits-order.cjs');
const retiredNotifyHandler = require('../_shared/legacy/notify-credit-purchase.cjs');
const webhookHandler = require('../_shared/legacy/paypal-webhook-forward.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const TEST_KEY = 'credit_checkout_0123456789abcdef0123456789abcdef';
const OTHER_TEST_KEY = 'credit_checkout_fedcba9876543210fedcba9876543210';
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function configureSandbox() {
  process.env.AUTH_SESSION_SECRET = 'credit-test-session-secret';
  process.env.FEATURE_PAYPAL = '1';
  process.env.FEATURE_PAYPAL_CREDITS = '1';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_CLIENT_ID_SANDBOX = 'sandbox-client-id';
  process.env.PAYPAL_SECRET_SANDBOX = 'sandbox-secret';
  process.env.PAYPAL_WEBHOOK_ID = 'sandbox-credit-webhook';
  process.env.CONTEXT = 'deploy-preview';
  process.env.NETLIFY_DATABASE_URL = 'postgresql://credit-test.invalid/test';
}

function restore() {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  credit._resetSchemaForTests();
  createHandler._test.resetNeonFactory();
  captureHandler._test.resetNeonFactory();
  webhookHandler._test.resetNeonFactory();
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sessionEvent(body, user = { id: 'user-1', email: 'buyer@example.com' }) {
  const token = auth.createSessionToken({
    id: user.id,
    email: user.email,
    is_admin: false,
  });
  return {
    httpMethod: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  };
}

function providerOrder(purchase, {
  id = purchase.paypal_order_id || 'PAYPAL-CREDIT-1',
  status = 'APPROVED',
  captureId = null,
  captureStatus = 'COMPLETED',
  currency = 'USD',
  amountCents = Number(purchase.amount_cents),
  customId = credit.creditCustomId(purchase.id),
  invoiceId = credit.creditInvoiceId(purchase.id),
} = {}) {
  return {
    id,
    status,
    purchase_units: [{
      custom_id: customId,
      invoice_id: invoiceId,
      amount: { currency_code: currency, value: credit.moneyFromCents(amountCents) },
      ...(captureId ? {
        payments: {
          captures: [{
            id: captureId,
            status: captureStatus,
            amount: { currency_code: currency, value: credit.moneyFromCents(amountCents) },
          }],
        },
      } : {}),
    }],
  };
}

function purchase(overrides = {}) {
  return {
    id: 'credit-purchase-1',
    user_id: 'user-1',
    email: 'buyer@example.com',
    credits_purchased: 50,
    amount_cents: 2000,
    package_key: 'popular',
    currency: 'USD',
    status: 'pending',
    payment_method: 'paypal',
    checkout_idempotency_key: TEST_KEY,
    paypal_order_id: 'PAYPAL-CREDIT-1',
    paypal_capture_id: null,
    paypal_capture_request_id: null,
    payment_reconciliation_status: 'awaiting_capture',
    created_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function atomicCreditSql(initialPurchase = purchase()) {
  const state = {
    purchase: { ...initialPurchase },
    credits: 0,
    usageRows: 0,
    outboxRows: 0,
    failFulfillment: false,
  };
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('WITH transitioned AS')) {
      if (state.failFulfillment) throw new Error('simulated database outage');
      if (state.purchase.status === 'completed') return [];
      state.purchase = {
        ...state.purchase,
        status: 'completed',
        paypal_capture_id: 'CAPTURE-CREDIT-1',
        payment_reconciliation_status: 'complete',
        completed_at: '2026-08-08T00:01:00.000Z',
        credited_at: '2026-08-08T00:01:00.000Z',
      };
      state.credits += Number(state.purchase.credits_purchased);
      state.usageRows += 1;
      state.outboxRows += 1;
      return [{ ...state.purchase, paid_credits_balance: state.credits, usage_log_id: state.usageRows }];
    }
    if (query.includes('SET paypal_capture_request_id')) {
      state.purchase = {
        ...state.purchase,
        paypal_capture_request_id: credit.creditCaptureRequestId(state.purchase.id),
        payment_reconciliation_status: 'capture_requested',
      };
      return [{ ...state.purchase }];
    }
    if (query.includes('FROM orders') || (query.includes('FROM credit_purchases') && query.includes('id <>'))) return [];
    if (query.includes('FROM credit_purchases') && query.includes('WHERE id =')) {
      return [{ ...state.purchase }];
    }
    if (query.includes('UPDATE credit_purchases') && query.includes('payment_reconciliation_status')) return [];
    throw new Error(`Unexpected SQL in atomic test: ${query.slice(0, 120)}`);
  };
  return { sql, state };
}

test.afterEach(restore);

test('server package registry owns credits and price', () => {
  assert.deepEqual(credit.resolveCreditPackage('popular'), {
    id: 'popular', credits: 50, amountCents: 2000, label: '50 AI Generation Credits',
  });
  assert.throws(() => credit.resolveCreditPackage('browser-special'), (error) => (
    error.code === 'CREDIT_PACKAGE_INVALID' && error.statusCode === 400
  ));
});

test('checkout authorization keys require at least 32 strong-format characters', () => {
  assert.equal(credit.validateCheckoutKey(TEST_KEY), TEST_KEY);
  assert.throws(
    () => credit.validateCheckoutKey('short_checkout_key'),
    (error) => error.code === 'CHECKOUT_KEY_INVALID' && error.statusCode === 400,
  );
});

test('credit endpoints require a signed session before database or PayPal access', async () => {
  configureSandbox();
  let databaseCalls = 0;
  let providerCalls = 0;
  createHandler._test.setNeonFactory(() => async () => { databaseCalls += 1; return []; });
  captureHandler._test.setNeonFactory(() => async () => { databaseCalls += 1; return []; });
  global.fetch = async () => { providerCalls += 1; return response({}); };

  const createResult = await createHandler.handler({
    httpMethod: 'POST', headers: {}, body: JSON.stringify({ packageId: 'starter', checkoutKey: TEST_KEY }),
  });
  const captureResult = await captureHandler.handler({
    httpMethod: 'POST', headers: {}, body: JSON.stringify({ purchaseId: 'p', orderID: 'o', checkoutKey: TEST_KEY }),
  });
  assert.equal(createResult.statusCode, 401);
  assert.equal(captureResult.statusCode, 401);
  assert.equal(databaseCalls, 0);
  assert.equal(providerCalls, 0);
});

test('spoofed account fields and browser-authored package amounts fail closed', () => {
  const selected = credit.resolveCreditPackage('starter');
  const session = { sub: 'owner', email: 'owner@example.com' };
  assert.throws(
    () => createHandler._test.assertLegacyFieldsDoNotConflict({ userId: 'victim' }, session, selected),
    (error) => error.code === 'CREDIT_ACCOUNT_MISMATCH',
  );
  assert.throws(
    () => createHandler._test.assertLegacyFieldsDoNotConflict({ amountCents: 1 }, session, selected),
    (error) => error.code === 'CREDIT_PACKAGE_TAMPERED',
  );
});

test('create restart contract rotates only definitive no-capture failures', () => {
  const definitive = JSON.parse(createHandler._test.errorResponse(
    new credit.CreditPaymentError(
      'CREDIT_PAYPAL_CREATE_REJECTED',
      'Provider rejected create.',
      { statusCode: 502 },
    ),
  ).body);
  const identityConflict = JSON.parse(createHandler._test.errorResponse(
    new credit.CreditPaymentError(
      'CREDIT_PAYPAL_CREATE_IDENTITY_MISMATCH',
      'Provider identity mismatch.',
      { statusCode: 409 },
    ),
  ).body);
  const ambiguous = JSON.parse(createHandler._test.errorResponse(
    new credit.CreditPaymentError(
      'CREDIT_PAYPAL_CREATE_UNKNOWN',
      'Provider status unknown.',
      { statusCode: 202, retryable: true },
    ),
  ).body);
  assert.equal(definitive.restartPayment, true);
  assert.equal(definitive.retryAllowed, true);
  assert.equal(identityConflict.restartPayment, false);
  assert.equal(ambiguous.restartPayment, false);
  assert.equal(ambiguous.safeToRetry, true);
});

test('capture response unlocks a new payment only for a vetted definitive decline', () => {
  const conflict = JSON.parse(captureHandler._test.errorResponse(
    new credit.CreditPaymentError(
      'PAYPAL_PAYMENT_DOMAIN_CONFLICT',
      'Payment identity conflict.',
      { statusCode: 409 },
    ),
  ).body);
  const decline = JSON.parse(captureHandler._test.errorResponse(
    new credit.CreditPaymentError(
      'INSTRUMENT_DECLINED',
      'Funding source declined.',
      { statusCode: 422 },
    ),
  ).body);
  assert.equal(conflict.doNotRetry, true);
  assert.equal(conflict.restartPayment, false);
  assert.equal(decline.doNotRetry, false);
  assert.equal(decline.restartPayment, true);
});

test('credit PayPal configuration cannot mix preview and live credentials', () => {
  configureSandbox();
  assert.equal(credit.getCreditPayPalConfig().environment, 'sandbox');
  process.env.PAYPAL_ENV = 'live';
  process.env.PAYPAL_CLIENT_ID_LIVE = 'live-id';
  process.env.PAYPAL_SECRET_LIVE = 'live-secret';
  assert.throws(() => credit.getCreditPayPalConfig(), (error) => (
    error.code === 'PAYPAL_ENVIRONMENT_MISMATCH' && error.statusCode === 503
  ));
  process.env.CONTEXT = 'production';
  process.env.PAYPAL_ENV = 'sandbox';
  assert.throws(() => credit.getCreditPayPalConfig(), /Production credit payments require live/);
});

test('provider order is namespaced and carries exact custom, invoice, item, USD, and amount identity', () => {
  const saved = purchase();
  const body = credit.buildCreditPayPalOrder(saved, credit.resolveCreditPackage('popular'));
  const unit = body.purchase_units[0];
  assert.equal(unit.custom_id, `CREDIT:${saved.id}`);
  assert.equal(unit.invoice_id, `BOTF-CREDIT-${saved.id}`);
  assert.equal(unit.items[0].category, 'DIGITAL_GOODS');
  assert.equal(unit.items[0].quantity, '1');
  assert.equal(unit.amount.value, '20.00');
  assert.equal(unit.amount.breakdown.item_total.value, '20.00');
  assert.equal(body.application_context.shipping_preference, 'NO_SHIPPING');
});

test('a banner PayPal order is rejected before any capture call', async () => {
  configureSandbox();
  const saved = purchase();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/v1/oauth2/token')) return response({ access_token: 'token' });
    return response(providerOrder(saved, {
      customId: saved.id,
      invoiceId: `BOTF-${saved.id}`,
    }));
  };
  await assert.rejects(
    credit.reconcileCreditPayment({
      sql: async () => [],
      purchase: saved,
      paypalOrderId: saved.paypal_order_id,
      captureIfApproved: true,
      fetchImpl,
    }),
    (error) => error.code === 'CREDIT_PAYPAL_IDENTITY_MISMATCH' && error.statusCode === 409,
  );
  assert.equal(calls.some((url) => url.endsWith('/capture')), false);
});

test('capture route rejects an order already bound to the banner domain before PayPal access', async () => {
  configureSandbox();
  const saved = purchase();
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('FROM credit_purchases') && query.includes('WHERE id =')) return [{ ...saved }];
    if (query.includes('FROM orders') && query.includes('paypal_order_id')) return [{ id: 'banner-order-1' }];
    if (query.includes('FROM credit_purchases') && query.includes('id <>')) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 120)}`);
  };
  captureHandler._test.setNeonFactory(() => sql);
  let providerCalls = 0;
  global.fetch = async () => { providerCalls += 1; return response({}); };
  const result = await captureHandler.handler(sessionEvent({
    purchaseId: saved.id,
    orderID: saved.paypal_order_id,
    checkoutKey: TEST_KEY,
    reconcileOnly: false,
  }));
  assert.equal(result.statusCode, 409);
  assert.equal(JSON.parse(result.body).error, 'PAYPAL_PAYMENT_DOMAIN_CONFLICT');
  assert.equal(providerCalls, 0);
});

test('only an exact COMPLETED USD capture is valid', () => {
  const saved = purchase();
  const exact = providerOrder(saved, { status: 'COMPLETED', captureId: 'CAPTURE-CREDIT-1' });
  assert.equal(credit.validateCompletedCreditCapture(exact, saved).ok, true);
  assert.equal(credit.validateCompletedCreditCapture(
    providerOrder(saved, { status: 'COMPLETED', captureId: 'CAP', currency: 'EUR' }), saved,
  ).code, 'CREDIT_PAYPAL_IDENTITY_MISMATCH');
  assert.equal(credit.validateCompletedCreditCapture(
    providerOrder(saved, { status: 'APPROVED', captureId: 'CAP' }), saved,
  ).code, 'CREDIT_PAYPAL_ORDER_NOT_COMPLETED');
  assert.equal(credit.validateCompletedCreditCapture(
    providerOrder(saved, { status: 'COMPLETED', captureId: 'CAP', amountCents: 1999 }), saved,
  ).code, 'CREDIT_PAYPAL_IDENTITY_MISMATCH');
});

test('a provider-completed capture mismatch is reconciliation-only and never retryable as a new payment', async () => {
  configureSandbox();
  const saved = purchase();
  const mismatched = providerOrder(saved, {
    status: 'COMPLETED',
    captureId: 'CAPTURE-CREDIT-1',
  });
  mismatched.purchase_units[0].payments.captures[0].amount.value = '19.99';
  const fetchImpl = async (url) => (
    String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response(mismatched)
  );
  await assert.rejects(
    credit.reconcileCreditPayment({
      sql: async () => [],
      purchase: saved,
      paypalOrderId: saved.paypal_order_id,
      reconcileOnly: true,
      captureIfApproved: false,
      fetchImpl,
    }),
    (error) => error.statusCode === 202
      && error.paymentCaptured === true
      && error.code === 'CREDIT_CAPTURE_RECONCILIATION_REQUIRED',
  );
});

test('atomic fulfillment increments the balance and writes usage exactly once under concurrent replay', async () => {
  const saved = purchase();
  const validation = {
    ok: true, captureId: 'CAPTURE-CREDIT-1', currency: 'USD', amountCents: 2000,
  };
  const { sql, state } = atomicCreditSql(saved);
  const [first, second] = await Promise.all([
    credit.fulfillCreditPurchase(sql, saved, validation),
    credit.fulfillCreditPurchase(sql, saved, validation),
  ]);
  assert.deepEqual([first.newlyFulfilled, second.newlyFulfilled].sort(), [false, true]);
  assert.equal(state.credits, 50);
  assert.equal(state.usageRows, 1);
  assert.equal(state.outboxRows, 1);
  assert.equal(state.purchase.paypal_capture_id, 'CAPTURE-CREDIT-1');
});

test('a captured payment with a database outage returns 202 and later reconciles once', async () => {
  configureSandbox();
  const saved = purchase();
  const completed = providerOrder(saved, { status: 'COMPLETED', captureId: 'CAPTURE-CREDIT-1' });
  const { sql, state } = atomicCreditSql(saved);
  state.failFulfillment = true;
  const fetchCompleted = async (url) => (
    String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response(completed)
  );
  await assert.rejects(
    credit.reconcileCreditPayment({
      sql, purchase: saved, paypalOrderId: saved.paypal_order_id,
      reconcileOnly: true, captureIfApproved: false, fetchImpl: fetchCompleted,
    }),
    (error) => error.statusCode === 202 && error.paymentCaptured === true && error.captureId === 'CAPTURE-CREDIT-1',
  );
  assert.equal(state.credits, 0);
  state.failFulfillment = false;
  const settled = await credit.reconcileCreditPayment({
    sql, purchase: saved, paypalOrderId: saved.paypal_order_id,
    reconcileOnly: true, captureIfApproved: false, fetchImpl: fetchCompleted,
  });
  assert.equal(settled.newlyFulfilled, true);
  assert.equal(state.credits, 50);
  assert.equal(state.usageRows, 1);
});

test('an ambiguous capture persists its request ID and reconcile-only safely replays it after the feature gate closes', async () => {
  configureSandbox();
  const saved = purchase();
  const approved = providerOrder(saved, { status: 'APPROVED' });
  const completed = providerOrder(saved, { status: 'COMPLETED', captureId: 'CAPTURE-CREDIT-1' });
  const { sql, state } = atomicCreditSql(saved);
  const requestIds = [];
  let captureAttempts = 0;
  const fetchImpl = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/v1/oauth2/token')) return response({ access_token: 'token' });
    if (target.endsWith('/capture')) {
      captureAttempts += 1;
      requestIds.push(init.headers['PayPal-Request-Id']);
      if (captureAttempts === 1) throw new Error('response lost after request');
      return response(completed);
    }
    return response(approved);
  };

  await assert.rejects(
    credit.reconcileCreditPayment({
      sql, purchase: { ...state.purchase }, paypalOrderId: saved.paypal_order_id,
      captureIfApproved: true, reconcileOnly: false, fetchImpl,
    }),
    (error) => error.statusCode === 202
      && error.details?.captureRequestStarted === true,
  );
  assert.equal(state.purchase.paypal_capture_request_id, credit.creditCaptureRequestId(saved.id));

  process.env.FEATURE_PAYPAL = '0';
  process.env.FEATURE_PAYPAL_CREDITS = '0';
  const settled = await credit.reconcileCreditPayment({
    sql,
    purchase: { ...state.purchase },
    paypalOrderId: saved.paypal_order_id,
    captureIfApproved: false,
    reconcileOnly: true,
    requireFeature: false,
    fetchImpl,
  });
  assert.equal(settled.newlyFulfilled, true);
  assert.equal(state.credits, 50);
  assert.equal(captureAttempts, 2);
  assert.deepEqual(requestIds, [
    credit.creditCaptureRequestId(saved.id),
    credit.creditCaptureRequestId(saved.id),
  ]);
});

test('ORDER_ALREADY_CAPTURED with failed recovery remains locked in reconciliation', async () => {
  configureSandbox();
  const saved = purchase();
  const state = { purchase: { ...saved }, failedWrites: 0, reconciliationWrites: 0 };
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('SET paypal_capture_request_id')) {
      state.purchase.paypal_capture_request_id = credit.creditCaptureRequestId(saved.id);
      return [{ ...state.purchase }];
    }
    if (query.includes("SET status = 'failed'")) {
      state.failedWrites += 1;
      return [];
    }
    if (query.includes("payment_reconciliation_status = 'required'")) {
      state.reconciliationWrites += 1;
      return [];
    }
    if (query.includes('FROM credit_purchases') && query.includes('WHERE id =')) {
      return [{ ...state.purchase }];
    }
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  let providerGetCalls = 0;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.endsWith('/v1/oauth2/token')) return response({ access_token: 'token' });
    if (target.endsWith('/capture')) {
      return response({
        name: 'UNPROCESSABLE_ENTITY',
        details: [{ issue: 'ORDER_ALREADY_CAPTURED' }],
      }, 422);
    }
    providerGetCalls += 1;
    return providerGetCalls === 1
      ? response(providerOrder(saved, { status: 'APPROVED' }))
      : response({ name: 'INTERNAL_SERVER_ERROR' }, 503);
  };
  await assert.rejects(
    credit.reconcileCreditPayment({
      sql,
      purchase: saved,
      paypalOrderId: saved.paypal_order_id,
      captureIfApproved: true,
      reconcileOnly: false,
      fetchImpl,
    }),
    (error) => error.statusCode === 202
      && error.code === 'CREDIT_PAYMENT_STATUS_UNKNOWN'
      && error.details?.captureRequestStarted === true,
  );
  assert.equal(state.failedWrites, 0);
  assert.equal(state.reconciliationWrites, 1);
  assert.equal(state.purchase.paypal_capture_request_id, credit.creditCaptureRequestId(saved.id));
});

test('schema duplicate preflight fails before a provider request', async () => {
  configureSandbox();
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    queries.push(query);
    if (query.includes('duplicate_count')) {
      return [{ provider_field: 'paypal_capture_id', provider_id: 'DUPLICATE', duplicate_count: 2 }];
    }
    return [];
  };
  createHandler._test.setNeonFactory(() => sql);
  let providerCalls = 0;
  global.fetch = async () => { providerCalls += 1; return response({}); };
  const result = await createHandler.handler(sessionEvent({
    packageId: 'starter', checkoutKey: TEST_KEY,
  }));
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).error, 'CREDIT_PAYMENT_SCHEMA_RECONCILIATION_REQUIRED');
  assert.equal(providerCalls, 0);
  assert.equal(queries.some((query) => query.includes('CREATE UNIQUE INDEX')), false);
});

test('signed create persists pending first and validates the provider echo before linking', async () => {
  configureSandbox();
  let saved = null;
  let providerBody = null;
  let insertSeenBeforeProvider = false;
  let userSeedQuery = null;
  const sql = async (strings, ...values) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('INSERT INTO users')) {
      userSeedQuery = query;
      return [];
    }
    if (query.includes('INSERT INTO credit_purchases')) {
      saved = purchase({
        id: values[0], user_id: values[1], email: values[2],
        credits_purchased: values[3], amount_cents: values[4], package_key: values[5],
        checkout_idempotency_key: values[6], paypal_order_id: null,
      });
      insertSeenBeforeProvider = true;
      return [{ ...saved }];
    }
    if (query.includes('SET paypal_order_id')) {
      saved.paypal_order_id = values[0];
      return [{ ...saved }];
    }
    if (query.includes('FROM orders') || (query.includes('FROM credit_purchases') && query.includes('id <>'))) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 120)}`);
  };
  createHandler._test.setNeonFactory(() => sql);
  global.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) return response({ access_token: 'token' });
    assert.equal(insertSeenBeforeProvider, true);
    providerBody = JSON.parse(init.body);
    return response({ id: 'PAYPAL-CREDIT-NEW', status: 'CREATED', purchase_units: providerBody.purchase_units }, 201);
  };
  const result = await createHandler.handler(sessionEvent({
    packageId: 'starter', checkoutKey: TEST_KEY,
  }));
  const payload = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(payload.orderID, 'PAYPAL-CREDIT-NEW');
  assert.equal(saved.user_id, 'user-1');
  assert.equal(saved.email, 'buyer@example.com');
  assert.match(userSeedQuery, /ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(userSeedQuery, /DO UPDATE/);
  assert.equal(providerBody.purchase_units[0].custom_id, `CREDIT:${saved.id}`);
  assert.equal(providerBody.purchase_units[0].amount.value, '5.00');
});

test('ambiguous PayPal create returns the saved binding and retries the same provider request', async () => {
  configureSandbox();
  let saved = null;
  let createCalls = 0;
  const providerRequestIds = [];
  const sql = async (strings, ...values) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')
        || query.includes('INSERT INTO users')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('INSERT INTO credit_purchases')) {
      if (saved) return [];
      saved = purchase({
        id: values[0], user_id: values[1], email: values[2],
        credits_purchased: values[3], amount_cents: values[4], package_key: values[5],
        checkout_idempotency_key: values[6], paypal_order_id: null,
      });
      return [{ ...saved }];
    }
    if (query.includes('WHERE checkout_idempotency_key')) return [{ ...saved }];
    if (query.includes('FROM orders') || (query.includes('FROM credit_purchases') && query.includes('id <>'))) return [];
    if (query.includes('SET paypal_order_id')) {
      saved.paypal_order_id = values[0];
      return [{ ...saved }];
    }
    if (query.includes('payment_reconciliation_status') && query.includes('UPDATE credit_purchases')) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 120)}`);
  };
  createHandler._test.setNeonFactory(() => sql);
  global.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/v1/oauth2/token')) return response({ access_token: 'token' });
    createCalls += 1;
    providerRequestIds.push(init.headers['PayPal-Request-Id']);
    if (createCalls === 1) throw new Error('provider response lost');
    const body = JSON.parse(init.body);
    return response({
      id: 'PAYPAL-CREDIT-REPLAY',
      status: 'CREATED',
      purchase_units: body.purchase_units,
    }, 201);
  };

  const first = await createHandler.handler(sessionEvent({ packageId: 'starter', checkoutKey: TEST_KEY }));
  const firstPayload = JSON.parse(first.body);
  assert.equal(first.statusCode, 202);
  assert.equal(firstPayload.safeToRetry, true);
  assert.equal(firstPayload.purchaseId, saved.id);
  assert.equal(firstPayload.checkoutKey, TEST_KEY);

  const second = await createHandler.handler(sessionEvent({ packageId: 'starter', checkoutKey: TEST_KEY }));
  assert.equal(second.statusCode, 200);
  assert.equal(JSON.parse(second.body).orderID, 'PAYPAL-CREDIT-REPLAY');
  assert.deepEqual(providerRequestIds, [
    `credit-create-${saved.id}`,
    `credit-create-${saved.id}`,
  ]);
});

test('create retry that finds a completed provider payment reports captured reconciliation on DB failure', async () => {
  configureSandbox();
  const saved = purchase({ status: 'reconciliation' });
  const completed = providerOrder(saved, {
    status: 'COMPLETED',
    captureId: 'CAPTURE-CREDIT-1',
  });
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')
        || query.includes('INSERT INTO users')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('INSERT INTO credit_purchases')) return [];
    if (query.includes('WHERE checkout_idempotency_key')) return [{ ...saved }];
    if (query.includes('FROM orders') || (query.includes('FROM credit_purchases') && query.includes('id <>'))) return [];
    if (query.includes('WITH transitioned AS')) throw new Error('database unavailable after capture');
    if (query.includes('payment_reconciliation_status') && query.includes('UPDATE credit_purchases')) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  createHandler._test.setNeonFactory(() => sql);
  global.fetch = async (url) => (
    String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response(completed)
  );
  const result = await createHandler.handler(sessionEvent({
    packageId: 'popular',
    checkoutKey: TEST_KEY,
  }));
  const payload = JSON.parse(result.body);
  assert.equal(result.statusCode, 202);
  assert.equal(payload.paymentCaptured, true);
  assert.equal(payload.doNotRetry, true);
  assert.equal(payload.safeToRetry, false);
});

test('create retry never rotates a provider-completed payment with capture identity mismatch', async () => {
  configureSandbox();
  const saved = purchase({ status: 'reconciliation' });
  const completed = providerOrder(saved, {
    status: 'COMPLETED',
    captureId: 'CAPTURE-CREDIT-1',
  });
  completed.purchase_units[0].payments.captures[0].amount.value = '19.99';
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')
        || query.includes('INSERT INTO users')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('INSERT INTO credit_purchases')) return [];
    if (query.includes('WHERE checkout_idempotency_key')) return [{ ...saved }];
    if (query.includes('FROM orders') || (query.includes('FROM credit_purchases') && query.includes('id <>'))) return [];
    if (query.includes('payment_reconciliation_status') && query.includes('UPDATE credit_purchases')) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  createHandler._test.setNeonFactory(() => sql);
  global.fetch = async (url) => (
    String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response(completed)
  );
  const result = await createHandler.handler(sessionEvent({
    packageId: 'popular',
    checkoutKey: TEST_KEY,
  }));
  const payload = JSON.parse(result.body);
  assert.equal(result.statusCode, 202);
  assert.equal(payload.paymentCaptured, true);
  assert.equal(payload.doNotRetry, true);
  assert.equal(payload.restartPayment, false);
});

test('durable credit receipt retries safely and sends once with the database email and stable idempotency key', async () => {
  const saved = purchase({
    status: 'completed',
    paypal_capture_id: 'CAPTURE-CREDIT-1',
  });
  const state = { deliveryStatus: 'pending', messageId: null, attempts: 0 };
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('JOIN credit_purchase_notification_outbox')) {
      return [{
        ...saved,
        delivery_status: state.deliveryStatus,
        provider_message_id: state.messageId,
      }];
    }
    if (query.includes("SET delivery_status = 'sending'")) {
      if (!['pending', 'failed'].includes(state.deliveryStatus)) return [];
      state.deliveryStatus = 'sending';
      state.attempts += 1;
      return [{ purchase_id: saved.id }];
    }
    if (query.includes("SET delivery_status = 'failed'")) {
      state.deliveryStatus = 'failed';
      return [];
    }
    if (query.includes("SET delivery_status = 'sent'")) {
      state.deliveryStatus = 'sent';
      state.messageId = 'resend-credit-1';
      return [];
    }
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  const sends = [];
  const failingClient = {
    emails: { send: async (payload, options) => {
      sends.push({ payload, options });
      return { error: { message: 'temporary email failure' } };
    } },
  };
  const first = await credit.processCreditPurchaseNotification(sql, saved.id, {
    resendClient: failingClient,
  });
  assert.equal(first.complete, false);
  assert.equal(state.deliveryStatus, 'failed');

  const successfulClient = {
    emails: { send: async (payload, options) => {
      sends.push({ payload, options });
      return { data: { id: 'resend-credit-1' } };
    } },
  };
  const second = await credit.processCreditPurchaseNotification(sql, saved.id, {
    resendClient: successfulClient,
  });
  const third = await credit.processCreditPurchaseNotification(sql, saved.id, {
    resendClient: successfulClient,
  });
  assert.equal(second.complete, true);
  assert.equal(third.alreadySent, true);
  assert.equal(state.attempts, 2);
  assert.equal(sends.length, 2);
  assert.equal(sends[1].payload.to, 'buyer@example.com');
  assert.equal(sends[1].options.idempotencyKey, `credit-receipt/${saved.id}`);
});

test('legacy completed credit without an outbox is tombstoned without replaying an uncertain receipt', async () => {
  const saved = purchase({ status: 'completed', paypal_capture_id: 'LEGACY-CAPTURE-1' });
  let tombstones = 0;
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('LEFT JOIN credit_purchase_notification_outbox')) {
      return [{ ...saved, delivery_status: null, provider_message_id: null }];
    }
    if (query.includes('legacy_skipped')) {
      tombstones += 1;
      return [];
    }
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  let sends = 0;
  const result = await credit.processCreditPurchaseNotification(sql, saved.id, {
    resendClient: { emails: { send: async () => { sends += 1; return {}; } } },
  });
  assert.equal(result.complete, true);
  assert.equal(result.legacySkipped, true);
  assert.equal(tombstones, 1);
  assert.equal(sends, 0);
});

test('capture checkout key mismatch is rejected before OAuth or capture', async () => {
  configureSandbox();
  const saved = purchase();
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('ALTER TABLE credit_purchases') || query.includes('CREATE UNIQUE INDEX')
        || query.includes('CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox')) return [];
    if (query.includes('duplicate_count')) return [];
    if (query.includes('FROM credit_purchases') && query.includes('WHERE id =')) return [{ ...saved }];
    throw new Error(`Unexpected SQL: ${query.slice(0, 120)}`);
  };
  captureHandler._test.setNeonFactory(() => sql);
  let providerCalls = 0;
  global.fetch = async () => { providerCalls += 1; return response({}); };
  const result = await captureHandler.handler(sessionEvent({
    purchaseId: saved.id,
    orderID: saved.paypal_order_id,
    checkoutKey: OTHER_TEST_KEY,
  }));
  assert.equal(result.statusCode, 401);
  assert.equal(providerCalls, 0);
});

test('verified webhook rejects a provider ID shared by banner and credit domains before fulfillment', async () => {
  configureSandbox();
  const updates = [];
  const sql = async (strings, ...values) => {
    const query = strings.join(' ? ');
    if (query.includes('CREATE TABLE IF NOT EXISTS paypal_webhook_events')) return [];
    if (query.includes('SELECT processing_status')) return [];
    if (query.includes('INSERT INTO paypal_webhook_events')) return [];
    if (query.includes('FROM credit_purchases') && query.includes('OR paypal_capture_id')) {
      return [{
        id: 'credit-purchase-1',
        paypal_order_id: 'PAYPAL-SHARED-1',
        paypal_capture_id: null,
      }];
    }
    if (query.includes('FROM orders') && query.includes('OR paypal_capture_id')) {
      return [{
        id: 'banner-order-1',
        checkout_idempotency_key: 'banner-key',
        paypal_order_id: 'PAYPAL-SHARED-1',
        paypal_capture_id: null,
      }];
    }
    if (query.includes('UPDATE paypal_webhook_events')) {
      updates.push(values);
      return [];
    }
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  webhookHandler._test.setNeonFactory(() => sql);
  let providerCalls = 0;
  global.fetch = async (url) => {
    providerCalls += 1;
    return String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response({ verification_status: 'SUCCESS' });
  };
  const result = await webhookHandler.handler({
    httpMethod: 'POST',
    headers: {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'transmission-1',
      'paypal-transmission-sig': 'signature',
      'paypal-transmission-time': '2026-08-08T00:00:00Z',
    },
    body: JSON.stringify({
      id: 'WEBHOOK-CREDIT-COLLISION-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-SHARED-1',
        supplementary_data: { related_ids: { order_id: 'PAYPAL-SHARED-1' } },
      },
    }),
  });
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).error, 'PAYPAL_PAYMENT_DOMAIN_CONFLICT');
  assert.equal(providerCalls, 2);
  assert.equal(updates.length, 1);
});

test('verified credit webhook dispatches only the credit lifecycle and returns no banner order ID', async () => {
  configureSandbox();
  const sql = async (strings) => {
    const query = strings.join(' ? ');
    if (query.includes('CREATE TABLE IF NOT EXISTS paypal_webhook_events')) return [];
    if (query.includes('SELECT processing_status')) return [];
    if (query.includes('INSERT INTO paypal_webhook_events')) return [];
    if (query.includes('FROM credit_purchases') && query.includes('OR paypal_capture_id')) {
      return [{
        id: 'credit-purchase-1',
        paypal_order_id: 'PAYPAL-CREDIT-1',
        paypal_capture_id: null,
      }];
    }
    if (query.includes('FROM orders') && query.includes('OR paypal_capture_id')) return [];
    if (query.includes('UPDATE paypal_webhook_events')) return [];
    throw new Error(`Unexpected SQL: ${query.slice(0, 140)}`);
  };
  webhookHandler._test.setNeonFactory(() => sql);
  global.fetch = async (url) => (
    String(url).endsWith('/v1/oauth2/token')
      ? response({ access_token: 'token' })
      : response({ verification_status: 'SUCCESS' })
  );
  const originals = {
    ensure: credit.ensureCreditPaymentSchema,
    load: credit.loadCreditPurchasesByPayPalOrder,
    reconcile: credit.reconcileCreditPayment,
    notify: credit.processCreditPurchaseNotification,
  };
  let reconciliations = 0;
  let notifications = 0;
  credit.ensureCreditPaymentSchema = async () => {};
  credit.loadCreditPurchasesByPayPalOrder = async () => [purchase()];
  credit.reconcileCreditPayment = async (input) => {
    reconciliations += 1;
    assert.equal(input.requireFeature, false);
    assert.equal(input.expectedCaptureId, 'CAPTURE-CREDIT-1');
    return {
      purchase: purchase({ status: 'completed', paypal_capture_id: 'CAPTURE-CREDIT-1' }),
      validation: { captureId: 'CAPTURE-CREDIT-1' },
      newlyFulfilled: true,
    };
  };
  credit.processCreditPurchaseNotification = async () => {
    notifications += 1;
    return { complete: true, sent: true };
  };
  try {
    const result = await webhookHandler.handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        id: 'WEBHOOK-CREDIT-SUCCESS-1',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'CAPTURE-CREDIT-1',
          supplementary_data: { related_ids: { order_id: 'PAYPAL-CREDIT-1' } },
        },
      }),
    });
    const payload = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(payload.creditPurchase, true);
    assert.equal(payload.creditPurchaseId, 'credit-purchase-1');
    assert.equal(Object.hasOwn(payload, 'orderId'), false);
    assert.equal(reconciliations, 1);
    assert.equal(notifications, 1);
  } finally {
    credit.ensureCreditPaymentSchema = originals.ensure;
    credit.loadCreditPurchasesByPayPalOrder = originals.load;
    credit.reconcileCreditPayment = originals.reconcile;
    credit.processCreditPurchaseNotification = originals.notify;
  }
});

test('legacy browser-triggered credit notifier is retired without sending', async () => {
  const result = await retiredNotifyHandler.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      purchaseId: 'credit-purchase-1',
      email: 'attacker-controlled@example.com',
    }),
  });
  assert.equal(result.statusCode, 410);
  assert.equal(JSON.parse(result.body).error, 'CREDIT_NOTIFICATION_ROUTE_RETIRED');
});

test('migration, webhook, and UI retain the hardened public contract', () => {
  const migration = readFileSync(path.join(ROOT, 'migrations/029_ai_credit_payment_integrity.sql'), 'utf8');
  const webhook = readFileSync(path.join(ROOT, 'netlify/functions/_shared/legacy/paypal-webhook-forward.cjs'), 'utf8');
  const webhookWrapper = readFileSync(path.join(ROOT, 'netlify/functions/paypal-webhook.mjs'), 'utf8');
  const ui = readFileSync(path.join(ROOT, 'src/components/ai/PurchaseCreditsModal.tsx'), 'utf8');
  const notifier = readFileSync(path.join(ROOT, 'netlify/functions/_shared/legacy/notify-credit-purchase.cjs'), 'utf8');
  const envExample = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  assert.match(migration, /duplicate paypal_order_id/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_paypal_capture_uidx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS credit_purchase_notification_outbox/);
  assert.match(webhook, /PAYPAL_PAYMENT_DOMAIN_CONFLICT/);
  assert.match(webhook, /requireFeature:\s*false/);
  assert.match(webhook, /checkoutKey:\s*orders\[0\]\.checkout_idempotency_key/);
  assert.match(webhook, /processCreditPurchaseNotification/);
  assert.match(webhookWrapper, /payload\?\.duplicate === true && payload\?\.orderId/);
  assert.match(webhookWrapper, /payload\?\.orderId\s*&&\s*payload\?\.paymentCaptured/);
  assert.match(ui, /authorizedHeaders/);
  assert.match(ui, /packageId:\s*selectedPackage\.id/);
  assert.match(ui, /reconcileOnly/);
  assert.match(ui, /getRandomValues/);
  assert.match(ui, /sessionStorage/);
  assert.match(ui, /verificationPendingRef\.current/);
  assert.match(ui, /hydratedBindingUserId !== userId/);
  assert.doesNotMatch(ui, /Date\.now\(\)|Math\.random\(\)/);
  assert.doesNotMatch(ui, /VITE_PAYPAL_CLIENT_ID|NEXT_PUBLIC_PAYPAL_CLIENT_ID/);
  assert.match(notifier, /statusCode:\s*410/);
  assert.doesNotMatch(notifier, /emails\.send|new Resend|req(?:uire)?\(['"]resend/);
  assert.match(envExample, /FEATURE_PAYPAL_CREDITS=0/);
});
