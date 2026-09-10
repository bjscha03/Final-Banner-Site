const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProductionEmailData,
  normalizeEmailError,
  isRetryableEmailError,
} = require('../_shared/legacy/mark-in-production.cjs')._test;

test('in-production email uses the Resend Node SDK replyTo field', () => {
  const message = buildProductionEmailData(
    {
      id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
      orderNumber: 'F8A0D993',
      customerName: 'Diana Kauffman',
      items: [],
      subtotal: 203.40,
      tax: 12.20,
      total: 215.60,
      discountCents: 360,
      discountLabel: 'Discount',
      shipping_name: 'Diana Kauffman',
      shipping_street: '197 Spruce Road',
      shipping_city: 'Moshannon',
      shipping_state: 'PA',
      shipping_zip: '16859',
      shipping_country: 'US',
    },
    'dmc112298@gmail.com',
    'Banners on the Fly <orders@bannersonthefly.com>',
    'support@bannersonthefly.com',
  );

  assert.equal(message.to, 'dmc112298@gmail.com');
  assert.equal(message.replyTo, 'support@bannersonthefly.com');
  assert.equal(Object.prototype.hasOwnProperty.call(message, 'reply_to'), false);
  assert.match(message.subject, /F8A0D993/);
  assert.equal(message.tags[1].value, '2ad3018b-680a-463e-b761-9fdcf8a0d993');
});

test('Resend API errors are preserved and transient errors are retryable', () => {
  assert.equal(normalizeEmailError({ message: 'Rate limit exceeded' }), 'Rate limit exceeded');
  assert.equal(isRetryableEmailError({ statusCode: 429, message: 'Rate limit exceeded' }), true);
  assert.equal(isRetryableEmailError({ statusCode: 500, message: 'Provider error' }), true);
  assert.equal(isRetryableEmailError({ statusCode: 422, message: 'Invalid recipient' }), false);
});
