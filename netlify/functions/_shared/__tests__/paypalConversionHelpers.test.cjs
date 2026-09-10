const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToCents, validatePayPalCapture, getPayPalWebhookOrderId } = require('../paypalConversionHelpers.cjs');

test('successful PayPal capture validates completed USD amount', () => {
  const result = validatePayPalCapture({
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { value: '42.35', currency_code: 'USD' } }] } }],
  }, { totalCents: 4235 });
  assert.equal(result.ok, true);
  assert.equal(result.captureId, 'CAP-1');
  assert.equal(result.amountCents, 4235);
});

test('PayPal capture status not completed is rejected', () => {
  const result = validatePayPalCapture({
    status: 'APPROVED',
    purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'PENDING', amount: { value: '42.35', currency_code: 'USD' } }] } }],
  }, { totalCents: 4235 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PAYPAL_ORDER_NOT_COMPLETED');
});

test('PayPal capture amount mismatch is rejected', () => {
  const result = validatePayPalCapture({
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { value: '40.00', currency_code: 'USD' } }] } }],
  }, { totalCents: 4235 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PAYPAL_CAPTURE_AMOUNT_MISMATCH');
});

test('PayPal capture currency mismatch is rejected', () => {
  const result = validatePayPalCapture({
    status: 'COMPLETED',
    purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { value: '42.35', currency_code: 'CAD' } }] } }],
  }, { totalCents: 4235 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PAYPAL_CAPTURE_CURRENCY_MISMATCH');
});

test('cents conversion rounds dollars correctly', () => {
  assert.equal(amountToCents('12.34'), 1234);
  assert.equal(amountToCents('12.345'), 1235);
});

test('PayPal webhook order ID is extracted from related IDs', () => {
  assert.equal(getPayPalWebhookOrderId({ supplementary_data: { related_ids: { order_id: 'PAYPAL-ORDER-1' } } }), 'PAYPAL-ORDER-1');
});
