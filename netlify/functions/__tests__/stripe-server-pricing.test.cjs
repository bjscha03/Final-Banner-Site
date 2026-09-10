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
  for (const expected of [
    'YARD_SIGN_SINGLE_SIDED_CENTS = 1200',
    'YARD_SIGN_DOUBLE_SIDED_CENTS = 1400',
    'YARD_SIGN_STEP_STAKE_CENTS = 150',
  ]) assert.ok(yardPricing.includes(expected), `yard-sign price changed: ${expected}`);
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
  assert.equal(item.unit_price_cents, 3600);
  assert.equal(item.rope_cost_cents, 1600);
  assert.equal(item.pole_pocket_cost_cents, 4700);
  assert.equal(item.line_total_cents, 13500);

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
