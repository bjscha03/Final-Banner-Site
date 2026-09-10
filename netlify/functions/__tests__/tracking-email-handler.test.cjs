const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createTrackingEmailData,
  isRetryableProviderError,
  sendWithRetry,
} = require('../_shared/tracking-email-handler.cjs')._test;

const trackingHandlerSource = fs.readFileSync(
  path.resolve(__dirname, '../_shared/tracking-email-handler.cjs'),
  'utf8',
);
const updateTrackingSource = fs.readFileSync(
  path.resolve(__dirname, '../_shared/legacy/update-tracking.cjs'),
  'utf8',
);

const order = {
  id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
  orderNumber: 'F8A0D993',
  customerName: 'Diana Kauffman',
  email: 'dmc112298@gmail.com',
  items: [],
  subtotal: 203.40,
  tax: 12.20,
  total: 215.60,
  discountCents: 360,
  discountLabel: 'Banner Discount',
  sameDayFeeCents: 0,
  saturdayFeeCents: 0,
  shipping_name: 'Diana Kauffman',
  shipping_street: '197 Spruce Road',
  shipping_city: 'Moshannon',
  shipping_state: 'PA',
  shipping_zip: '16859',
  shipping_country: 'US',
};

const trackingNumbers = [
  { carrier: 'fedex', label: 'Package 1', trackingNumber: '394227455171' },
];

test('tracking email uses the current Resend replyTo contract and correct customer', () => {
  const payload = createTrackingEmailData({
    order,
    trackingNumbers,
    from: 'Banners on the Fly <orders@bannersonthefly.com>',
    replyTo: 'support@bannersonthefly.com',
  });

  assert.equal(payload.to, 'dmc112298@gmail.com');
  assert.equal(payload.replyTo, 'support@bannersonthefly.com');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'reply_to'), false);
  assert.match(payload.subject, /F8A0D993/);
  assert.equal(payload.tags[0].value, 'order_shipped');
  assert.equal(payload.tags[1].value, order.id);
  assert.match(payload.html, /394227455171/);
  assert.match(payload.html, /Banner Discount/);
  assert.match(payload.html, /3\.60/);
  assert.match(payload.html, /Diana Kauffman/);
  assert.match(payload.html, /197 Spruce Road/);
});

test('tracking email only succeeds when Resend returns a provider message ID', async () => {
  const successClient = {
    emails: {
      send: async () => ({ data: { id: 're_tracking_123' }, error: null }),
    },
  };
  const result = await sendWithRetry(successClient, { to: order.email }, 1);
  assert.equal(result.data.id, 're_tracking_123');

  const missingIdClient = {
    emails: {
      send: async () => ({ data: {}, error: null }),
    },
  };
  await assert.rejects(
    () => sendWithRetry(missingIdClient, { to: order.email }, 1),
    /message ID/i,
  );
});

test('tracking email classifies only temporary provider failures as retryable', () => {
  assert.equal(isRetryableProviderError({ statusCode: 429, message: 'Rate limit exceeded' }), true);
  assert.equal(isRetryableProviderError({ statusCode: 503, message: 'Temporarily unavailable' }), true);
  assert.equal(isRetryableProviderError({ statusCode: 422, message: 'Invalid recipient' }), false);
});

test('the shared admin tracking card shows Send before the first tracking email', () => {
  const ordersSource = fs.readFileSync(
    path.resolve(__dirname, '../../../src/pages/admin/Orders.tsx'),
    'utf8',
  );
  const managerSource = fs.readFileSync(
    path.resolve(__dirname, '../../../src/components/orders/AdminTrackingManager.tsx'),
    'utf8',
  );

  assert.doesNotMatch(
    managerSource,
    /notificationSent \? 'Resend Tracking Info' : 'Resend Tracking Info'/,
  );
  assert.match(
    managerSource,
    /notificationSent \? 'Resend Tracking Info' : 'Send Tracking Info'/,
  );
  assert.match(
    managerSource,
    /notificationSent\s*\? '\/\.netlify\/functions\/resend-tracking-email'\s*:\s*'\/\.netlify\/functions\/send-shipping-notification'/,
  );
  assert.match(ordersSource, /<AdminTrackingManager/);
  assert.doesNotMatch(ordersSource, /Send Tracking Email|Resend Tracking Email/);
});

test('tracking endpoints preserve refunded and other terminal order states', () => {
  for (const source of [trackingHandlerSource, updateTrackingSource]) {
    expectTerminalGuard(source);
  }
  assert.match(
    trackingHandlerSource,
    /WHEN status IN \('pending', 'paid', 'in_production'\) THEN 'shipped'/,
  );
  assert.match(
    updateTrackingSource,
    /WHEN status IN \('pending', 'paid', 'in_production'\) THEN 'shipped'/,
  );
  assert.doesNotMatch(updateTrackingSource, /SET[\s\S]{0,200}status = 'shipped'/);
});

function expectTerminalGuard(source) {
  assert.match(source, /\['refunded', 'canceled', 'cancelled', 'failed'\]\.includes\(currentStatus\)/);
  assert.match(source, /statusCode: 409/);
}
