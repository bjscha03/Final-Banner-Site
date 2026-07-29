const test = require('node:test');
const assert = require('node:assert/strict');

const {
  UUID_RE,
  PUBLIC_STATUSES,
  publicOrderShape,
} = require('../_shared/legacy/get-order-public.cjs')._test;

test('email order detail fallback requires an unguessable full UUID and completed order state', () => {
  assert.equal(UUID_RE.test('2ad3018b-680a-463e-b761-9fdcf8a0d993'), true);
  assert.equal(UUID_RE.test('F8A0D993'), false);
  assert.equal(PUBLIC_STATUSES.has('paid'), true);
  assert.equal(PUBLIC_STATUSES.has('in_production'), true);
  assert.equal(PUBLIC_STATUSES.has('shipped'), true);
  assert.equal(PUBLIC_STATUSES.has('pending'), false);
  assert.equal(PUBLIC_STATUSES.has('failed'), false);
});

test('public order shape returns customer-facing details but excludes payment and file secrets', () => {
  const shaped = publicOrderShape(
    {
      id: '2ad3018b-680a-463e-b761-9fdcf8a0d993',
      order_number: 'F8A0D993',
      user_id: 'private-profile-id',
      email: 'dmc112298@gmail.com',
      customer_name: 'Diana Kauffman',
      subtotal_cents: 20340,
      tax_cents: 1220,
      total_cents: 21560,
      status: 'in_production',
      tracking_number: '394227455171',
      tracking_numbers: [{ carrier: 'fedex', trackingNumber: '394227455171', label: 'Package 1' }],
      shipping_name: 'Diana Kauffman',
      shipping_street: '197 Spruce Road',
      shipping_city: 'Moshannon',
      shipping_state: 'PA',
      shipping_zip: '16859',
      shipping_country: 'US',
      applied_discount_cents: 360,
      applied_discount_label: 'Banner Discount',
      paypal_order_id: 'PAYPAL-PRIVATE',
      paypal_capture_id: 'CAPTURE-PRIVATE',
      created_at: '2026-07-28T12:00:00.000Z',
    },
    [{
      width_in: 36,
      height_in: 24,
      quantity: 2,
      material: '13oz',
      grommets: 'corners',
      line_total_cents: 7200,
      product_type: 'banner',
      thumbnail_url: 'https://example.com/thumb.jpg',
      file_key: 'private-original-file-key',
    }],
  );

  assert.equal(shaped.email, 'dmc112298@gmail.com');
  assert.equal(shaped.shippingAddress.line1, '197 Spruce Road');
  assert.equal(shaped.trackingNumbers[0].trackingNumber, '394227455171');
  assert.equal(shaped.items[0].width_in, 36);
  assert.equal(shaped.items[0].thumbnail_url, 'https://example.com/thumb.jpg');
  assert.equal(Object.prototype.hasOwnProperty.call(shaped, 'user_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shaped, 'paypal_order_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shaped, 'paypal_capture_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(shaped.items[0], 'file_key'), false);
});
