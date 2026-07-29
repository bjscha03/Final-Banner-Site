const { neon } = require('@neondatabase/serverless');
const { validateTrackingEntries, normalizeTrackingEntries } = require('./tracking-helpers.cjs');
const { requireAdmin } = require('../server-auth.cjs');

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

function getNextTrackingStatus(existing, nextTrackingEntries) {
  const currentStatus = String(existing?.status || 'pending');
  const shippingWasSent = Boolean(
    existing?.shipping_notification_sent
    || existing?.shipping_notification_status === 'sent',
  );

  // Tracking data can be saved before the shipment is sent. A successful
  // tracking email is the operation that moves an order to Shipped.
  if (currentStatus === 'shipped' && !shippingWasSent) {
    return existing?.production_email_sent || existing?.production_email_status === 'sent'
      ? 'in_production'
      : 'paid';
  }

  // Deleting the final tracking number from a shipped order restores the prior
  // operational state instead of leaving an order marked Shipped with no label.
  if (currentStatus === 'shipped' && nextTrackingEntries.length === 0) {
    return existing?.production_email_sent || existing?.production_email_status === 'sent'
      ? 'in_production'
      : 'paid';
  }

  return currentStatus;
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database configuration missing' }),
      };
    }

    const sql = neon(dbUrl);
    const { id, carrier, number, trackingNumbers } = JSON.parse(event.body || '{}');
    if (!id || typeof id !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order ID is required' }) };
    }

    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS tracking_numbers JSONB,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS shipping_notification_status TEXT DEFAULT 'pending'
    `;

    let normalized;
    try {
      normalized = validateTrackingEntries(
        Array.isArray(trackingNumbers)
          ? trackingNumbers
          : [{ carrier: carrier || 'fedex', trackingNumber: number }],
      );
    } catch (validationError) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: validationError.message }) };
    }

    const existingRows = await sql`
      SELECT id, status, tracking_number, tracking_numbers,
             production_email_sent, production_email_status,
             shipping_notification_sent, shipping_notification_status
      FROM orders
      WHERE id = ${id}
      LIMIT 1
    `;
    if (!existingRows.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    const existing = existingRows[0];
    const previousTracking = normalizeTrackingEntries(existing);
    const previousJson = JSON.stringify(previousTracking);
    const nextJson = JSON.stringify(normalized);
    const trackingChanged = previousJson !== nextJson;
    const primaryTrackingNumber = normalized[0]?.trackingNumber || null;
    const trackingJson = JSON.stringify(normalized);
    const nextStatus = getNextTrackingStatus(existing, normalized);

    const result = await sql`
      UPDATE orders
      SET tracking_number = ${primaryTrackingNumber},
          tracking_numbers = ${trackingJson}::jsonb,
          status = ${nextStatus},
          shipping_notification_sent = CASE WHEN ${trackingChanged} THEN FALSE ELSE shipping_notification_sent END,
          shipping_notification_sent_at = CASE WHEN ${trackingChanged} THEN NULL ELSE shipping_notification_sent_at END,
          shipping_notification_status = CASE WHEN ${trackingChanged} THEN 'pending' ELSE COALESCE(shipping_notification_status, 'pending') END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    console.log('[update-tracking] saved', {
      orderId: id,
      trackingCount: normalized.length,
      trackingChanged,
      previousStatus: existing.status,
      nextStatus,
      shippingWasSent: Boolean(existing.shipping_notification_sent || existing.shipping_notification_status === 'sent'),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        trackingDeleted: normalized.length === 0,
        trackingChanged,
        order: result[0],
      }),
    };
  } catch (error) {
    console.error('[update-tracking] failed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error?.message || 'Internal server error' }),
    };
  }
};

exports._test = { getNextTrackingStatus };
