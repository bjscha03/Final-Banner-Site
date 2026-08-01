import '@neondatabase/serverless';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import captureModule from './_shared/legacy/paypal-capture-forward.cjs';

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

const getSiteUrl = (event) => {
  const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  return host ? `https://${host}` : null;
};

const queuePaidOrderFollowups = async (event, orderId) => {
  const siteUrl = getSiteUrl(event);
  if (!siteUrl || !orderId) return false;

  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const requestHeaders = { 'Content-Type': 'application/json' };
  if (internalSecret) requestHeaders['X-Internal-Job-Secret'] = internalSecret;

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/process-paid-order-followups-background`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ orderId }),
    });
    if (!response.ok) {
      console.error('[paypal-capture-minimal] follow-up queue rejected', {
        orderId,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-capture-minimal] follow-up queue failed', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const handler = async (event, context) => {
  const response = await captureModule.handler(event, context);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300) return response;

  let responseBody = {};
  try {
    responseBody = JSON.parse(response.body || '{}');
  } catch {
    return response;
  }

  const definitivePaidState = Boolean(
    statusCode === 200
    && responseBody.paymentCaptured === true
    && responseBody.captureStatus === 'COMPLETED'
    && responseBody.captureID
    && responseBody.reconciliationRequired !== true
    && responseBody.paymentStatusUnknown !== true,
  );
  if (!definitivePaidState) return response;

  let requestBody = {};
  try { requestBody = JSON.parse(event.body || '{}'); } catch { /* no-op */ }

  const internalOrderId = clean(requestBody.internalOrderId, 100)
    || clean(responseBody.internalOrderId, 100);
  if (!internalOrderId) return response;

  let customerInfoPersisted = Boolean(responseBody.customerInfoPersisted);
  try {
    const customer = normalizeCustomerInfo(requestBody.customerInfo);
    const complete = Boolean(
      customer.fullName
      && customer.email
      && customer.address1
      && customer.city
      && customer.state
      && customer.postalCode,
    );

    if (complete) {
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
      customerInfoPersisted = updated.length > 0;
    }
  } catch (error) {
    // Payment is already durable. Contact-data trouble must never turn a
    // completed capture into a customer-facing failure or another charge.
    console.error('[paypal-capture-minimal] post-capture customer update failed', {
      internalOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const followupsQueued = await queuePaidOrderFollowups(event, internalOrderId);
  response.body = JSON.stringify({
    ...responseBody,
    customerInfoPersisted,
    followupsQueued,
  });
  return response;
};

export const _test = { normalizeCustomerInfo, getSiteUrl, queuePaidOrderFollowups };
export default withLambda(handler);
