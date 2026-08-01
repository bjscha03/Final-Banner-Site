import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('definitive funding decline is retryable and never reported as captured', () => {
  const capture = require('../_shared/legacy/paypal-capture-forward.cjs');
  const payload = capture._test.definitiveFailurePayload(
    'PAYPAL-ORDER',
    'INTERNAL-ORDER',
    'INSTRUMENT_DECLINED',
  );

  assert.equal(payload.paymentCaptured, false);
  assert.equal(payload.reconciliationRequired, false);
  assert.equal(payload.doNotRetry, false);
  assert.equal(payload.restartPayment, true);
  assert.equal(payload.providerCode, 'INSTRUMENT_DECLINED');
});

test('unknown payment status locks checkout without claiming payment success', () => {
  const capture = require('../_shared/legacy/paypal-capture-forward.cjs');
  const payload = capture._test.verificationPayload('PAYPAL-ORDER', 'INTERNAL-ORDER');

  assert.equal(payload.paymentCaptured, false);
  assert.equal(payload.paymentStatusUnknown, true);
  assert.equal(payload.reconciliationRequired, true);
  assert.equal(payload.doNotRetry, true);
});

test('completed capture finalizes the existing internal order only after exact identity checks', () => {
  const source = read('../_shared/legacy/paypal-capture-forward.cjs');
  const identityCheck = source.indexOf('matchesInternalOrder(originalOrder, order)');
  const captureRequest = source.indexOf('/capture`');
  const paidUpdate = source.indexOf("status = 'paid'");

  assert.ok(identityCheck > -1);
  assert.ok(captureRequest > identityCheck);
  assert.ok(paidUpdate > captureRequest);
  assert.match(source, /paypal_order_id = \$\{orderID\}/);
  assert.match(source, /total_cents = \$\{verifiedCapture\.amountCents\}/);
  assert.match(source, /paypal_capture_id IS NULL/);
});

test('checkout redirects only for a verified completed capture', () => {
  const source = read('../../../src/components/checkout/PayPalCheckoutReliable.tsx');

  assert.match(source, /isCompletedCapture\(payload\)/);
  assert.match(source, /onSuccess\(internalOrderId/);
  assert.match(source, /actions\?\.restart/);
  assert.match(source, /Clock3/);
  assert.match(source, /sessionStorage/);
  assert.doesNotMatch(source, /Your card was not charged/);
  assert.doesNotMatch(source, /Payment received.*animate-spin/s);
});

test('ambiguous existing PayPal order lookup cannot create a replacement order', () => {
  const source = read('../_shared/legacy/paypal-create-order-forward.cjs');

  assert.match(source, /PAYPAL_ORDER_LOOKUP_UNCERTAIN/);
  assert.match(source, /statusCode, body/);
  assert.match(source, /return reply\(202/);
  assert.match(source, /doNotRetry: true/);
  assert.match(source, /payment_reconciliation_status = 'required'/);
});

test('webhook uses the same authoritative capture finalizer', () => {
  const source = read('../_shared/legacy/paypal-webhook-forward.cjs');

  assert.match(source, /require\('\.\/paypal-capture-forward\.cjs'\)/);
  assert.match(source, /captureModule\.handler/);
  assert.doesNotMatch(source, /UPDATE orders[\s\S]*status = 'paid'/);
  assert.doesNotMatch(source, /create-order-core/);
});

test('paid-order follow-ups run independently in the background', () => {
  const source = read('../process-paid-order-followups-background.mjs');
  const retrySource = read('../retry-paid-order-followups.mjs');

  assert.match(source, /forceResendCustomer: true/);
  assert.match(source, /admin_notification_status = 'sent'/);
  assert.match(source, /skipNotifications: true/);
  assert.match(source, /background: true/);
  assert.match(retrySource, /schedule: '\*\/5 \* \* \* \*'/);
  assert.match(retrySource, /confirmation_emailed_at IS NULL/);
  assert.match(retrySource, /admin_notification_sent_at IS NULL/);
});
