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

function isAdminVisiblePaidOrder(order = {}) {
  const paymentMethod = normalize(order.payment_method);
  if (order.is_test_order === true || paymentMethod === 'admin_deploy_preview_test') {
    return false;
  }

  const status = normalize(order.status);
  return PAID_ADMIN_STATUSES.has(status) || hasCompletedPayPalPaymentEvidence(order);
}

module.exports = {
  PAID_ADMIN_STATUSES,
  hasCompletedPayPalPaymentEvidence,
  isAdminVisiblePaidOrder,
};
