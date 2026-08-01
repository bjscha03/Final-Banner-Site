import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import captureModule from '../_shared/legacy/paypal-capture-minimal.cjs';

const {
  extractCustomerEmail,
  extractShippingAddress,
  customerFirstName,
  queueProductionPdfs,
  buildSuccessPayload,
  buildReconciliationPayload,
  validateCompletedCapture,
} = captureModule._test;

describe('PayPal capture production behavior', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.URL = 'https://example.test';
    process.env.INTERNAL_JOB_SECRET = 'test-secret';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('extracts a usable guest-card customer email', () => {
    expect(extractCustomerEmail({
      payment_source: {
        card: {
          attributes: {
            customer: { email_address: 'Customer@Example.com' },
          },
        },
      },
    })).toBe('customer@example.com');
  });

  it('extracts PayPal-wallet email and ignores generated guest placeholders', () => {
    expect(extractCustomerEmail({
      payer: { email_address: 'guest-123@bannersonthefly.com' },
      payment_source: { paypal: { email_address: 'wallet@example.com' } },
    })).toBe('wallet@example.com');
  });

  it('extracts customer name and the complete shipping address', () => {
    const shipping = extractShippingAddress({
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
    });

    expect(shipping).toEqual({
      name: 'Chantale Riolo',
      street: '123 Main Street',
      street2: 'Suite 4',
      city: 'Buffalo',
      state: 'NY',
      zip: '14201',
      country: 'US',
    });
    expect(customerFirstName(shipping)).toBe('Chantale');
  });

  it('queues production PDFs with the existing internal-secret contract', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 202 });

    await expect(queueProductionPdfs('internal-1')).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/.netlify/functions/generate-paid-order-pdfs-background',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Internal-Job-Secret': 'test-secret',
        }),
        body: JSON.stringify({ orderId: 'internal-1' }),
      }),
    );
  });

  it('does not throw or change payment success when PDF queueing fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(queueProductionPdfs('internal-2')).resolves.toBe(false);
  });

  it('keeps the successful capture response contract and additive safety fields', () => {
    const response = buildSuccessPayload({
      orderID: 'PAYPAL-ORDER',
      internalOrderId: 'INTERNAL-ORDER',
      validation: {
        captureId: 'CAPTURE-1',
        orderStatus: 'COMPLETED',
        captureStatus: 'COMPLETED',
        amountCents: 8000,
        currency: 'USD',
      },
      environment: 'sandbox',
      paypalData: { status: 'COMPLETED' },
      shippingAddress: {
        name: 'Chantale Riolo',
        street: '123 Main Street',
        city: 'Buffalo',
        state: 'NY',
        zip: '14201',
        country: 'US',
      },
      persistedOrder: {
        email: 'chantale@example.com',
        customer_name: 'Chantale Riolo',
        shipping_street: '123 Main Street',
        shipping_city: 'Buffalo',
        shipping_state: 'NY',
        shipping_zip: '14201',
      },
    });

    expect(response).toMatchObject({
      success: true,
      paymentCaptured: true,
      reconciliationRequired: false,
      paypalOrderID: 'PAYPAL-ORDER',
      orderID: 'PAYPAL-ORDER',
      captureID: 'CAPTURE-1',
      status: 'COMPLETED',
      captureStatus: 'COMPLETED',
      capturedAmountCents: 8000,
      capturedCurrency: 'USD',
      environment: 'sandbox',
      internalOrderId: 'INTERNAL-ORDER',
    });
  });

  it('returns a do-not-retry reconciliation contract after a verified completed capture', () => {
    const validation = validateCompletedCapture({
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: 'CAPTURE-2',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '42.40' },
          }],
        },
      }],
    }, 4240);

    expect(validation.ok).toBe(true);
    expect(buildReconciliationPayload({
      orderID: 'PAYPAL-2',
      internalOrderId: 'INTERNAL-2',
      validation,
      environment: 'live',
      paypalData: { status: 'COMPLETED' },
      shippingAddress: null,
    })).toMatchObject({
      success: true,
      paymentCaptured: true,
      reconciliationRequired: true,
      captureID: 'CAPTURE-2',
      status: 'COMPLETED',
      captureStatus: 'COMPLETED',
    });
  });

  it('keeps stale-link rejection and paid finalization before production queueing', async () => {
    const source = await readFile(
      new URL('../_shared/legacy/paypal-capture-minimal.cjs', import.meta.url),
      'utf8',
    );

    const staleCheck = source.indexOf("if (order.paypal_order_id !== orderID)");
    const oauth = source.indexOf('getPayPalAccessToken(paypalConfig)');
    const paidUpdate = source.indexOf("UPDATE orders SET\n        status = 'paid'");
    const productionQueue = source.indexOf('await queueProductionPdfs(internalOrderId)', paidUpdate);

    expect(staleCheck).toBeGreaterThan(-1);
    expect(oauth).toBeGreaterThan(staleCheck);
    expect(paidUpdate).toBeGreaterThan(-1);
    expect(productionQueue).toBeGreaterThan(paidUpdate);
  });
});
