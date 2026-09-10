'use strict';

const PAID_ADMIN_STATUSES = new Set([
  'paid',
  'in_production',
  'shipped',
  'delivered',
  'fulfilled',
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

function isAdminListableOrder(order = {}) {
  const paymentMethod = normalize(order.payment_method);
  const isTestOrder = order.is_test_order === true || normalize(order.is_test_order) === 'true';

  // Test and no-payment preview fixtures are never customer orders. Keep them
  // out of every Admin surface in every deploy context, even if a sandbox
  // provider transaction reached a paid lifecycle status.
  return !isTestOrder && paymentMethod !== 'admin_deploy_preview_test';
}

function isAdminVisiblePaidOrder(order = {}) {
  if (!isAdminListableOrder(order)) return false;

  return PAID_ADMIN_STATUSES.has(normalize(order.status)) || hasCompletedPayPalPaymentEvidence(order);
}

module.exports = {
  PAID_ADMIN_STATUSES,
  hasCompletedPayPalPaymentEvidence,
  isAdminListableOrder,
  isAdminVisiblePaidOrder,
};
