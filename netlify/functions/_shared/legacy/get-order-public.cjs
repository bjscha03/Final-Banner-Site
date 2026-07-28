const { neon } = require('@neondatabase/serverless');
const { normalizeTrackingEntries } = require('./tracking-helpers.cjs');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = new Set(['paid', 'in_production', 'shipped', 'refunded']);

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store, max-age=0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const orderId = String(event.queryStringParameters?.id || '').trim();
  if (!UUID_RE.test(orderId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'A valid order ID is required' }) };
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Database not configured' }) };
    }

    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT id, order_number, email, customer_name, customer_first_name,
             subtotal_cents, tax_cents, total_cents, status,
             tracking_number, tracking_numbers,
             shipping_name, shipping_street, shipping_street2,
             shipping_city, shipping_state, shipping_zip, shipping_country,
             applied_discount_cents, applied_discount_label, applied_discount_type,
             same_day_hit_service, saturday_delivery,
             same_day_fee_cents, saturday_fee_cents,
             created_at
        FROM orders
       WHERE id = ${orderId}
       LIMIT 1
    `;

    if (!rows.length || !PUBLIC_STATUSES.has(String(rows[0].status || '').toLowerCase())) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    const items = await sql`
      SELECT width_in, height_in, quantity, material, grommets,
             rope_feet, rope_placement, pole_pockets, pole_pocket_position,
             pole_pocket_size, pole_pocket_cost_cents, rounded_corners,
             line_total_cents, product_type, thumbnail_url,
             yard_sign_sidedness, yard_sign_step_stakes_qty,
             yard_sign_design_count, yard_sign_stakes_subtotal_cents,
             design_service_enabled
        FROM order_items
       WHERE order_id = ${orderId}
       ORDER BY created_at
    `;

    const order = rows[0];
    const trackingNumbers = normalizeTrackingEntries(order);
    const shippingAddress = normalizeShippingAddress(order);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: {
          ...order,
          tracking_numbers: trackingNumbers,
          trackingNumbers,
          tracking_carrier: trackingNumbers.length ? 'fedex' : null,
          shippingAddress,
          items,
        },
      }),
    };
  } catch (error) {
    console.error('[get-order-public] failed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'Failed to load order details' }),
    };
  }
};
