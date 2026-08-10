'use strict';

const PAID_ADMIN_STATUSES = new Set([
  'paid',
  'in_production',
  'shipped',
  'refunded',
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function hasCompletedPayPalPaymentEvidence(order = {}) {
  const paymentMethod = normalize(order.payment_method);
  const reconciliationStatus = normalize(order.payment_reconciliation_status);

  return Boolean(
    order.paypal_capture_id
    || (paymentMethod === 'paypal' && reconciliationStatus === 'complete')
  );
}

function isExplicitNonProductionContext(options = {}) {
  const rawContext = Object.prototype.hasOwnProperty.call(options, 'context')
    ? options.context
    : process.env.CONTEXT;
  const context = normalize(rawContext);
  return Boolean(context) && context !== 'production';
}

function isAdminVisiblePaidOrder(order = {}, options = {}) {
  const paymentMethod = normalize(order.payment_method);
  const status = normalize(order.status);
  const isTestOrder = order.is_test_order === true || normalize(order.is_test_order) === 'true';

  // A no-payment Admin fixture is never a settled customer payment and must
  // remain hidden in every context.
  if (paymentMethod === 'admin_deploy_preview_test') {
    return false;
  }

  if (isTestOrder) {
    // Provider test-mode orders are visible only to the already-authenticated
    // Admin list on an explicit nonproduction Netlify context. This makes the
    // required end-to-end preview verification possible without ever exposing
    // sandbox/test orders in production. Provider references alone are
    // insufficient: the canonical payment must have settled.
    if (!isExplicitNonProductionContext(options)) return false;

    if (paymentMethod === 'stripe') {
      return PAID_ADMIN_STATUSES.has(status);
    }

    if (paymentMethod === 'paypal') {
      return PAID_ADMIN_STATUSES.has(status) || hasCompletedPayPalPaymentEvidence(order);
    }

    return false;
  }

  return PAID_ADMIN_STATUSES.has(status) || hasCompletedPayPalPaymentEvidence(order);
}

module.exports = {
  PAID_ADMIN_STATUSES,
  hasCompletedPayPalPaymentEvidence,
  isExplicitNonProductionContext,
  isAdminVisiblePaidOrder,
};
