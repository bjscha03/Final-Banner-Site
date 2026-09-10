import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { _test } from '../paypal-create-order.mjs';

const require = createRequire(import.meta.url);
const forward = require('../_shared/legacy/paypal-create-order-forward.cjs');
const cents = (money) => Math.round(Number(money?.value || 0) * 100);
const structuredItemTotal = (items) => items.reduce(
  (sum, item) => sum + cents(item.unit_amount) * Number(item.quantity),
  0,
);

const banner = {
  product_type: 'banner',
  width_in: 96,
  height_in: 24,
  material: '13oz',
  quantity: 2,
  line_total_cents: 6001,
  grommets: 'every-2-3ft',
  pole_pockets: true,
  pole_pocket_position: 'top',
  pole_pocket_size: '3in',
};
const yardSigns = {
  product_type: 'yard_sign',
  width_in: 24,
  height_in: 18,
  quantity: 20,
  line_total_cents: 4000,
  yard_sign_sidedness: 'double',
  yard_sign_step_stakes_enabled: true,
  yard_sign_step_stakes_qty: 20,
};

test('PayPal structured rows preserve real quantities and indivisible cents exactly', () => {
  const items = _test.buildPayPalItems([banner, yardSigns], 10_001);

  assert.equal(items.length, 3, 'odd banner cents split into two real-unit price tiers');
  assert.equal(items.reduce((sum, item) => sum + Number(item.quantity), 0), 22);
  assert.equal(structuredItemTotal(items), 10_001);
  assert.deepEqual(
    items.filter((item) => item.sku.startsWith('BANNER-')).map((item) => Number(item.quantity)),
    [1, 1],
  );
  assert.equal(
    items.filter((item) => item.sku.startsWith('YARD-SIGN-')).reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    ),
    20,
  );
  assert.match(items[0].description, /Material: 13oz Vinyl/);
  assert.match(items[0].description, /Qty: 2/);
  assert.match(items.at(-1).description, /Print: Double-Sided/);
  assert.match(items.at(-1).description, /Step Stakes/);
});

test('PayPal invoice breakdown exposes merchandise, tax, shipping, handling and discount exactly', () => {
  const summary = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'USD', value: '130.01' },
      custom_id: 'internal-order-id',
      invoice_id: 'BOTF-internal-order-id',
    }],
  };
  const detailed = _test.buildDetailedPayPalOrderRequest(summary, [banner, yardSigns], {
    subtotalCents: 10_001,
    taxCents: 600,
    shippingCents: 0,
    handlingCents: 4400,
    discountCents: 2000,
  });

  assert.ok(detailed);
  const unit = detailed.purchase_units[0];
  assert.equal(structuredItemTotal(unit.items), 10_001);
  assert.deepEqual(unit.amount.breakdown, {
    item_total: { currency_code: 'USD', value: '100.01' },
    shipping: { currency_code: 'USD', value: '0.00' },
    tax_total: { currency_code: 'USD', value: '6.00' },
    handling: { currency_code: 'USD', value: '44.00' },
    discount: { currency_code: 'USD', value: '20.00' },
  });
  const equation = cents(unit.amount.breakdown.item_total)
    + cents(unit.amount.breakdown.tax_total)
    + cents(unit.amount.breakdown.shipping)
    + cents(unit.amount.breakdown.handling)
    - cents(unit.amount.breakdown.discount);
  assert.equal(equation, cents(unit.amount));
});

test('minimum-order adjustment is truthful handling, not a fake physical product', () => {
  const item = { ...banner, quantity: 1, line_total_cents: 1500 };
  const detailed = _test.buildDetailedPayPalOrderRequest({
    purchase_units: [{ amount: { currency_code: 'USD', value: '21.20' } }],
  }, [item], {
    subtotalCents: 1500,
    taxCents: 120,
    shippingCents: 0,
    handlingCents: 500,
    discountCents: 0,
  });

  assert.equal(detailed.purchase_units[0].items.length, 1);
  assert.equal(detailed.purchase_units[0].items[0].quantity, '1');
  assert.equal(detailed.purchase_units[0].amount.breakdown.item_total.value, '15.00');
  assert.equal(detailed.purchase_units[0].amount.breakdown.handling.value, '5.00');
});

test('PayPal invoice creation fails closed for invalid arithmetic, items, and item limit splits', () => {
  const summary = {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }],
  };
  assert.deepEqual(_test.buildPayPalItems([], 1000), []);
  assert.equal(_test.buildDetailedPayPalOrderRequest(summary, []), null);
  assert.equal(_test.buildDetailedPayPalOrderRequest(summary, [{ ...banner, line_total_cents: 0 }]), null);
  assert.equal(_test.buildDetailedPayPalOrderRequest(summary, [banner], {
    subtotalCents: 6001,
    taxCents: 0,
    shippingCents: 0,
    handlingCents: 0,
    discountCents: 0,
  }), null, 'grand total must equal the complete breakdown equation');

  const tooManySplitRows = Array.from({ length: 51 }, (_, index) => ({
    ...banner,
    id: String(index),
    line_total_cents: 101,
  }));
  assert.deepEqual(_test.buildPayPalItems(tooManySplitRows, 5151), []);
});

test('persisted checkout shipping is sent and exact PayPal echoes are required', () => {
  const shipping = forward._test.persistedPayPalShipping({
    customer_name: 'Original Contact',
    shipping_name: 'Delivery Recipient',
    shipping_street: '123 Main Street',
    shipping_street2: 'Suite 4',
    shipping_city: 'Buffalo',
    shipping_state: 'NY',
    shipping_zip: '14201',
    shipping_country: 'us',
  });
  assert.deepEqual(shipping, {
    name: { full_name: 'Delivery Recipient' },
    address: {
      address_line_1: '123 Main Street',
      address_line_2: 'Suite 4',
      admin_area_2: 'Buffalo',
      admin_area_1: 'NY',
      postal_code: '14201',
      country_code: 'US',
    },
  });
  assert.equal(forward._test.persistedPayPalShipping({ shipping_street: '123 Main' }), null);

  const expected = _test.buildDetailedPayPalOrderRequest({
    purchase_units: [{
      amount: { currency_code: 'USD', value: '60.01' },
      custom_id: 'internal-order-id',
      invoice_id: 'BOTF-internal-order-id',
      shipping,
    }],
  }, [banner], {
    subtotalCents: 6001,
    taxCents: 0,
    shippingCents: 0,
    handlingCents: 0,
    discountCents: 0,
  });
  const echoed = JSON.parse(JSON.stringify(expected));
  assert.equal(forward._test.hasCompleteOrderDetails(echoed, expected), true);
  echoed.purchase_units[0].shipping.address.address_line_2 = 'Attacker Suite';
  assert.equal(forward._test.hasCompleteOrderDetails(echoed, expected), false);
  echoed.purchase_units[0].shipping.address.address_line_2 = 'Suite 4';
  echoed.purchase_units[0].items[0].quantity = '999';
  assert.equal(forward._test.hasCompleteOrderDetails(echoed, expected), false);
});

test('authoritative forwarder reprices persisted rows and validates exact identity before linking', () => {
  const source = readFileSync(
    new URL('../_shared/legacy/paypal-create-order-forward.cjs', import.meta.url),
    'utf8',
  );
  const entrypoint = readFileSync(new URL('../paypal-create-order.mjs', import.meta.url), 'utf8');

  assert.match(source, /repriceCheckoutCart\(persistedItems\)/);
  assert.match(source, /lineMismatch/);
  assert.match(source, /buildDetailedPayPalOrderRequest\(body, authoritativeItems, \{/);
  assert.match(source, /minimumOrderAdjustmentCents/);
  assert.match(source, /Same-Day Hit/);
  assert.match(source, /Saturday Service/);
  assert.match(source, /const identityMatches = matchesInternalOrder\(paypalOrder, order\)/);
  assert.match(source, /hasCompleteOrderDetails\(paypalOrder, detailedBody\)/);
  assert.match(source, /constantTimeEqual\(checkoutKey, order\.checkout_idempotency_key\)/);
  assert.match(source, /body: JSON\.stringify\(detailedBody\)/);
  assert.doesNotMatch(source, /payload\.items/);
  assert.doesNotMatch(entrypoint, /globalThis\.fetch\s*=/);
});
