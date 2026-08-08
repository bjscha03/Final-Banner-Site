import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('definitive funding decline is never reported as captured or reconciliation', () => {
  const capture = require('../_shared/legacy/paypal-capture-final.cjs');
  const payload = capture._test.failurePayload(
    'PAYPAL-ORDER',
    'INTERNAL-ORDER',
    'INSTRUMENT_DECLINED',
  );

  assert.equal(payload.paymentCaptured, false);
  assert.equal(payload.paymentStatusUnknown, false);
  assert.equal(payload.reconciliationRequired, false);
  assert.equal(payload.doNotRetry, false);
  assert.equal(payload.providerCode, 'INSTRUMENT_DECLINED');
});

test('decline wrapper retires the failed provider order and never auto-reopens PayPal', () => {
  const source = read('../paypal-capture-minimal.mjs');
  const checkout = read('../../../src/components/checkout/PayPalCheckoutReliable.tsx');

  assert.match(source, /retireDefinitivelyDeclinedPayPalOrder/);
  assert.match(source, /restartPayment:\s*false/);
  assert.match(source, /retryAllowed:\s*true/);
  assert.doesNotMatch(checkout, /actions\?\.restart/);
});

test('unknown payment status is polled and can resolve to success or retry', () => {
  const source = read('../../../src/components/checkout/PayPalCheckoutReliable.tsx');
  const statusSource = read('../paypal-payment-status.mjs');

  assert.match(source, /paypal-payment-status/);
  assert.match(source, /VERIFICATION_MAX_ATTEMPTS/);
  assert.match(source, /finishSuccess\(payload/);
  assert.match(source, /resetForRetry\(message\)/);
  assert.match(statusSource, /reconcileOnly:\s*true/);
  assert.match(statusSource, /retryAllowed:\s*true/);
});

test('checkout collects authoritative customer details beside PayPal-hosted card fields', () => {
  const source = read('../../../src/components/checkout/PayPalCheckoutReliable.tsx');
  const config = read('../_shared/legacy/paypal-config.cjs');

  assert.match(source, /components:\s*'buttons,card-fields'/);
  assert.match(source, /PayPalCardFieldsProvider/);
  assert.match(source, /PayPalCardFieldsForm/);
  assert.match(source, /renderPayPalButton\(\)/);
  assert.match(source, /First Name \*/);
  assert.match(source, /Shipping address is the same as billing/);
  assert.doesNotMatch(source, /guestName|Order contact/);
  assert.doesNotMatch(source, /PayPalHostedFields|fundingSource="card"/);
  assert.match(config, /components:\s*'buttons,card-fields'/);
  assert.match(config, /generate-token|client_token/);
  assert.doesNotMatch(`${source}\n${config}`, /fastlane/i);
});

test('completed capture finalizes the existing internal order only after identity and amount checks', () => {
  const source = read('../_shared/legacy/paypal-capture-final.cjs');
  const identityCheck = source.indexOf('matchesInternalOrder(originalOrder, order)');
  const captureRequest = source.indexOf('/capture`');
  const paidUpdate = source.indexOf("status = 'paid'");

  assert.ok(identityCheck > -1);
  assert.ok(captureRequest > identityCheck);
  assert.ok(paidUpdate > captureRequest);
  assert.match(source, /total_cents = \$\{verifiedCapture\.amountCents\}/);
  assert.match(source, /paypal_capture_id IS NULL/);
});

test('hosted PayPal payer and shipping details are persisted before notifications', () => {
  const customerInfo = read('../_shared/legacy/paypal-customer-info.cjs');
  const captureWrapper = read('../paypal-capture-minimal.mjs');
  const webhookWrapper = read('../paypal-webhook.mjs');
  const followups = read('../process-paid-order-followups-background.mjs');

  assert.match(customerInfo, /purchase_units/);
  assert.match(customerInfo, /payer\?\.email_address/);
  assert.match(customerInfo, /shipping\?\.address/);
  assert.match(customerInfo, /Prefer:\s*'return=representation'/);
  assert.match(customerInfo, /UPDATE orders/);
  assert.match(customerInfo, /customer_name/);
  assert.match(customerInfo, /shipping_street/);
  assert.match(captureWrapper, /approvedOrderData/);
  assert.match(captureWrapper, /refreshOrderCustomerInfo/);
  assert.match(webhookWrapper, /refreshOrderCustomerInfo/);
  assert.match(followups, /isUsableCustomerEmail/);
  assert.match(followups, /refreshOrderCustomerInfo/);
});

test('checkout redirects only for a verified completed capture', () => {
  const source = read('../../../src/components/checkout/PayPalCheckoutReliable.tsx');

  assert.match(source, /isCompletedCapture\(payload\)/);
  assert.match(source, /finishSuccess\(payload/);
  assert.match(source, /onSuccess\(internalOrderId/);
  assert.match(source, /sessionStorage/);
  assert.doesNotMatch(source, /Payment received.*animate-spin/s);
  assert.doesNotMatch(source, /actions\?\.restart/);
});

test('ambiguous existing PayPal order lookup cannot create a replacement order', () => {
  const source = read('../_shared/legacy/paypal-create-order-forward.cjs');

  assert.match(source, /PAYPAL_ORDER_LOOKUP_UNCERTAIN/);
  assert.match(source, /return reply\(202/);
  assert.match(source, /doNotRetry:\s*true/);
  assert.match(source, /payment_reconciliation_status = 'required'/);
});

test('webhook uses the same authoritative capture finalizer', () => {
  const source = read('../_shared/legacy/paypal-webhook-forward.cjs');

  assert.match(source, /require\('\.\/paypal-capture-forward\.cjs'\)/);
  assert.match(source, /captureModule\.handler/);
  assert.doesNotMatch(source, /UPDATE orders[\s\S]*status = 'paid'/);
  assert.doesNotMatch(source, /create-order-core/);
});

test('paid-order follow-ups use the existing notify-order Resend templates', () => {
  const source = read('../process-paid-order-followups-background.mjs');
  const retrySource = read('../retry-paid-order-followups.mjs');

  assert.match(source, /notifyOrderModule\.handler/);
  assert.match(source, /forceResendBoth/);
  assert.match(source, /skipNotifications:\s*true/);
  assert.match(source, /background:\s*true/);
  assert.doesNotMatch(source, /new Resend/);
  assert.doesNotMatch(source, /<!doctype html>|New Paid Order/);
  assert.match(retrySource, /schedule:\s*'\*\/5 \* \* \* \*'/);
  assert.match(retrySource, /confirmation_emailed_at IS NULL/);
  assert.match(retrySource, /admin_notification_sent_at IS NULL/);
});
