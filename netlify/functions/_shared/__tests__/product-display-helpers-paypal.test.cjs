const test = require('node:test');
const assert = require('node:assert/strict');
const { getPayPalDescription } = require('../legacy/product-display-helpers.cjs');

test('single banner PayPal description includes dimensions and options', () => {
  const description = getPayPalDescription([{
    product_type: 'banner',
    width_in: 96,
    height_in: 24,
    material: '13oz',
    quantity: 2,
    grommets: 'every-2-3ft',
    pole_pockets: 'none',
    rope_feet: 0,
  }]);

  assert.match(description, /96" × 24"/);
  assert.match(description, /Qty 2/);
  assert.ok(description.length <= 127);
});

test('multi-item PayPal description no longer degrades to a generic title', () => {
  const description = getPayPalDescription([
    {
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      material: '15oz',
      quantity: 1,
    },
    {
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      yard_sign_sidedness: 'double',
      quantity: 20,
    },
  ]);

  assert.match(description, /72" × 36"/);
  assert.match(description, /24" × 18"/);
  assert.match(description, /Qty 20/);
  assert.notEqual(description, 'Custom Order - Banners On The Fly');
  assert.ok(description.length <= 127);
});
