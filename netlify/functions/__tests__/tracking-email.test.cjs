const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildShippingEmailData,
  normalizeEmailError,
  isRetryableEmailError,
} = require('../_shared/legacy/resend-tracking-email.cjs')._test;

const order = {
  id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
  orderNumber: 'F8A0D993',
  customerName: 'Diana Kauffman',
  email: 'dmc112298@gmail.com',
  items: [],
  subtotal: 207,
  tax: 12.20,
  total: 215.60,
  discountCents: 360,
  discountLabel: 'Qty Discount (5% off)',
  shipping_name: 'Diana Kauffman',
  shipping_street: '197 Spruce Road',
  shipping_city: 'Moshannon',
  shipping_state: 'PA',
  shipping_zip: '16859',
  shipping_country: 'US',
};

test('tracking email uses replyTo and includes every FedEx package link', () => {
  const message = buildShippingEmailData(
    order,
    [
      { carrier: 'fedex', trackingNumber: '3145435', label: 'Yard Signs' },
      { carrier: 'fedex', trackingNumber: '987654321', label: 'Banners' },
    ],
    'Banners on the Fly <orders@bannersonthefly.com>',
    'support@bannersonthefly.com',
  );

  assert.equal(message.to, 'dmc112298@gmail.com');
  assert.equal(message.replyTo, 'support@bannersonthefly.com');
  assert.equal(Object.prototype.hasOwnProperty.call(message, 'reply_to'), false);
  assert.match(message.subject, /F8A0D993/);
  assert.match(message.html, /3145435/);
  assert.match(message.html, /987654321/);
  assert.match(message.html, /fedextrack/);
  assert.match(message.html, /Yard Signs/);
  assert.match(message.html, /Banners/);
});

test('tracking email provider errors preserve details and retry only transient failures', () => {
  assert.equal(normalizeEmailError({ message: 'Rate limit exceeded' }), 'Rate limit exceeded');
  assert.equal(isRetryableEmailError({ statusCode: 429, message: 'Rate limit exceeded' }), true);
  assert.equal(isRetryableEmailError({ statusCode: 503, message: 'Provider unavailable' }), true);
  assert.equal(isRetryableEmailError({ statusCode: 422, message: 'Invalid recipient' }), false);
});
