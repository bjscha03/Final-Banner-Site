'use strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { finalizeStripeOrder, walletTypeFromCharge } = require('../_shared/finalizeStripeOrder.cjs');

function fixture() {
  const order = {
    id: 'order-123',
    user_id: null,
    status: 'pending',
    subtotal_cents: 10000,
    tax_cents: 600,
    total_cents: 10600,
    email: 'buyer@example.com',
    customer_name: 'Buyer Name',
    customer_phone: '5025550100',
    shipping_name: 'Buyer Name',
    shipping_street: '100 Main St',
    shipping_street2: null,
    shipping_city: 'Louisville',
    shipping_state: 'KY',
    shipping_zip: '40202',
    shipping_country: 'US',
    discount_code: null,
    applied_discount_cents: 0,
    applied_discount_label: '',
    applied_discount_type: 'none',
    shipping_cents: 0,
    same_day_fee_cents: 0,
    saturday_fee_cents: 0,
    checkout_idempotency_key: 'checkout_key_12345678901234567890',
    stripe_payment_intent_id: 'pi_123',
    stripe_charge_id: null,
    stripe_wallet_type: null,
    paypal_order_id: null,
    paypal_capture_id: null,
    payment_method: 'stripe',
    payment_reconciliation_status: 'awaiting_confirmation',
    confirmation_email_status: 'pending',
    admin_notification_status: 'pending',
    is_test_order: true,
    created_at: new Date().toISOString(),
  };
  let paidUpdates = 0;
  const sql = async (strings, ...values) => {
    const query = strings.join(' ');
    if (/^\s*SELECT /i.test(query)) return [{ ...order }];
    if (/SET status = 'paid'/i.test(query)) {
      if (order.status !== 'pending') return [];
      order.status = 'paid';
      order.stripe_charge_id = 'ch_123';
      order.stripe_wallet_type = 'apple_pay';
      order.payment_reconciliation_status = 'complete';
      paidUpdates += 1;
      return [{ id: order.id }];
    }
    if (/SET stripe_charge_id/i.test(query)) {
      order.stripe_charge_id ||= 'ch_123';
      order.stripe_wallet_type ||= 'apple_pay';
      order.payment_reconciliation_status = 'complete';
      return [];
    }
    return [];
  };
  const intent = {
    id: 'pi_123',
    status: 'succeeded',
    amount: 10600,
    currency: 'usd',
    livemode: false,
    latest_charge: { id: 'ch_123' },
    metadata: { bof_checkout: 'v2', internal_order_id: order.id },
  };
  const charge = {
    id: 'ch_123',
    payment_method_details: { card: { wallet: { type: 'apple_pay' } } },
  };
  return { order, sql, intent, charge, getPaidUpdates: () => paidUpdates };
}

test('wallet type is read only from verified Stripe charge details', () => {
  assert.equal(walletTypeFromCharge({ payment_method_details: { card: { wallet: { type: 'google_pay' } } } }), 'google_pay');
  assert.equal(walletTypeFromCharge({ payment_method_details: { card: { wallet: { type: 'invented_wallet' } } } }), null);
});

test('successful intent atomically transitions pending order only once', async () => {
  const state = fixture();
  const first = await finalizeStripeOrder({ sql: state.sql, intent: state.intent, charge: state.charge, source: 'test' });
  const second = await finalizeStripeOrder({ sql: state.sql, intent: state.intent, charge: state.charge, source: 'test-retry' });
  assert.equal(first.ok, true);
  assert.equal(first.transitioned, true);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyPaid, true);
  assert.equal(state.getPaidUpdates(), 1);
  assert.equal(second.order.stripe_wallet_type, 'apple_pay');
});

test('amount mismatch fails closed before any paid transition', async () => {
  const state = fixture();
  const result = await finalizeStripeOrder({
    sql: state.sql,
    intent: { ...state.intent, amount: 1 },
    charge: state.charge,
    source: 'test',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PAYMENT_AMOUNT_MISMATCH');
  assert.equal(state.getPaidUpdates(), 0);
});

test('metadata alone cannot settle an order bound to another PaymentIntent', async () => {
  const state = fixture();
  state.order.stripe_payment_intent_id = 'pi_newer';
  const result = await finalizeStripeOrder({
    sql: state.sql,
    intent: state.intent,
    charge: state.charge,
    source: 'test-displaced',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PAYMENT_INTENT_MISMATCH');
  assert.equal(state.getPaidUpdates(), 0);
});

test('a Stripe Intent can never settle or overwrite a PayPal-bound order', async () => {
  const state = fixture();
  state.order.payment_method = 'paypal';
  state.order.paypal_order_id = 'PAYPAL-ORDER';
  state.order.paypal_capture_id = 'PAYPAL-CAPTURE';
  state.order.status = 'paid';
  const result = await finalizeStripeOrder({
    sql: state.sql,
    intent: state.intent,
    charge: state.charge,
    source: 'test-provider-conflict',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'PAYMENT_PROVIDER_CONFLICT');
  assert.equal(state.getPaidUpdates(), 0);
});

test('Stripe test-mode settlement never consumes real discount inventory', async () => {
  const state = fixture();
  state.order.discount_code = 'SAVE20';
  let discountWrites = 0;
  const result = await finalizeStripeOrder({
    sql: async (strings, ...values) => {
      if (/UPDATE discount_codes/i.test(strings.join(' '))) discountWrites += 1;
      return state.sql(strings, ...values);
    },
    intent: state.intent,
    charge: state.charge,
    source: 'test-preview-discount',
  });
  assert.equal(result.ok, true);
  assert.equal(result.settled, true);
  assert.equal(discountWrites, 0);
});
