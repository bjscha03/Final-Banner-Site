const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasCompletedPayPalPaymentEvidence,
  isAdminVisiblePaidOrder,
} = require('../_shared/admin-order-visibility.cjs');

test('Admin hides a PayPal checkout attempt that was never captured', () => {
  assert.equal(isAdminVisiblePaidOrder({
    status: 'pending',
    payment_method: 'paypal',
    paypal_order_id: 'PAYPAL-OPENED-NOT-PAID',
    paypal_capture_id: null,
  }), false);
});

test('Admin shows a completed PayPal capture even while reconciliation is finishing', () => {
  const order = {
    status: 'pending',
    payment_method: 'paypal',
    paypal_order_id: 'PAYPAL-ORDER',
    paypal_capture_id: 'PAYPAL-CAPTURE',
  };

  assert.equal(hasCompletedPayPalPaymentEvidence(order), true);
  assert.equal(isAdminVisiblePaidOrder(order), true);
});

test('Admin shows paid lifecycle statuses', () => {
  assert.equal(isAdminVisiblePaidOrder({ status: 'paid' }), true);
  assert.equal(isAdminVisiblePaidOrder({ status: 'in_production' }), true);
  assert.equal(isAdminVisiblePaidOrder({ status: 'shipped' }), true);
  assert.equal(isAdminVisiblePaidOrder({ status: 'delivered' }), true);
  assert.equal(isAdminVisiblePaidOrder({ status: 'fulfilled' }), true);
  assert.equal(isAdminVisiblePaidOrder({ status: 'refunded' }), true);
});

test('Admin visibility is provider-neutral for settled Stripe orders', () => {
  assert.equal(isAdminVisiblePaidOrder({
    status: 'paid',
    payment_method: 'stripe',
    stripe_payment_intent_id: 'pi_live_settled',
  }), true);

  assert.equal(isAdminVisiblePaidOrder({
    status: 'pending',
    payment_method: 'stripe',
    stripe_payment_intent_id: 'pi_live_not_settled',
  }), false);
});

test('Admin hides unpaid, failed, canceled, and no-payment test orders', () => {
  assert.equal(isAdminVisiblePaidOrder({ status: 'pending' }), false);
  assert.equal(isAdminVisiblePaidOrder({ status: 'failed' }), false);
  assert.equal(isAdminVisiblePaidOrder({ status: 'canceled' }), false);
  assert.equal(isAdminVisiblePaidOrder({
    status: 'paid',
    payment_method: 'admin_deploy_preview_test',
    is_test_order: true,
  }, { context: 'deploy-preview' }), false);
});

test('settled provider test orders are visible only in an explicit nonproduction context', () => {
  const paidStripeTestOrder = {
    status: 'paid',
    payment_method: 'stripe',
    stripe_payment_intent_id: 'pi_test_settled',
    is_test_order: true,
  };

  assert.equal(isAdminVisiblePaidOrder(paidStripeTestOrder, { context: 'deploy-preview' }), true);
  assert.equal(isAdminVisiblePaidOrder(paidStripeTestOrder, { context: 'branch-deploy' }), true);
  assert.equal(isAdminVisiblePaidOrder(paidStripeTestOrder, { context: 'production' }), false);
  assert.equal(isAdminVisiblePaidOrder(paidStripeTestOrder, { context: '' }), false);
  assert.equal(isAdminVisiblePaidOrder(paidStripeTestOrder, { context: undefined }), false);

  assert.equal(isAdminVisiblePaidOrder({
    status: 'pending',
    payment_method: 'stripe',
    stripe_payment_intent_id: 'pi_test_not_settled',
    is_test_order: true,
  }, { context: 'deploy-preview' }), false);

  const paidPayPalTestOrder = {
    status: 'paid',
    payment_method: 'paypal',
    paypal_capture_id: 'SANDBOX-CAPTURE',
    is_test_order: true,
  };

  assert.equal(isAdminVisiblePaidOrder(paidPayPalTestOrder, { context: 'deploy-preview' }), true);
  assert.equal(isAdminVisiblePaidOrder(paidPayPalTestOrder, { context: 'branch-deploy' }), true);
  assert.equal(isAdminVisiblePaidOrder(paidPayPalTestOrder, { context: 'production' }), false);

  const capturedPayPalTestOrderStillReconciling = {
    ...paidPayPalTestOrder,
    status: 'pending',
  };

  assert.equal(isAdminVisiblePaidOrder(capturedPayPalTestOrderStillReconciling, { context: 'branch-deploy' }), true);
  assert.equal(isAdminVisiblePaidOrder(capturedPayPalTestOrderStillReconciling, { context: 'production' }), false);

  assert.equal(isAdminVisiblePaidOrder({
    status: 'pending',
    payment_method: 'paypal',
    paypal_capture_id: null,
    is_test_order: true,
  }, { context: 'branch-deploy' }), false);
});
