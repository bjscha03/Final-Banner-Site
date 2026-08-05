import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { _test } from '../paypal-create-order.mjs';

const require = createRequire(import.meta.url);
const forwardHandlerModule = require('../_shared/legacy/paypal-create-order-forward.cjs');

test('PayPal items display dimensions and preserve the exact final total', () => {
  const items = _test.buildPayPalItems([
    {
      product_type: 'banner',
      width_in: 96,
      height_in: 24,
      material: '13oz',
      quantity: 2,
      line_total_cents: 6000,
      grommets: 'every-2-3ft',
    },
    {
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      quantity: 20,
      line_total_cents: 4000,
      yard_sign_sidedness: 'double',
    },
  ], 10_600);

  assert.equal(items.length, 2);
  assert.match(items[0].name, /96" × 24"/);
  assert.match(items[1].name, /24" × 18"/);
  assert.match(items[0].description, /Custom Banner 96" × 24"/);
  assert.match(items[0].description, /Material: 13oz Vinyl/);
  assert.match(items[0].description, /Qty: 2/);
  assert.match(items[0].description, /Grommets: Every 2–3 Feet/);
  assert.match(items[1].description, /Material: Corrugated Plastic/);
  assert.match(items[1].description, /Print: Double-Sided/);
  assert.match(items[1].description, /Qty: 20/);
  const total = items.reduce(
    (sum, item) => sum + Math.round(Number(item.unit_amount.value) * 100),
    0,
  );
  assert.equal(total, 10_600);
});

test('outbound PayPal request receives valid items and item_total breakdown', () => {
  const outbound = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'USD', value: '42.40' },
      description: 'summary',
    }],
  };
  const eventPayload = {
    items: [{
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      quantity: 1,
      material: '13oz',
      line_total_cents: 4000,
    }],
  };

  const enhanced = _test.enhancePayPalOrderRequest(
    JSON.stringify(outbound),
    JSON.stringify(eventPayload),
  );

  assert.equal(enhanced.purchase_units[0].items.length, 1);
  assert.equal(enhanced.purchase_units[0].amount.breakdown.item_total.value, '42.40');
  assert.equal(enhanced.purchase_units[0].items[0].unit_amount.value, '42.40');
});

test('PayPal invoice creation fails closed instead of emitting a generic item', () => {
  const summary = {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }],
  };

  assert.deepEqual(_test.buildPayPalItems([], 1000), []);
  assert.equal(_test.buildDetailedPayPalOrderRequest(summary, []), null);
  assert.equal(_test.buildDetailedPayPalOrderRequest(summary, [{
    product_type: 'banner',
    width_in: 24,
    height_in: 36,
    quantity: 1,
    material: '13oz',
    line_total_cents: 0,
  }]), null);
});

test('PayPal order responses must preserve every required specification', () => {
  const detailedOrder = {
    purchase_units: [{
      items: [{
        name: 'Custom Banner 24" × 36"',
        description: 'Custom Banner 24" × 36" | Size: 24" × 36" • Material: 13oz Vinyl • Qty: 1',
      }],
    }],
  };
  const genericOrder = {
    purchase_units: [{
      items: [{ name: 'Custom Printed Order', description: 'Banners On The Fly custom printing order' }],
    }],
  };

  assert.equal(forwardHandlerModule._test.hasCompleteLineItemDetails(detailedOrder, 1), true);
  assert.equal(forwardHandlerModule._test.hasCompleteLineItemDetails(genericOrder, 1), false);
  assert.equal(forwardHandlerModule._test.hasCompleteLineItemDetails(detailedOrder, 2), false);
});

test('authoritative handler constructs PayPal line items directly', () => {
  const summary = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'USD', value: '60.00' },
      custom_id: 'internal-order-id',
      invoice_id: 'BOTF-internal-order-id',
    }],
  };
  const detailed = _test.buildDetailedPayPalOrderRequest(summary, [{
    product_type: 'banner',
    width_in: 96,
    height_in: 24,
    quantity: 2,
    material: '13oz',
    line_total_cents: 6000,
  }]);

  assert.equal(summary.purchase_units[0].items, undefined);
  assert.equal(detailed.purchase_units[0].items.length, 1);
  assert.match(detailed.purchase_units[0].items[0].name, /96" × 24"/);
  assert.equal(detailed.purchase_units[0].amount.breakdown.item_total.value, '60.00');

  const forwardHandler = readFileSync(
    new URL('../_shared/legacy/paypal-create-order-forward.cjs', import.meta.url),
    'utf8',
  );
  const entrypoint = readFileSync(new URL('../paypal-create-order.mjs', import.meta.url), 'utf8');
  assert.match(forwardHandler, /FROM order_items/);
  assert.match(forwardHandler, /buildDetailedPayPalOrderRequest\(body, authoritativeItems\)/);
  assert.match(forwardHandler, /description: getPayPalDescription\(authoritativeItems\)/);
  assert.match(forwardHandler, /body: JSON\.stringify\(detailedBody\)/);
  assert.match(forwardHandler, /Prefer: 'return=representation'/);
  assert.match(forwardHandler, /replacing active PayPal order without complete line items/);
  assert.match(forwardHandler, /const creationAccepted = response\.ok/);
  assert.doesNotMatch(forwardHandler, /payload\.items/);
  assert.doesNotMatch(forwardHandler, /retrying summary-only request/);
  assert.doesNotMatch(entrypoint, /globalThis\.fetch\s*=/);
});
