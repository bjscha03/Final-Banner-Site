'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCanonicalTransactionId } = require('../_shared/purchase-analytics-reconciliation.cjs');

test('uses the business order number when one exists', () => {
  assert.equal(getCanonicalTransactionId({ id: 'uuid-1', order_number: 'BOTF-1001' }), 'BOTF-1001');
});

test('falls back to the canonical order UUID for legacy orders without an order number', () => {
  assert.equal(getCanonicalTransactionId({ id: 'uuid-1', order_number: null }), 'uuid-1');
});

test('uses the same canonical transaction ID for PayPal, Stripe card, and wallets', () => {
  const providers = [
    { payment_method: 'paypal', paypal_capture_id: 'CAPTURE-1' },
    { payment_method: 'stripe', stripe_payment_intent_id: 'pi_card' },
    { payment_method: 'stripe', stripe_payment_intent_id: 'pi_apple', stripe_wallet_type: 'apple_pay' },
    { payment_method: 'stripe', stripe_payment_intent_id: 'pi_google', stripe_wallet_type: 'google_pay' },
  ];

  for (const provider of providers) {
    assert.equal(getCanonicalTransactionId({
      id: 'order-uuid',
      order_number: 'BOTF-1002',
      ...provider,
    }), 'BOTF-1002');
  }
});
