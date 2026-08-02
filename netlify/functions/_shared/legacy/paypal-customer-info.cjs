'use strict';

const { neon } = require('@neondatabase/serverless');

function clean(value, max = 500) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function normalizeEmail(value) {
  const email = clean(value, 320)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/^(guest|preview)-[^@]+@bannersonthefly\.com$/i.test(email)) return null;
  if (email === 'guest@example.com') return null;
  return email;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return null;
}

function joinName(value) {
  if (!value || typeof value !== 'object') return null;
  return firstNonEmpty(
    value.full_name,
    [value.given_name, value.surname].filter(Boolean).join(' '),
  );
}

function normalizeSubmitted(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const fullName = firstNonEmpty(raw.fullName, raw.name);
  return {
    email: normalizeEmail(raw.email),
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    phone: firstNonEmpty(raw.phone, raw.phoneNumber),
    street: firstNonEmpty(raw.address1, raw.street, raw.line1),
    street2: firstNonEmpty(raw.address2, raw.street2, raw.line2),
    city: firstNonEmpty(raw.city),
    state: firstNonEmpty(raw.state, raw.region)?.toUpperCase() || null,
    zip: firstNonEmpty(raw.postalCode, raw.zip),
    country: firstNonEmpty(raw.country, raw.countryCode)?.toUpperCase() || null,
  };
}

function extractCustomerInfo(paypalData) {
  if (!paypalData || typeof paypalData !== 'object') return {};

  const source = paypalData.payment_source || {};
  const unit = Array.isArray(paypalData.purchase_units)
    ? paypalData.purchase_units.find((candidate) => candidate?.shipping) || paypalData.purchase_units[0]
    : null;
  const shipping = unit?.shipping || null;
  const payer = paypalData.payer || null;
  const card = source.card || null;
  const paypal = source.paypal || null;
  const applePay = source.apple_pay || null;
  const googlePay = source.google_pay || null;

  const address = shipping?.address
    || payer?.address
    || card?.billing_address
    || applePay?.card?.billing_address
    || googlePay?.card?.billing_address
    || {};

  const fullName = firstNonEmpty(
    joinName(shipping?.name),
    joinName(paypal?.name),
    card?.name,
    joinName(card?.attributes?.customer?.name),
    joinName(payer?.name),
    applePay?.name,
    googlePay?.name,
  );

  const emails = [
    payer?.email_address,
    paypal?.email_address,
    card?.attributes?.customer?.email_address,
    card?.email_address,
    applePay?.email_address,
    googlePay?.email_address,
    shipping?.email_address,
  ];
  let email = null;
  for (const candidate of emails) {
    email = normalizeEmail(candidate);
    if (email) break;
  }

  return {
    email,
    fullName,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    phone: firstNonEmpty(
      payer?.phone?.phone_number?.national_number,
      paypal?.phone?.phone_number?.national_number,
      card?.attributes?.customer?.phone?.phone_number?.national_number,
    ),
    street: firstNonEmpty(address.address_line_1, address.line1, address.street),
    street2: firstNonEmpty(address.address_line_2, address.line2, address.street2),
    city: firstNonEmpty(address.admin_area_2, address.city),
    state: firstNonEmpty(address.admin_area_1, address.state, address.region),
    zip: firstNonEmpty(address.postal_code, address.zip),
    country: firstNonEmpty(address.country_code, address.country),
  };
}

function mergeCustomerInfo(...sources) {
  const result = {
    email: null,
    fullName: null,
    firstName: null,
    phone: null,
    street: null,
    street2: null,
    city: null,
    state: null,
    zip: null,
    country: null,
  };

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of Object.keys(result)) {
      if (!result[key] && source[key]) result[key] = source[key];
    }
  }

  if (!result.firstName && result.fullName) result.firstName = result.fullName.split(/\s+/)[0] || null;
  if (result.state) result.state = String(result.state).toUpperCase();
  if (result.country) result.country = String(result.country).toUpperCase();
  return result;
}

function getConfig() {
  const environment = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  const suffix = environment.toUpperCase();
  const pick = (...names) => names.map((name) => process.env[name]).find((value) => String(value || '').trim())?.trim();
  const clientId = pick(`PAYPAL_CLIENT_ID_${suffix}`, `PAYPAL_${suffix}_CLIENT_ID`, 'PAYPAL_CLIENT_ID', 'VITE_PAYPAL_CLIENT_ID');
  const secret = pick(`PAYPAL_SECRET_${suffix}`, `PAYPAL_CLIENT_SECRET_${suffix}`, `PAYPAL_${suffix}_SECRET`, `PAYPAL_${suffix}_CLIENT_SECRET`, 'PAYPAL_SECRET', 'PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) throw new Error('PAYPAL_NOT_CONFIGURED');
  return {
    environment,
    clientId,
    secret,
    baseUrl: environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

async function getAccessToken(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PAYPAL_AUTH_FAILED_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error('PAYPAL_AUTH_TOKEN_MISSING');
  return payload.access_token;
}

async function retrieveOrder(orderID) {
  const config = getConfig();
  const accessToken = await getAccessToken(config);
  const response = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderID)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`PAYPAL_ORDER_RETRIEVE_FAILED_${response.status}`);
  return data;
}

async function refreshOrderCustomerInfo({
  internalOrderId,
  orderID,
  submitted,
  approvedOrderData,
  shippingChangeData,
}) {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!internalOrderId || !orderID) throw new Error('ORDER_IDENTIFIERS_REQUIRED');

  let providerOrder = null;
  try {
    providerOrder = await retrieveOrder(orderID);
  } catch (error) {
    console.error('[paypal-customer-info] post-capture PayPal GET failed', {
      internalOrderId,
      orderID,
      error: error?.message,
    });
  }

  const shippingFallback = shippingChangeData && typeof shippingChangeData === 'object'
    ? {
        purchase_units: [{
          shipping: {
            name: shippingChangeData.name || shippingChangeData.shipping_name || null,
            address: shippingChangeData.shipping_address || shippingChangeData.address || shippingChangeData,
          },
        }],
      }
    : null;

  const customer = mergeCustomerInfo(
    normalizeSubmitted(submitted),
    extractCustomerInfo(approvedOrderData),
    extractCustomerInfo(providerOrder),
    extractCustomerInfo(shippingFallback),
  );

  const hasCustomerData = Boolean(
    customer.email
    || customer.fullName
    || customer.street
    || customer.city
    || customer.state
    || customer.zip,
  );

  if (!hasCustomerData) {
    console.warn('[paypal-customer-info] PayPal returned no usable customer details', {
      internalOrderId,
      orderID,
    });
    return null;
  }

  const sql = neon(dbUrl);
  const rows = await sql`
    UPDATE orders
       SET email = CASE
             WHEN ${customer.email || null} IS NOT NULL THEN ${customer.email || null}
             ELSE email
           END,
           customer_name = COALESCE(${customer.fullName || null}, customer_name, shipping_name),
           customer_first_name = COALESCE(${customer.firstName || null}, customer_first_name),
           customer_phone = COALESCE(${customer.phone || null}, customer_phone),
           shipping_name = COALESCE(${customer.fullName || null}, shipping_name, customer_name),
           shipping_street = COALESCE(${customer.street || null}, shipping_street),
           shipping_street2 = COALESCE(${customer.street2 || null}, shipping_street2),
           shipping_city = COALESCE(${customer.city || null}, shipping_city),
           shipping_state = COALESCE(${customer.state || null}, shipping_state),
           shipping_zip = COALESCE(${customer.zip || null}, shipping_zip),
           shipping_country = COALESCE(${customer.country || null}, shipping_country, 'US'),
           updated_at = NOW()
     WHERE id = ${internalOrderId}
       AND paypal_order_id = ${orderID}
    RETURNING id, email, customer_name, customer_first_name, customer_phone,
              shipping_name, shipping_street, shipping_street2, shipping_city,
              shipping_state, shipping_zip, shipping_country
  `;

  return rows[0] || null;
}

async function retireDefinitivelyDeclinedPayPalOrder({ internalOrderId, orderID }) {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl || !internalOrderId || !orderID) return false;
  const sql = neon(dbUrl);
  const rows = await sql`
    UPDATE orders
       SET paypal_order_id = NULL,
           payment_reconciliation_status = 'not_required',
           updated_at = NOW()
     WHERE id = ${internalOrderId}
       AND status = 'pending'
       AND paypal_order_id = ${orderID}
       AND paypal_capture_id IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

module.exports = {
  normalizeEmail,
  normalizeSubmitted,
  extractCustomerInfo,
  mergeCustomerInfo,
  retrieveOrder,
  refreshOrderCustomerInfo,
  retireDefinitivelyDeclinedPayPalOrder,
};
