import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { _test } from '../paypal-create-order.mjs';

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
  assert.match(forwardHandler, /buildDetailedPayPalOrderRequest\(body, payload\.items\)/);
  assert.match(forwardHandler, /retrying summary-only request/);
  assert.doesNotMatch(entrypoint, /globalThis\.fetch\s*=/);
});
