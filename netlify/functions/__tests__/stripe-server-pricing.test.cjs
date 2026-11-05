'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repriceStripeCart } = require('../_shared/stripe-server-pricing.cjs');

test('server checkout guard remains aligned with the product registry source', () => {
  const registry = fs.readFileSync(path.join(__dirname, '../../../src/lib/products/registry.ts'), 'utf8');
  const yardPricing = fs.readFileSync(path.join(__dirname, '../../../src/lib/yard-sign-pricing.ts'), 'utf8');
  for (const expected of [
    "{ key: '13oz', label: '13oz Vinyl', pricePerSqFt: 4.5 }",
    "{ key: '15oz', label: '15oz Vinyl', pricePerSqFt: 6.0 }",
    "{ key: '18oz', label: '18oz Vinyl', pricePerSqFt: 7.5 }",
    "{ key: 'mesh', label: 'Mesh Banner', pricePerSqFt: 6.0 }",
    'minimumUnitPriceCents: 2000',
    'pricePerFootCents: 200',
    'setupFeeCents: 1500',
    'pricePerLinearFootCents: 200',
    `widthIn: 18, heightIn: 12, basePriceCents: 2900`,
    `widthIn: 24, heightIn: 12, basePriceCents: 4000`,
    `widthIn: 24, heightIn: 18, basePriceCents: 4700`,
    `widthIn: 42, heightIn: 12, basePriceCents: 6000`,
    `widthIn: 72, heightIn: 24, basePriceCents: 16000`,
  ]) assert.ok(registry.includes(expected), `registry value changed: ${expected}`);
  const [standard] = require('../../../shared/yard-sign-sizes.json');
  assert.equal(standard.singleCents, 1200);
  assert.equal(standard.doubleCents, 1400);
  assert.ok(yardPricing.includes('YARD_SIGN_STEP_STAKE_CENTS = 150'));
});

test('banner price is rebuilt from registry rules and ignores browser totals', () => {
  const [item] = repriceStripeCart([{
    product_type: 'banner',
    width_in: 48,
    height_in: 24,
    quantity: 2,
    material: '13oz',
    grommets: '4-corners',
    rope_feet: 4,
    rope_placement: 'top',
    pole_pockets: 'top-bottom',
    pole_pocket_position: 'top-bottom',
    line_total_cents: 1,
    unit_price_cents: 1,
  }]);
  assert.equal(item.unit_price_cents, 4000);
  assert.equal(item.rope_cost_cents, 1600);
  assert.equal(item.pole_pocket_cost_cents, 4700);
  assert.equal(item.line_total_cents, 14300);

  const [bottomCorners] = repriceStripeCart([{
    product_type: 'banner', width_in: 48, height_in: 24, quantity: 1,
    material: '13oz', grommets: 'bottom-corners',
  }]);
  assert.equal(bottomCorners.grommets, 'bottom-corners');
});

test('yard sign price and per-design quantity are authoritative', () => {
  const [item] = repriceStripeCart([{
    product_type: 'yard_sign',
    width_in: 24,
    height_in: 18,
    quantity: 20,
    material: 'corrugated',
    yard_sign_sidedness: 'double',
    yard_sign_step_stakes_enabled: true,
    yard_sign_step_stakes_qty: 15,
    yard_sign_design_count: 2,
    yard_sign_designs: [{ quantity: 10 }, { quantity: 10 }],
    line_total_cents: 99,
  }]);
  assert.equal(item.yard_sign_signs_subtotal_cents, 28000);
  assert.equal(item.yard_sign_stakes_subtotal_cents, 2250);
  assert.equal(item.line_total_cents, 30250);
  assert.throws(
    () => repriceStripeCart([{ ...item, quantity: 30 }]),
    (error) => error.code === 'YARD_SIGN_DESIGN_QUANTITY_MISMATCH',
  );
});

test('fixed car-magnet price cannot be replaced by a browser value', () => {
  const [item] = repriceStripeCart([{
    product_type: 'car_magnet',
    width_in: 72,
    height_in: 24,
    quantity: 2,
    material: 'magnetic',
    rounded_corners: '1',
    line_total_cents: 1,
  }]);
  assert.equal(item.unit_price_cents, 16000);
  assert.equal(item.line_total_cents, 32000);
});

test('unsupported products, materials, sizes, and options fail closed', () => {
  assert.throws(
    () => repriceStripeCart([{ product_type: 'mystery', quantity: 1 }]),
    (error) => error.code === 'PRODUCT_TYPE_UNSUPPORTED',
  );
  assert.throws(
    () => repriceStripeCart([{
      product_type: 'banner', width_in: 48, height_in: 24, quantity: 1, material: 'free', grommets: 'none',
    }]),
    (error) => error.code === 'BANNER_MATERIAL_INVALID',
  );
  assert.throws(
    () => repriceStripeCart([{
      product_type: 'car_magnet', width_in: 25, height_in: 12, quantity: 1, material: 'magnetic',
    }]),
    (error) => error.code === 'CAR_MAGNET_SIZE_INVALID',
  );
  assert.throws(
    () => repriceStripeCart([{
      product_type: 'banner', width_in: 48, height_in: 24, quantity: 1, material: '13oz',
      grommets: 'none', pole_pockets: 'top', pole_pocket_size: '99',
    }]),
    (error) => error.code === 'BANNER_POLE_POCKET_SIZE_INVALID',
  );
});


test('large banner tiers and aggregate online area limits are enforced', () => {
  const banner = { product_type: 'banner', width_in: 600, height_in: 60, quantity: 1, material: '13oz', grommets: 'none' };
  assert.equal(repriceStripeCart([banner])[0].unit_price_cents, 74750);
  assert.equal(repriceStripeCart([{ ...banner, quantity: 4 }])[0].line_total_cents, 299000);
  assert.throws(() => repriceStripeCart([{ ...banner, quantity: 5 }]));
  assert.throws(() => repriceStripeCart([{ ...banner, height_in: 193 }]));
  assert.equal(repriceStripeCart([{ ...banner, height_in: 192 }])[0].unit_price_cents, 226000);
});

for (const [id, width, height, step, max, single, double] of [
  ['24x18', 24, 18, 10, 90, 1200, 1400],
  ['12x18', 18, 12, 20, 180, 800, 1000],
  ['18x24', 18, 24, 8, 72, 1300, 1600],
  ['24x24', 24, 24, 8, 72, 1400, 1700],
  ['24x36', 36, 24, 4, 36, 2000, 2400],
]) {
  test(`${id} prices full sheets at both limits and enforces the printed dimensions`, () => {
    const line = {
      product_type: 'yard_sign', width_in: width, height_in: height, yard_sign_size_id: id,
      quantity: step, yard_sign_designs: [{ quantity: step }], line_total_cents: 1,
    };
    for (let quantity = step; quantity <= max; quantity += step) {
      for (const [side, price] of [['single', single], ['double', double]]) {
        const [priced] = repriceStripeCart([{ ...line, quantity, yard_sign_designs: [{ quantity }],
          yard_sign_sidedness: side, yard_sign_step_stakes_enabled: true, yard_sign_step_stakes_qty: quantity }]);
        assert.equal(priced.unit_price_cents, price);
        assert.equal(priced.line_total_cents, (price + 150) * quantity);
      }
    }
    for (const quantity of [step - 1, step + 1, max + step]) {
      assert.throws(() => repriceStripeCart([{ ...line, quantity, yard_sign_designs: [{ quantity }] }]));
    }
    assert.throws(() => repriceStripeCart([{ ...line, yard_sign_size_id: 'unknown' }]), { code: 'YARD_SIGN_SIZE_INVALID' });
    if (id !== '24x18') {
      assert.throws(() => repriceStripeCart([{ ...line, yard_sign_designs: [{ quantity: 1 }, { quantity: step - 1 }] }]), { code: 'YARD_SIGN_QUANTITY_INVALID' });
    }
  });
}
