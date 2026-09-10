const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../server-auth.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const clean = (value, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const orderId = clean(payload.orderId, 100);
    const email = clean(payload.email, 320)?.toLowerCase() || null;
    const customerName = clean(payload.customerName || payload.fullName, 200);
    const shippingName = clean(payload.shippingName || customerName, 200);
    const shippingStreet = clean(payload.shippingStreet || payload.address1, 300);
    const shippingStreet2 = clean(payload.shippingStreet2 || payload.address2, 300);
    const shippingCity = clean(payload.shippingCity || payload.city, 160);
    const shippingState = clean(payload.shippingState || payload.state, 80)?.toUpperCase() || null;
    const shippingZip = clean(payload.shippingZip || payload.postalCode || payload.zip, 40);
    const shippingCountry = clean(payload.shippingCountry || payload.country, 8)?.toUpperCase() || 'US';

    if (!orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order ID is required' }) };
    }
    if (!customerName || !email || !validEmail(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'A valid customer name and email are required' }) };
    }
    if (!shippingStreet || !shippingCity || !shippingState || !shippingZip) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Complete shipping address is required' }) };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database not configured' }) };
    }

    const sql = neon(dbUrl);
    const normalizedOrderId = orderId.trim();
    const upperOrderId = normalizedOrderId.toUpperCase().replace(/^#/, '');
    const firstName = customerName.split(/\s+/)[0] || null;

    const updated = await sql`
      UPDATE orders
      SET email = ${email},
          customer_name = ${customerName},
          customer_first_name = ${firstName},
          shipping_name = ${shippingName || customerName},
          shipping_street = ${shippingStreet},
          shipping_street2 = ${shippingStreet2},
          shipping_city = ${shippingCity},
          shipping_state = ${shippingState},
          shipping_zip = ${shippingZip},
          shipping_country = ${shippingCountry},
          confirmation_email_status = 'pending',
          confirmation_emailed_at = NULL,
          admin_notification_status = 'pending',
          admin_notification_sent_at = NULL,
          updated_at = NOW()
      WHERE id::text = ${normalizedOrderId}
         OR UPPER(RIGHT(id::text, 8)) = ${upperOrderId}
         OR UPPER(order_number::text) = ${upperOrderId}
      RETURNING id, email, customer_name, customer_first_name,
                shipping_name, shipping_street, shipping_street2,
                shipping_city, shipping_state, shipping_zip, shipping_country,
                confirmation_email_status, admin_notification_status
    `;

    if (!updated.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, order: updated[0] }),
    };
  } catch (error) {
    console.error('[admin-update-order-customer] failed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error?.message || 'Failed to update customer information' }),
    };
  }
};
