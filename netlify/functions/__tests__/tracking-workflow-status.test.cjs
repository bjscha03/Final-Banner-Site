const test = require('node:test');
const assert = require('node:assert/strict');

const { getNextTrackingStatus } = require('../_shared/legacy/update-tracking.cjs')._test;

const tracking = [{ carrier: 'fedex', trackingNumber: '3145435', label: 'Package 1' }];

test('saving tracking does not move an in-production order to shipped', () => {
  assert.equal(getNextTrackingStatus({
    status: 'in_production',
    production_email_sent: true,
    production_email_status: 'sent',
    shipping_notification_sent: false,
    shipping_notification_status: 'pending',
  }, tracking), 'in_production');
});

test('legacy shipped-with-unsent-email row is repaired to in production', () => {
  assert.equal(getNextTrackingStatus({
    status: 'shipped',
    production_email_sent: true,
    production_email_status: 'sent',
    shipping_notification_sent: false,
    shipping_notification_status: 'pending',
  }, tracking), 'in_production');
});

test('successfully emailed shipment remains shipped', () => {
  assert.equal(getNextTrackingStatus({
    status: 'shipped',
    production_email_sent: true,
    production_email_status: 'sent',
    shipping_notification_sent: true,
    shipping_notification_status: 'sent',
  }, tracking), 'shipped');
});

test('deleting final tracking restores prior workflow state', () => {
  assert.equal(getNextTrackingStatus({
    status: 'shipped',
    production_email_sent: true,
    production_email_status: 'sent',
    shipping_notification_sent: true,
    shipping_notification_status: 'sent',
  }, []), 'in_production');

  assert.equal(getNextTrackingStatus({
    status: 'shipped',
    production_email_sent: false,
    production_email_status: 'pending',
    shipping_notification_sent: true,
    shipping_notification_status: 'sent',
  }, []), 'paid');
});
