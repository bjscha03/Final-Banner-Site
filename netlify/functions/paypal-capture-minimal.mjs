import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-minimal.cjs';

const clean = (value, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const normalizeCustomerInfo = (input) => {
  const raw = input && typeof input === 'object' ? input : {};
  const email = clean(raw.email, 320)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid checkout customer email');
  }

  const fullName = clean(raw.fullName || raw.name, 200);
  return {
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    email,
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
    const body = JSON.parse(event.body || '{}');
    const internalOrderId = clean(body.internalOrderId, 100);
    const customer = normalizeCustomerInfo(body.customerInfo);
    const complete = Boolean(
      internalOrderId
      && customer.fullName
      && customer.email
      && customer.address1
      && customer.city
      && customer.state
      && customer.postalCode,
    );

    if (!complete) {
      console.warn('[paypal-capture-minimal] completed capture without complete submitted customer info', {
        internalOrderId,
        hasName: Boolean(customer.fullName),
        hasEmail: Boolean(customer.email),
        hasAddress: Boolean(customer.address1 && customer.city && customer.state && customer.postalCode),
      });
      return response;
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('Database URL not configured');
    const sql = neon(dbUrl);

    const updated = await sql`
      UPDATE orders
      SET email = ${customer.email},
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
      RETURNING id
    `;

    if (!updated.length) {
      console.error('[paypal-capture-minimal] payment captured but customer info update found no order', { internalOrderId });
      return response;
    }

    const parsed = JSON.parse(response.body || '{}');
    response.body = JSON.stringify({ ...parsed, customerInfoPersisted: true });
  } catch (error) {
    // Payment capture is already durable. Never turn a completed charge into a
    // customer-facing payment failure because metadata persistence had trouble.
    console.error('[paypal-capture-minimal] post-capture customer info persistence failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

export default withLambda(handler);
