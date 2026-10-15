const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSubmission } = require('../_shared/legacy/custom-quote-submit.cjs');

const base = {
  fullName: 'Casey Sample', email: 'casey@example.com', phone: '555-0100',
  productType: 'specialty', unit: 'inches', quantity: '2',
  shippingZip: '40202', projectDescription: 'A retractable display',
  productOptions: JSON.stringify({
    specialty_slug: 'standard-retractable-banner', variant: '33 × 81 in',
    shipping_address: '100 Main St', shipping_city: 'Louisville',
    shipping_state: 'KY', shipping_location_type: 'commercial',
  }),
};

test('new product request accepts standard configurations without dimensions and preserves delivery details', () => {
  const submission = normalizeSubmission(base);
  assert.equal(submission.width, 0);
  assert.equal(submission.height, 0);
  assert.equal(submission.quantity, 2);
  assert.equal(submission.productOptions.shipping_address, '100 Main St');
});

test('new product request requires full delivery information and paired custom dimensions', () => {
  const options = JSON.parse(base.productOptions);
  delete options.shipping_city;
  assert.throws(() => normalizeSubmission({ ...base, productOptions: JSON.stringify(options) }), /shipping city is required/);
  assert.throws(() => normalizeSubmission({ ...base, width: '24' }), /both positive dimensions/);
  assert.throws(() => normalizeSubmission({ ...base, width: '24', height: '18', productOptions: JSON.stringify({ ...options, shipping_city: 'Louisville', shipping_location_type: 'warehouse' }) }), /Invalid delivery location type/);
});

test('existing product quote validation still requires width and height', () => {
  const banner = { ...base, productType: 'banner', productOptions: '{}' };
  assert.throws(() => normalizeSubmission(banner), /Width must be a positive number/);
  const submission = normalizeSubmission({ ...banner, width: '48', height: '24' });
  assert.equal(submission.width, 48);
  assert.equal(submission.height, 24);
});
