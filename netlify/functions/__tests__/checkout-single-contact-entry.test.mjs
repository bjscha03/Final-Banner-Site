import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { _test } from '../paypal-capture-minimal.mjs';

const { normalizeEmail, extractPayPalCustomerEmail, normalizeCustomerInfo } = _test;

test('extracts the email entered in PayPal debit or credit card checkout', () => {
  const email = extractPayPalCustomerEmail({
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
    extractPayPalCustomerEmail({ payment_source: { paypal: { email_address: 'wallet@example.com' } } }),
    'wallet@example.com',
  );
  assert.equal(
    extractPayPalCustomerEmail({ purchase_units: [{ shipping: { email_address: 'ship@example.com' } }] }),
    'ship@example.com',
  );
});

test('never treats a generated guest placeholder as a customer email', () => {
  assert.equal(normalizeEmail('guest-1785263346899@bannersonthefly.com'), null);
  assert.equal(
    extractPayPalCustomerEmail({ payer: { email_address: 'guest-123@bannersonthefly.com' } }),
    null,
  );
});

test('shipping information remains complete without a second merchant email field', () => {
  const customer = normalizeCustomerInfo({
    fullName: 'Brandon Schaefer',
    address1: '3924 Pinoak View Ct',
    city: 'Jeffersontown',
    state: 'KY',
    postalCode: '40299',
    country: 'US',
  });

  assert.equal(customer.fullName, 'Brandon Schaefer');
  assert.equal(customer.email, null);
  assert.equal(customer.state, 'KY');
});

test('checkout renders only PayPal card email collection, not a duplicate merchant email input', () => {
  const checkoutPath = fileURLToPath(new URL('../../../src/components/checkout/PayPalCheckoutContact.tsx', import.meta.url));
  const source = fs.readFileSync(checkoutPath, 'utf8');

  assert.doesNotMatch(source, /Email for confirmation/);
  assert.doesNotMatch(source, /<Input\s+type="email"/);
  assert.match(source, /payment email is collected securely in the card or PayPal step below/i);
  assert.match(source, /body\.customerInfo = info/);
  assert.match(source, /<OriginalPayPalCheckout/);
});
