import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-minimal.cjs';

const clean = (value, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const normalizeEmail = (value) => {
  const email = clean(value, 320)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^guest-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  return email;
};

const extractPayPalCustomerEmail = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    const candidates = [
      source.payer?.email_address,
      source.payment_source?.paypal?.email_address,
      source.payment_source?.card?.attributes?.customer?.email_address,
      source.payment_source?.card?.email_address,
      source.payment_source?.apple_pay?.email_address,
      source.payment_source?.google_pay?.email_address,
      source.shipping?.email_address,
      ...(Array.isArray(source.purchase_units)
        ? source.purchase_units.map((unit) => unit?.shipping?.email_address)
        : []),
    ];

    for (const candidate of candidates) {
      const normalized = normalizeEmail(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
};

const normalizeCustomerInfo = (input) => {
  const raw = input && typeof input === 'object' ? input : {};
  const fullName = clean(raw.fullName || raw.name, 200);
  return {
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    // Kept for backward compatibility with checkout sessions created before the
    // single-email-entry fix. New card checkouts supply the email through PayPal.
    email: normalizeEmail(raw.email),
    address1: clean(raw.address1 || raw.street || raw.line1, 300),
    address2: clean(raw.address2 || raw.street2 || raw.line2, 300),
    city: clean(raw.city, 160),
    state: clean(raw.state, 80)?.toUpperCase() || null,
    postalCode: clean(raw.postalCode || raw.zip, 40),
    country: clean(raw.country, 8)?.toUpperCase() || 'US',
  };
};

const handler = async (event, context) => {
  const response = await legacyModule.handler(event, context);

  if (Number(response?.statusCode || 500) < 200 || Number(response?.statusCode || 500) >= 300) {
    return response;
  }

  try {
    const requestBody = JSON.parse(event.body || '{}');
    const responseBody = JSON.parse(response.body || '{}');
    const internalOrderId = clean(requestBody.internalOrderId, 100);
    const customer = normalizeCustomerInfo(requestBody.customerInfo);
    const paypalEmail = extractPayPalCustomerEmail(responseBody.paypalData, responseBody);
    const resolvedEmail = customer.email || paypalEmail;
    const completeShippingInfo = Boolean(
      internalOrderId
      && customer.fullName
      && customer.address1
      && customer.city
      && customer.state
      && customer.postalCode,
    );

    if (!completeShippingInfo) {
      console.warn('[paypal-capture-minimal] completed capture without complete submitted shipping info', {
        internalOrderId,
        hasName: Boolean(customer.fullName),
        hasAddress: Boolean(customer.address1 && customer.city && customer.state && customer.postalCode),
        hasPayPalEmail: Boolean(paypalEmail),
      });
      return response;
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('Database URL not configured');
    const sql = neon(dbUrl);

    const updated = await sql`
      UPDATE orders
      SET email = CASE WHEN ${resolvedEmail} IS NOT NULL THEN ${resolvedEmail} ELSE email END,
          customer_name = ${customer.fullName},
          customer_first_name = ${customer.firstName},
          shipping_name = ${customer.fullName},
          shipping_street = ${customer.address1},
          shipping_street2 = ${customer.address2},
          shipping_city = ${customer.city},
          shipping_state = ${customer.state},
          shipping_zip = ${customer.postalCode},
          shipping_country = ${customer.country},
          updated_at = NOW()
      WHERE id = ${internalOrderId}
      RETURNING id, email
    `;

    if (!updated.length) {
      console.error('[paypal-capture-minimal] payment captured but customer info update found no order', { internalOrderId });
      return response;
    }

    const persistedEmail = normalizeEmail(updated[0].email);
    if (!persistedEmail) {
      console.error('[paypal-capture-minimal] payment captured without a usable customer email', {
        internalOrderId,
        paypalEmailFound: Boolean(paypalEmail),
      });
    }

    response.body = JSON.stringify({
      ...responseBody,
      customerInfoPersisted: true,
      customerEmailPersisted: Boolean(persistedEmail),
    });
  } catch (error) {
    // Payment capture is already durable. Never turn a completed charge into a
    // customer-facing payment failure because metadata persistence had trouble.
    console.error('[paypal-capture-minimal] post-capture customer info persistence failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

export const _test = { normalizeEmail, extractPayPalCustomerEmail, normalizeCustomerInfo };
export default withLambda(handler);
