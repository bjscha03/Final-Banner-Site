const { neon } = require('@neondatabase/serverless');
const { validateTrackingEntries } = require('./tracking-helpers.cjs');
const { requireAdmin } = require('../server-auth.cjs');

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
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
    const { id, carrier, number, trackingNumbers, isUpdate = false } = JSON.parse(event.body || '{}');

    if (!id || typeof id !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Order ID is required' }) };
    }

    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS tracking_numbers JSONB,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS shipping_notification_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS production_email_sent BOOLEAN DEFAULT FALSE
    `;

    let normalized;
    try {
      const submitted = Array.isArray(trackingNumbers)
        ? trackingNumbers
        : [{ carrier: carrier || 'fedex', trackingNumber: number }];
      normalized = validateTrackingEntries(submitted);
    } catch (validationError) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: validationError.message }) };
    }

    const primaryTrackingNumber = normalized[0]?.trackingNumber || null;
    const trackingJson = JSON.stringify(normalized);
    const hasTracking = normalized.length > 0;

    // Any tracking edit invalidates the prior tracking email because its package
    // list may no longer match what the customer was sent. The Admin button then
    // returns to "Send Tracking Email" until the corrected list is sent.
    const result = !isUpdate && hasTracking
      ? await sql`
          UPDATE orders
          SET tracking_number = ${primaryTrackingNumber},
              tracking_numbers = ${trackingJson}::jsonb,
              status = 'shipped',
              shipping_notification_sent = FALSE,
              shipping_notification_sent_at = NULL,
              shipping_notification_status = 'pending',
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `
      : await sql`
          UPDATE orders
          SET tracking_number = ${primaryTrackingNumber},
              tracking_numbers = ${trackingJson}::jsonb,
              status = CASE
                WHEN ${hasTracking} = FALSE AND status = 'shipped'
                  THEN CASE WHEN COALESCE(production_email_sent, FALSE) THEN 'in_production' ELSE 'paid' END
                ELSE status
              END,
              shipping_notification_sent = FALSE,
              shipping_notification_sent_at = NULL,
              shipping_notification_status = 'pending',
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;

    if (result.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    console.log('[update-tracking] saved', {
      orderId: id,
      trackingNumbers: normalized.map((entry) => entry.trackingNumber),
      status: result[0].status,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: result[0],
        trackingNumbers: normalized,
        status: result[0].status,
        shippingNotificationSent: false,
        shippingNotificationStatus: 'pending',
      }),
    };
  } catch (error) {
    console.error('Update tracking failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'Internal server error', details: error.message }),
    };
  }
};
