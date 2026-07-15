function amountToCents(value) {
  const amount = Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function getPrimaryCapture(paypalData) {
  const units = Array.isArray(paypalData?.purchase_units) ? paypalData.purchase_units : [];
  for (const unit of units) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const completed = captures.find((capture) => String(capture?.status || '').toUpperCase() === 'COMPLETED');
    if (completed) return completed;
    if (captures[0]) return captures[0];
  }
  return null;
}

function validatePayPalCapture(paypalData, expected = {}) {
  const orderStatus = String(paypalData?.status || '').toUpperCase();
  const capture = getPrimaryCapture(paypalData);
  const captureStatus = String(capture?.status || '').toUpperCase();
  const captureId = String(capture?.id || '').trim();
  const currency = String(capture?.amount?.currency_code || '').toUpperCase();
  const amountCents = amountToCents(capture?.amount?.value);

  if (orderStatus !== 'COMPLETED') {
    return { ok: false, code: 'PAYPAL_ORDER_NOT_COMPLETED', orderStatus, captureStatus, captureId, currency, amountCents };
  }
  if (!captureId || captureStatus !== 'COMPLETED') {
    return { ok: false, code: 'PAYPAL_CAPTURE_NOT_COMPLETED', orderStatus, captureStatus, captureId, currency, amountCents };
  }
  if (currency !== 'USD') {
    return { ok: false, code: 'PAYPAL_CAPTURE_CURRENCY_MISMATCH', orderStatus, captureStatus, captureId, currency, amountCents };
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, code: 'PAYPAL_CAPTURE_AMOUNT_INVALID', orderStatus, captureStatus, captureId, currency, amountCents };
  }
  if (expected.totalCents != null && Number(expected.totalCents) !== amountCents) {
    return { ok: false, code: 'PAYPAL_CAPTURE_AMOUNT_MISMATCH', orderStatus, captureStatus, captureId, currency, amountCents, expectedCents: Number(expected.totalCents) };
  }
  return { ok: true, orderStatus, captureStatus, captureId, currency, amountCents, capture };
}

function getPayPalWebhookOrderId(resource) {
  return String(
    resource?.supplementary_data?.related_ids?.order_id
    || resource?.supplementary_data?.related_ids?.authorization_id
    || resource?.invoice_id
    || ''
  ).trim();
}

function getPayPalWebhookCaptureId(resource) {
  return String(resource?.id || '').trim();
}

module.exports = {
  amountToCents,
  getPrimaryCapture,
  validatePayPalCapture,
  getPayPalWebhookOrderId,
  getPayPalWebhookCaptureId,
};
