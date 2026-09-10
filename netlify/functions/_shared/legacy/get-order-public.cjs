const { neon } = require('@neondatabase/serverless');
const { normalizeTrackingEntries } = require('./tracking-helpers.cjs');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');
const { normalizeCartItemPlacement } = require('../preview-artifact.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = new Set(['paid', 'in_production', 'shipped', 'refunded']);

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store, max-age=0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function publicOrderShape(order, items) {
  const trackingNumbers = normalizeTrackingEntries(order);
  const shippingAddress = normalizeShippingAddress(order);
  return {
    id: order.id,
    order_number: order.order_number || null,
    email: order.email || '',
    customer_name: order.customer_name || null,
    customer_first_name: order.customer_first_name || null,
    subtotal_cents: Number(order.subtotal_cents || 0),
    tax_cents: Number(order.tax_cents || 0),
    total_cents: Number(order.total_cents || 0),
    status: order.status,
    tracking_number: trackingNumbers[0]?.trackingNumber || null,
    tracking_numbers: trackingNumbers,
    trackingNumbers,
    tracking_carrier: trackingNumbers.length ? 'fedex' : null,
    shipping_name: order.shipping_name || null,
    shipping_street: order.shipping_street || null,
    shipping_street2: order.shipping_street2 || null,
    shipping_city: order.shipping_city || null,
    shipping_state: order.shipping_state || null,
    shipping_zip: order.shipping_zip || null,
    shipping_country: order.shipping_country || null,
    shippingAddress,
    applied_discount_cents: Number(order.applied_discount_cents || 0),
    applied_discount_label: order.applied_discount_label || '',
    applied_discount_type: order.applied_discount_type || '',
    same_day_hit_service: Boolean(order.same_day_hit_service),
    saturday_delivery: Boolean(order.saturday_delivery),
    same_day_fee_cents: Number(order.same_day_fee_cents || 0),
    saturday_fee_cents: Number(order.saturday_fee_cents || 0),
    is_test_order: Boolean(order.is_test_order),
    created_at: order.created_at,
    items: items.map((rawItem) => {
      let item;
      try {
        item = normalizeCartItemPlacement(rawItem);
      } catch (error) {
        console.error('[get-order-public] suppressing invalid canonical preview', {
          itemId: rawItem.id,
          code: error.code || 'INVALID_PLACEMENT_PREVIEW',
          message: error.message,
        });
        item = {
          ...rawItem,
          thumbnail_url: null,
          final_render_url: null,
          web_preview_url: null,
          placement_preview: null,
        };
      }
      return ({
      width_in: Number(item.width_in || 0),
      height_in: Number(item.height_in || 0),
      quantity: Number(item.quantity || 0),
      material: item.material || '',
      grommets: item.grommets || 'none',
      rope_feet: Number(item.rope_feet || 0),
      rope_placement: item.rope_placement || null,
      pole_pockets: item.pole_pockets || 'none',
      pole_pocket_position: item.pole_pocket_position || null,
      pole_pocket_size: item.pole_pocket_size || null,
      pole_pocket_cost_cents: Number(item.pole_pocket_cost_cents || 0),
      rounded_corners: item.rounded_corners || null,
      line_total_cents: Number(item.line_total_cents || 0),
      product_type: item.product_type || 'banner',
      thumbnail_url: item.thumbnail_url || null,
      final_render_url: item.final_render_url || null,
      web_preview_url: item.web_preview_url || null,
      placement_preview: item.placement_preview || null,
      yard_sign_sidedness: item.yard_sign_sidedness || null,
      yard_sign_step_stakes_qty: Number(item.yard_sign_step_stakes_qty || 0),
      yard_sign_design_count: Number(item.yard_sign_design_count || 0),
      yard_sign_stakes_subtotal_cents: Number(item.yard_sign_stakes_subtotal_cents || 0),
      design_service_enabled: Boolean(item.design_service_enabled),
      });
    }),
  };
}

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
    // SELECT * avoids making the customer email link depend on every optional
    // migration having already run. The response is explicitly allow-listed in
    // publicOrderShape, so internal payment/file/admin fields are never exposed.
    const rows = await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`;

    if (!rows.length || !PUBLIC_STATUSES.has(String(rows[0].status || '').toLowerCase())) {
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Order not found' }) };
    }

    const items = await sql`
      SELECT *
        FROM order_items
       WHERE order_id = ${orderId}
       ORDER BY created_at
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: publicOrderShape(rows[0], items),
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

exports._test = { UUID_RE, PUBLIC_STATUSES, publicOrderShape };
