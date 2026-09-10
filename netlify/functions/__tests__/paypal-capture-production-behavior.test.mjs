import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import captureModule from '../_shared/legacy/paypal-capture-final.cjs';

const {
  extractCustomerEmail,
  extractShippingAddress,
  successPayload,
  verificationPayload,
  validateCompletedCapture,
} = captureModule._test;

describe('deployed PayPal capture lifecycle', () => {
  it('extracts provider-verified wallet/card contact without generated placeholders', () => {
    expect(extractCustomerEmail({
      payer: { email_address: 'guest-123@bannersonthefly.com' },
      payment_source: {
        card: { attributes: { customer: { email_address: 'Customer@Example.com' } } },
      },
    })).toBe('customer@example.com');
  });

  it('extracts the complete GET_FROM_FILE shipping address', () => {
    expect(extractShippingAddress({
      purchase_units: [{
        shipping: {
          name: { full_name: 'Chantale Riolo' },
          address: {
            address_line_1: '123 Main Street',
            address_line_2: 'Suite 4',
            admin_area_2: 'Buffalo',
            admin_area_1: 'NY',
            postal_code: '14201',
            country_code: 'US',
          },
        },
      }],
    })).toEqual({
      name: 'Chantale Riolo',
      street: '123 Main Street',
      street2: 'Suite 4',
      city: 'Buffalo',
      state: 'NY',
      zip: '14201',
      country: 'US',
    });
  });

  it('accepts only an exact completed USD capture', () => {
    const completed = validateCompletedCapture({
      status: 'COMPLETED',
      purchase_units: [{
        payments: { captures: [{
          id: 'CAPTURE-2',
          status: 'COMPLETED',
          amount: { currency_code: 'USD', value: '42.40' },
        }] },
      }],
    }, 4240);
    expect(completed).toMatchObject({
      ok: true,
      captureId: 'CAPTURE-2',
      captureStatus: 'COMPLETED',
      amountCents: 4240,
      currency: 'USD',
    });
    expect(validateCompletedCapture({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{
        id: 'CAPTURE-3', status: 'PENDING', amount: { currency_code: 'USD', value: '42.40' },
      }] } }],
    }, 4240).ok).toBe(false);
    expect(validateCompletedCapture({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{
        id: 'CAPTURE-4', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '42.40' },
      }] } }],
    }, 4240).ok).toBe(false);
  });

  it('keeps unknown results locked and completed results canonical', () => {
    expect(verificationPayload('PAYPAL-ORDER', 'INTERNAL-ORDER')).toMatchObject({
      paymentCaptured: false,
      paymentStatusUnknown: true,
      reconciliationRequired: true,
      doNotRetry: true,
    });
    expect(successPayload({
      id: 'INTERNAL-ORDER',
      paypal_order_id: 'PAYPAL-ORDER',
      paypal_capture_id: 'CAPTURE-1',
      total_cents: 8000,
      status: 'paid',
    }, null, {
      captureId: 'CAPTURE-1',
      amountCents: 8000,
      currency: 'USD',
    }, 'sandbox', true)).toMatchObject({
      success: true,
      finalized: true,
      paymentCaptured: true,
      captureID: 'CAPTURE-1',
      captureStatus: 'COMPLETED',
      capturedAmountCents: 8000,
      capturedCurrency: 'USD',
      environment: 'sandbox',
    });
  });

  it('authenticates the binding before provider access and atomically replaces provider shipping', async () => {
    const source = await readFile(
      new URL('../_shared/legacy/paypal-capture-final.cjs', import.meta.url),
      'utf8',
    );
    const auth = source.indexOf('constantTimeEqual(checkoutKey, order.checkout_idempotency_key)');
    const oauth = source.indexOf('const config = getConfig()');
    const capture = source.indexOf('/capture`');
    const paid = source.indexOf("status = 'paid'");

    expect(auth).toBeGreaterThan(-1);
    expect(oauth).toBeGreaterThan(auth);
    expect(capture).toBeGreaterThan(oauth);
    expect(paid).toBeGreaterThan(capture);
    expect(source).toMatch(/shipping_street2 = CASE WHEN \$\{hasCompleteProviderShipping\}[\s\S]*THEN \$\{paypalAddress\?\.street2 \|\| null\}/);
    expect(source).not.toMatch(/input\.customer|input\.shippingAddress|approvedOrderData|shippingChangeData/);
    expect(source).toMatch(/The already-paid winner is immutable/);
  });

  it('all deployed capture routes use the full authoritative wrapper', async () => {
    const active = await readFile(new URL('../paypal-capture-minimal.mjs', import.meta.url), 'utf8');
    const compatibility = await readFile(new URL('../paypal-capture-order.mjs', import.meta.url), 'utf8');
    const netlify = await readFile(new URL('../../../netlify.toml', import.meta.url), 'utf8');

    expect(active).toMatch(/paypal-capture-forward\.cjs/);
    expect(active).toMatch(/queuePaidOrderFollowups\(event, internalOrderId\)/);
    expect(compatibility).toMatch(/export \{ default \} from '\.\/paypal-capture-minimal\.mjs'/);
    expect(compatibility).not.toMatch(/paypal-capture-order\.cjs|paypal-capture-forward\.cjs/);
    expect(netlify).toMatch(/from = "\/api\/paypal\/capture-order"[\s\S]*to = "\/\.netlify\/functions\/paypal-capture-order"/);
  });
});
