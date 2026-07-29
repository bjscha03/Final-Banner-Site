import test from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../get-orders.mjs';

const { getEffectiveWorkflowStatus } = _test;

test('Admin keeps saved-but-unemailed tracking in production', () => {
  assert.equal(getEffectiveWorkflowStatus({
    status: 'shipped',
    tracking_number: '3145435',
    shipping_notification_sent: false,
    shipping_notification_status: 'pending',
    production_email_sent: true,
    production_email_status: 'sent',
  }, true), 'in_production');
});

test('Admin shows shipped only after the tracking email succeeded', () => {
  assert.equal(getEffectiveWorkflowStatus({
    status: 'shipped',
    tracking_number: '3145435',
    shipping_notification_sent: true,
    shipping_notification_status: 'sent',
    production_email_sent: true,
    production_email_status: 'sent',
  }, true), 'shipped');
});

test('captured pending payment still resolves to paid', () => {
  assert.equal(getEffectiveWorkflowStatus({
    status: 'pending',
    tracking_number: null,
    shipping_notification_sent: false,
    production_email_sent: false,
  }, true), 'paid');
});
