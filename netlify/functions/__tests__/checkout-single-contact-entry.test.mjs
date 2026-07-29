import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  normalizeEmail,
  extractCustomerEmail,
  extractShippingAddress,
} = require('../_shared/legacy/paypal-capture-minimal.cjs')._test;

test('extracts the email entered in PayPal debit or credit card checkout', () => {
  const email = extractCustomerEmail({
    payment_source: {
      card: {
        attributes: {
          customer: {
            email_address: 'Card.Buyer@Example.com',
          },
        },
      },
    },
  });

  assert.equal(email, 'card.buyer@example.com');
});

test('extracts PayPal wallet and shipping contact emails', () => {
  assert.equal(
    extractCustomerEmail({ payment_source: { paypal: { email_address: 'wallet@example.com' } } }),
    'wallet@example.com',
  );
  assert.equal(
    extractCustomerEmail({ purchase_units: [{ shipping: { email_address: 'ship@example.com' } }] }),
    'ship@example.com',
  );
});

test('never treats a generated guest placeholder as a customer email', () => {
  assert.equal(normalizeEmail('guest-1785263346899@bannersonthefly.com'), null);
  assert.equal(
    extractCustomerEmail({ payer: { email_address: 'guest-123@bannersonthefly.com' } }),
    null,
  );
});

test('uses the PayPal shipping address returned by the approved order', () => {
  const address = extractShippingAddress({
    purchase_units: [{
      shipping: {
        name: { full_name: 'Brandon Schaefer' },
        address: {
          address_line_1: '3924 Pinoak View Ct',
          admin_area_2: 'Jeffersontown',
          admin_area_1: 'KY',
          postal_code: '40299',
          country_code: 'US',
        },
      },
    }],
  });

  assert.deepEqual(address, {
    name: 'Brandon Schaefer',
    street: '3924 Pinoak View Ct',
    street2: null,
    city: 'Jeffersontown',
    state: 'KY',
    zip: '40299',
    country: 'US',
  });
});

test('uses hosted-card billing data only as a fallback when shipping is absent', () => {
  const address = extractShippingAddress({
    payment_source: {
      card: {
        name: 'Card Buyer',
        billing_address: {
          address_line_1: '100 Main Street',
          admin_area_2: 'Louisville',
          admin_area_1: 'KY',
          postal_code: '40202',
          country_code: 'US',
        },
      },
    },
  });

  assert.equal(address.name, 'Card Buyer');
  assert.equal(address.street, '100 Main Street');
  assert.equal(address.city, 'Louisville');
});

test('checkout renders only the original PayPal hosted payment UI', () => {
  const wrapperPath = fileURLToPath(new URL('../../../src/components/checkout/PayPalCheckoutContact.tsx', import.meta.url));
  const wrapperSource = fs.readFileSync(wrapperPath, 'utf8');
  const checkoutPath = fileURLToPath(new URL('../../../src/components/checkout/PayPalCheckout.tsx', import.meta.url));
  const checkoutSource = fs.readFileSync(checkoutPath, 'utf8');
  const serverPath = fileURLToPath(new URL('../_shared/legacy/paypal-create-order.cjs', import.meta.url));
  const serverSource = fs.readFileSync(serverPath, 'utf8');

  assert.doesNotMatch(wrapperSource, /Email for confirmation/);
  assert.doesNotMatch(wrapperSource, /Shipping information/);
  assert.doesNotMatch(wrapperSource, /<Input/);
  assert.doesNotMatch(wrapperSource, /window\.fetch/);
  assert.match(wrapperSource, /<OriginalPayPalCheckout \{\.\.\.props\} \/>/);

  assert.match(checkoutSource, /fundingSource=\{"card" as any\}/);
  assert.match(checkoutSource, /Debit or Credit Card|fundingSource/);
  assert.match(serverSource, /shipping_preference:\s*'GET_FROM_FILE'/);
});
