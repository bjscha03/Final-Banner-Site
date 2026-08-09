'use strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createOrder = require('../_shared/legacy/create-order-core.cjs');
const checkout = require('../_shared/stripe-checkout-service.cjs');
const discounts = require('../_shared/discount-validation.cjs');

test('public create-order cannot forge a Stripe order or test mode', async () => {
  const response = await createOrder.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ payment_method: 'stripe', payment_status: 'paid', is_test_order: true }),
  }, {});
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, 'STRIPE_CREATE_ORDER_NOT_AUTHORIZED');
});

test('trusted Stripe context is opaque and validates its mode', () => {
  assert.throws(() => createOrder.createTrustedStripeContext('sandbox'), /test or live/);
  const context = createOrder.createTrustedStripeContext('test');
  assert.equal(Object.keys(context).length, 0);
  assert.equal(Object.getOwnPropertySymbols(context).length, 1);
  assert.equal(Object.isFrozen(context), true);
});

test('the pending-order insert persists the phone used by the canonical retry guard', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../_shared/legacy/create-order-core.cjs'), 'utf8');
  const insert = source.match(/INSERT INTO orders \([\s\S]+?RETURNING \*/)?.[0] || '';
  assert.match(insert, /customer_first_name, customer_phone, subtotal_cents/);
  assert.match(insert, /\$\{orderData\.customer_phone \|\| null\}/);
});

test('customer normalization uses validated checkout data without accepting missing shipping', () => {
  const customer = checkout.normalizeCustomer({
    customer: { email: 'Buyer@Example.com', fullName: 'Buyer Name', phone: '(502) 555-0100' },
    shippingAddress: {
      name: 'Buyer Name', street: '100 Main St', city: 'Louisville', state: 'KY', zip: '40202', country: 'US',
    },
  }, { payment_method_preview: { billing_details: {} } });
  assert.equal(customer.email, 'buyer@example.com');
  assert.equal(customer.shipping.postalCode, '40202');
  assert.throws(
    () => checkout.normalizeCustomer({
      customer: { email: 'buyer@example.com', fullName: 'Buyer Name', phone: '5025550100' },
      shippingAddress: { city: 'Louisville', state: 'KY', zip: '40202' },
    }, {}),
    (error) => error.code === 'SHIPPING_ADDRESS_REQUIRED',
  );
});

test('pending-order retries cannot silently change fulfillment details', () => {
  const order = {
    email: 'buyer@example.com',
    customer_name: 'Buyer Name',
    customer_phone: '(502) 555-0100',
    shipping_name: 'Buyer Name',
    shipping_street: '100 Main St',
    shipping_street2: null,
    shipping_city: 'Louisville',
    shipping_state: 'KY',
    shipping_zip: '40202',
    shipping_country: 'US',
  };
  const customer = {
    email: 'buyer@example.com',
    fullName: 'Buyer Name',
    phone: '502-555-0100',
    shipping: {
      name: 'Buyer Name', line1: '100 Main St', line2: null,
      city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US',
    },
  };
  assert.equal(checkout.pendingCustomerDetailsMatch(order, customer), true);
  assert.equal(checkout.pendingCustomerDetailsMatch(order, {
    ...customer,
    shipping: { ...customer.shipping, line1: '200 Changed St' },
  }), false);
  assert.equal(checkout.canonicalCustomerFromOrder(order).shipping.line1, '100 Main St');
});

test('intent binding requires exact server amount, order, currency, and checkout hash', () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', total_cents: 4242 };
  const intent = {
    amount: 4242,
    currency: 'usd',
    metadata: {
      bof_checkout: 'v2',
      internal_order_id: 'order-1',
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  assert.equal(checkout.verifyIntentBinding(intent, order, checkoutKey), true);
  assert.throws(
    () => checkout.verifyIntentBinding({ ...intent, amount: 1 }, order, checkoutKey),
    (error) => error.code === 'PAYMENT_AMOUNT_MISMATCH',
  );
  assert.throws(
    () => checkout.verifyIntentBinding(intent, order, 'different_checkout_key_123456789'),
    (error) => error.code === 'PAYMENT_CHECKOUT_MISMATCH',
  );
});

test('Stripe payment records receive a non-PII canonical order summary', () => {
  const order = {
    id: 'ca16a1ca-2e4d-42df-8723-9574490f67f1',
    subtotal_cents: 3600,
    tax_cents: 216,
    total_cents: 3816,
    applied_discount_cents: 0,
    same_day_fee_cents: 0,
    saturday_fee_cents: 0,
  };
  const metadata = checkout.stripeOrderMetadata(order, [{
    product_type: 'banner', width_in: 48, height_in: 24, material: '13oz Vinyl', quantity: 2,
  }]);
  assert.equal(checkout.stripeOrderReference(order.id), 'BOTF-490F67F1');
  assert.equal(metadata.order_reference, 'BOTF-490F67F1');
  assert.equal(metadata.item_count, '1');
  assert.equal(metadata.unit_count, '2');
  assert.equal(metadata.item_summary, 'banner 48x24 13oz Vinyl x2');
  assert.equal(metadata.subtotal_cents, '3600');
  assert.equal(metadata.tax_cents, '216');
  assert.equal(metadata.email, undefined);
  assert.equal(metadata.phone, undefined);
  assert.equal(metadata.shipping_address, undefined);
});

test('the wallet-displayed expected total is mandatory and must be integer cents', () => {
  assert.equal(checkout.validateExpectedTotal(4242), 4242);
  assert.throws(
    () => checkout.validateExpectedTotal(undefined),
    (error) => error.code === 'EXPECTED_TOTAL_INVALID' && error.statusCode === 400,
  );
  assert.throws(
    () => checkout.validateExpectedTotal(42.42),
    (error) => error.code === 'EXPECTED_TOTAL_INVALID',
  );
  assert.throws(
    () => checkout.validateExpectedTotal(100_000_000),
    (error) => error.code === 'EXPECTED_TOTAL_INVALID',
  );
  assert.equal(checkout.validateStripeAmount(99_999_999), 99_999_999);
  assert.throws(
    () => checkout.validateStripeAmount(100_000_000),
    (error) => error.code === 'ORDER_AMOUNT_UNSUPPORTED',
  );
});

test('stale-total canonical quote exposes only server price fields needed for an explicit restart', () => {
  const quote = checkout.canonicalQuoteForCheckout([{
    id: 'cart-line-1',
    product_type: 'banner',
    unit_price_cents: 3600,
    line_total_cents: 5200,
    rope_feet: 4,
    rope_cost_cents: 1600,
    canvas_state_json: 'must-not-be-returned',
  }], {
    subtotal_cents: 5200,
    tax_cents: 312,
    total_cents: 5512,
    applied_discount_cents: 0,
    applied_discount_type: 'none',
  });
  assert.deepEqual(quote.items[0], {
    index: 0,
    cartItemId: 'cart-line-1',
    productType: 'banner',
    unitPriceCents: 3600,
    lineTotalCents: 5200,
    ropeFeet: 4,
    ropeCostCents: 1600,
    polePocketCostCents: 0,
    yardSignSignsSubtotalCents: 0,
    yardSignStakesSubtotalCents: 0,
  });
  assert.equal(quote.totalCents, 5512);
  assert.equal('canvas_state_json' in quote.items[0], false);
});

test('stored one-time discounts are atomically reserved before confirmation and retry-safe for the winner', async () => {
  let reservedBy = null;
  const makeSql = (requestingOrderId) => async (strings) => {
    const query = strings.join(' ');
    if (/UPDATE discount_codes dc/i.test(query)) {
      // Model the database compare-and-set: only an unowned row or the same
      // order can be returned by the atomic UPDATE.
      if (reservedBy === null || reservedBy === requestingOrderId) {
        reservedBy = requestingOrderId;
        return [{ id: 'discount-1', order_id: requestingOrderId }];
      }
      return [];
    }
    if (/FROM trade_show_promo_codes/i.test(query)) return [];
    return [];
  };
  const firstOrder = {
    id: 'order-first', discount_code: 'ONCE20', email: 'first@example.com',
    status: 'pending', is_test_order: false,
    applied_discount_type: 'promo', applied_discount_cents: 2000,
  };
  const secondOrder = {
    id: 'order-second', discount_code: 'ONCE20', email: 'second@example.com',
    status: 'pending', is_test_order: false,
    applied_discount_type: 'promo', applied_discount_cents: 2000,
  };

  const outcomes = await Promise.allSettled([
    checkout.claimOrderDiscountForPayment(makeSql(firstOrder.id), firstOrder),
    checkout.claimOrderDiscountForPayment(makeSql(secondOrder.id), secondOrder),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'CHECKOUT_DETAILS_CHANGED');
  assert.equal(rejected.reason.details.restartCheckout, true);
  assert.equal(reservedBy, firstOrder.id);

  const retry = await checkout.claimOrderDiscountForPayment(makeSql(firstOrder.id), firstOrder);
  assert.equal(retry.claimed, true);
  assert.equal(reservedBy, firstOrder.id);
});

test('test-mode orders never reserve or consume real discount inventory', async () => {
  let queries = 0;
  const result = await checkout.claimOrderDiscountForPayment(async () => {
    queries += 1;
    return [];
  }, {
    id: 'order-test', discount_code: 'ONCE20', is_test_order: true,
    applied_discount_type: 'promo', applied_discount_cents: 2000,
  });
  assert.equal(result.kind, 'test');
  assert.equal(queries, 0);
});

test('a reserved code remains valid only for its opaque owning checkout retry', async () => {
  const discountRow = {
    id: 'discount-1',
    code: 'ONCE20',
    discount_percentage: 20,
    discount_amount_cents: null,
    used: true,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_by_user_id: null,
    used_by_email: [],
    max_uses_per_customer: 1,
    max_total_uses: 1,
    email: 'buyer@example.com',
  };
  let owned = true;
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (/FROM trade_show_promo_codes/i.test(query)) return [];
    if (/FROM discount_codes/i.test(query)) return [{ ...discountRow, owned_by_checkout: owned }];
    return [];
  };
  const accepted = await discounts.validateDiscountForCheckout({
    sql,
    code: 'ONCE20',
    email: 'buyer@example.com',
    checkoutKey: 'checkout_key_12345678901234567890',
  });
  assert.equal(accepted.valid, true);

  owned = false;
  const rejected = await discounts.validateDiscountForCheckout({
    sql,
    code: 'ONCE20',
    email: 'buyer@example.com',
    checkoutKey: 'different_checkout_key_123456789',
  });
  assert.equal(rejected.valid, false);
  assert.match(rejected.error, /already been used/i);
});

test('NEW20 permits only one active checkout for one customer before confirmation', async () => {
  const first = {
    id: 'order-new20-first', discount_code: 'NEW20', email: 'buyer@example.com',
    user_id: null, is_test_order: false,
    applied_discount_type: 'promo', applied_discount_cents: 2000,
  };
  const second = { ...first, id: 'order-new20-second' };
  const new20Sql = (rows) => {
    const sql = async () => [];
    sql.transaction = async () => [[{ acquired: 1 }], rows];
    return sql;
  };
  const winner = await checkout.claimOrderDiscountForPayment(new20Sql([{ id: first.id }]), first);
  assert.equal(winner.kind, 'new20');
  await assert.rejects(
    checkout.claimOrderDiscountForPayment(new20Sql([]), second),
    (error) => error.code === 'CHECKOUT_DETAILS_CHANGED'
      && error.details.restartCheckout === true,
  );
});

test('a losing promo code is not reserved when a larger quantity discount actually applies', async () => {
  let queries = 0;
  const result = await checkout.claimOrderDiscountForPayment(async () => {
    queries += 1;
    return [];
  }, {
    id: 'order-quantity-wins',
    discount_code: 'ONCE20',
    applied_discount_type: 'quantity',
    applied_discount_cents: 3000,
    is_test_order: false,
  });
  assert.equal(result.kind, 'not_applied');
  assert.equal(queries, 0);
});

test('PaymentIntent creation is idempotent and an attached reusable intent is not recreated', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = {
    id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: null,
  };
  let createCalls = 0;
  const createdIntent = {
    id: 'pi_123', client_secret: 'pi_123_secret_test', status: 'requires_payment_method',
    amount: 4242, currency: 'usd',
    metadata: {
      bof_checkout: 'v2',
      internal_order_id: order.id,
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  const stripe = {
    paymentIntents: {
      async create(params, options) {
        createCalls += 1;
        assert.equal(params.amount, 4242);
        assert.equal(params.confirmation_token, undefined);
        assert.deepEqual(params.payment_method_types, ['card']);
        assert.equal(params.receipt_email, undefined);
        assert.equal(params.metadata.email, undefined);
        assert.equal(params.description, 'Banners On The Fly BOTF-ORDER1');
        assert.equal(params.metadata.order_reference, 'BOTF-ORDER1');
        assert.ok(options.idempotencyKey.startsWith('bof-pi-'));
        assert.equal(options.idempotencyKey.includes(checkoutKey), false);
        return createdIntent;
      },
      async confirm(id, params, options) {
        assert.equal(id, createdIntent.id);
        assert.equal(params.confirmation_token, 'ctoken_test_123');
        assert.equal(params.use_stripe_sdk, true);
        assert.ok(options.idempotencyKey.startsWith('bof-confirm-'));
        return { ...createdIntent, status: 'requires_action' };
      },
      async retrieve(id) {
        assert.equal(id, createdIntent.id);
        return { ...createdIntent, status: 'requires_action' };
      },
      async cancel() { throw new Error('cancel should not be called'); },
    },
  };
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (/UPDATE orders/i.test(query)) return [{ id: order.id, stripe_payment_intent_id: createdIntent.id }];
    return [];
  };
  const customer = {
    phone: '5025550100',
    shipping: { name: 'Buyer', line1: '100 Main', line2: null, city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' },
  };

  const created = await checkout.createOrReusePaymentIntent({
    stripe, sql, order, confirmationTokenId: 'ctoken_test_123', checkoutKey, customer,
  });
  assert.equal(created.id, createdIntent.id);
  assert.equal(created.status, 'requires_action');
  order.stripe_payment_intent_id = createdIntent.id;
  const reused = await checkout.createOrReusePaymentIntent({
    stripe, sql, order, confirmationTokenId: 'ctoken_test_456', checkoutKey, customer,
  });
  assert.equal(reused.id, createdIntent.id);
  assert.equal(createCalls, 1);
});

test('the order is durably bound before server-side confirmation can attempt a charge', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: null };
  const sequence = [];
  const intent = {
    id: 'pi_123', client_secret: 'pi_123_secret_test', status: 'requires_payment_method',
    amount: 4242, currency: 'usd',
    metadata: {
      bof_checkout: 'v2', internal_order_id: order.id,
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  const stripe = {
    paymentIntents: {
      async create() { sequence.push('create'); return intent; },
      async confirm() { sequence.push('confirm'); return { ...intent, status: 'succeeded' }; },
      async cancel() { sequence.push('cancel'); return { status: 'canceled' }; },
    },
  };
  const sql = async (strings) => {
    if (/UPDATE orders/i.test(strings.join(' '))) {
      sequence.push('attach');
      return [{ id: order.id, stripe_payment_intent_id: intent.id }];
    }
    return [];
  };
  const result = await checkout.createOrReusePaymentIntent({
    stripe,
    sql,
    order,
    confirmationTokenId: 'ctoken_test_123',
    checkoutKey,
    customer: {
      phone: '5025550100',
      shipping: { name: 'Buyer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' },
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(sequence, ['create', 'attach', 'confirm']);
});

test('a duplicate attach that finds the same durable Intent never cancels the winning request', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = {
    id: 'order-1',
    status: 'pending',
    total_cents: 4242,
    stripe_payment_intent_id: null,
    checkout_idempotency_key: checkoutKey,
  };
  const intent = {
    id: 'pi_shared', status: 'requires_payment_method', amount: 4242, currency: 'usd',
    metadata: {
      bof_checkout: 'v2', internal_order_id: order.id,
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  let cancelCalls = 0;
  let confirmCalls = 0;
  const stripe = {
    paymentIntents: {
      async create() { return intent; },
      async confirm() {
        confirmCalls += 1;
        return { ...intent, status: 'requires_action' };
      },
      async cancel() { cancelCalls += 1; },
    },
  };
  const sql = async (strings) => {
    const query = strings.join(' ');
    if (/UPDATE orders/i.test(query)) return [];
    if (/FROM orders/i.test(query)) {
      return [{ ...order, stripe_payment_intent_id: intent.id }];
    }
    return [];
  };

  const result = await checkout.createOrReusePaymentIntent({
    stripe,
    sql,
    order,
    confirmationTokenId: 'ctoken_same_duplicate',
    checkoutKey,
    customer: {
      phone: '5025550100',
      shipping: { name: 'Buyer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' },
    },
  });

  assert.equal(result.status, 'requires_action');
  assert.equal(confirmCalls, 1);
  assert.equal(cancelCalls, 0);
});

test('an ambiguous attach response is neither canceled nor confirmed', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: null };
  const intent = {
    id: 'pi_attach_unknown', status: 'requires_payment_method', amount: 4242, currency: 'usd',
    metadata: {
      bof_checkout: 'v2', internal_order_id: order.id,
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  let cancelCalls = 0;
  let confirmCalls = 0;
  await assert.rejects(
    checkout.createOrReusePaymentIntent({
      stripe: {
        paymentIntents: {
          async create() { return intent; },
          async confirm() { confirmCalls += 1; return intent; },
          async cancel() { cancelCalls += 1; },
        },
      },
      sql: async () => { throw Object.assign(new Error('database response lost'), { code: '08006' }); },
      order,
      confirmationTokenId: 'ctoken_attach_unknown',
      checkoutKey,
      customer: {
        phone: '5025550100',
        shipping: { name: 'Buyer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' },
      },
    }),
    (error) => error.code === 'PAYMENT_ATTACH_STATUS_UNKNOWN'
      && error.statusCode === 503
      && error.details.databaseCode === '08006',
  );
  assert.equal(confirmCalls, 0);
  assert.equal(cancelCalls, 0);
});

test('an ambiguous confirmation failure preserves the bound Intent and forbids a second payment attempt', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: null };
  let attached = false;
  const intent = {
    id: 'pi_ambiguous', status: 'requires_payment_method', amount: 4242, currency: 'usd',
    metadata: {
      bof_checkout: 'v2', internal_order_id: order.id,
      checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
    },
  };
  const stripe = {
    paymentIntents: {
      async create() { return intent; },
      async confirm() {
        assert.equal(attached, true, 'the database binding must precede confirmation');
        throw Object.assign(new Error('connection closed after request write'), { code: 'api_connection_error' });
      },
      async cancel() { throw new Error('ambiguous confirmation must not be canceled'); },
    },
  };
  await assert.rejects(
    checkout.createOrReusePaymentIntent({
      stripe,
      sql: async (strings) => {
        if (/UPDATE orders/i.test(strings.join(' '))) {
          attached = true;
          return [{ id: order.id, stripe_payment_intent_id: intent.id }];
        }
        return [];
      },
      order,
      confirmationTokenId: 'ctoken_test_ambiguous',
      checkoutKey,
      customer: {
        phone: '5025550100',
        shipping: { name: 'Buyer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' },
      },
    }),
    (error) => error.code === 'PAYMENT_CONFIRMATION_UNKNOWN'
      && error.statusCode === 503
      && error.details.paymentIntentId === intent.id
      && error.details.doNotRetry === true,
  );
  assert.equal(attached, true);
});

test('an existing bound Intent retrieval outage cannot enable another payment', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: 'pi_bound' };
  let createCalls = 0;
  await assert.rejects(
    checkout.createOrReusePaymentIntent({
      stripe: {
        paymentIntents: {
          async retrieve() { throw Object.assign(new Error('temporary provider outage'), { code: 'api_connection_error' }); },
          async create() { createCalls += 1; return {}; },
        },
      },
      sql: async () => [],
      order,
      confirmationTokenId: 'ctoken_retry',
      checkoutKey,
      customer: { phone: '5025550100', shipping: {} },
    }),
    (error) => error.code === 'PAYMENT_STATUS_UNKNOWN'
      && error.statusCode === 503
      && error.details.paymentIntentId === 'pi_bound'
      && error.details.doNotRetry === true,
  );
  assert.equal(createCalls, 0);
});

test('order recovery is bound to the constant-time checkout key', async () => {
  const order = {
    id: 'order-1', total_cents: 4242, checkout_idempotency_key: 'checkout_key_12345678901234567890',
  };
  const sql = async () => [order];
  assert.equal((await checkout.loadStripeOrder(sql, {
    orderId: order.id,
    checkoutKey: order.checkout_idempotency_key,
  })).id, order.id);
  assert.equal(await checkout.loadStripeOrder(sql, {
    orderId: order.id,
    checkoutKey: 'wrong_checkout_key_1234567890123',
  }), null);
});

test('a declined payment retries on the same bound Intent instead of creating duplicate-charge risk', async () => {
  const checkoutKey = 'checkout_key_12345678901234567890';
  const order = { id: 'order-1', status: 'pending', total_cents: 4242, stripe_payment_intent_id: 'pi_old' };
  let createCalls = 0;
  let confirmCalls = 0;
  let updateCalls = 0;
  const stripe = {
    paymentIntents: {
      async retrieve() {
        return {
          id: 'pi_old', status: 'requires_payment_method', amount: 4242, currency: 'usd',
          metadata: {
            bof_checkout: 'v2', internal_order_id: order.id,
            checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
          },
        };
      },
      async confirm(id, params) {
        confirmCalls += 1;
        assert.equal(id, 'pi_old');
        assert.equal(params.confirmation_token, 'ctoken_new');
        return {
          id: 'pi_old', status: 'requires_action', amount: 4242, currency: 'usd',
          metadata: {
            bof_checkout: 'v2', internal_order_id: order.id,
            checkout_key_hash: checkout.checkoutKeyHash(checkoutKey),
          },
        };
      },
      async update(id, params) {
        updateCalls += 1;
        assert.equal(id, 'pi_old');
        assert.equal(params.description, 'Banners On The Fly BOTF-ORDER1');
        assert.equal(params.metadata.item_summary, 'banner 48x24 13oz Vinyl x1');
        return {
          id: 'pi_old', status: 'requires_payment_method', amount: 4242, currency: 'usd',
          metadata: params.metadata,
        };
      },
      async create() { createCalls += 1; return {}; },
    },
  };
  const retried = await checkout.createOrReusePaymentIntent({
    stripe,
    sql: async () => [],
    order,
    confirmationTokenId: 'ctoken_new',
    checkoutKey,
    customer: { phone: '5025550100', shipping: {} },
    items: [{ product_type: 'banner', width_in: 48, height_in: 24, material: '13oz Vinyl', quantity: 1 }],
  });
  assert.equal(retried.id, 'pi_old');
  assert.equal(retried.status, 'requires_action');
  assert.equal(confirmCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(createCalls, 0);
});
