const { neon } = require('@neondatabase/serverless');
const { normalizeTrackingEntries } = require('./tracking-helpers.cjs');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');
const { getSession, unauthorized } = require('../server-auth.cjs');
const {
  confirmationMatchesPaidOrder,
  readOrderConfirmationToken,
  readOrderViewToken,
  verifyGuestOrderViewToken,
  verifyOrderConfirmationToken,
} = require('../order-confirmation-token.cjs');

let neonFactory = neon;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Order-Confirmation-Token, X-Order-View-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store, max-age=0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  const orderId = String(event.queryStringParameters?.id || '').trim();
  if (!orderId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Order ID is required' })
    };
  }

  const session = getSession(event);
  const rawConfirmationToken = readOrderConfirmationToken(event);
  const rawOrderViewToken = readOrderViewToken(event);
  if (!session && !rawConfirmationToken && !rawOrderViewToken) return unauthorized();

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const sql = neonFactory(dbUrl);

    // READ-ONLY SCHEMA COMPATIBILITY: introspect existing columns up front so
    // historical databases with an older additive schema still return NULL
    // for unavailable fields. Detail reads must never run migrations: schema
    // changes belong to the migration runner, not a latency-sensitive GET.
    // Use 'orders'::regclass / 'order_items'::regclass (resolved via
    // search_path) so this works regardless of the connection's current_schema().
    let existingOrderCols = new Set();
    let existingItemCols = new Set();
    try {
      const [oCols, iCols] = await Promise.all([
        sql(`SELECT a.attname AS column_name
               FROM pg_attribute a
              WHERE a.attrelid = 'orders'::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped`),
        sql(`SELECT a.attname AS column_name
               FROM pg_attribute a
              WHERE a.attrelid = 'order_items'::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped`),
      ]);
      existingOrderCols = new Set(oCols.map(r => r.column_name));
      existingItemCols = new Set(iCols.map(r => r.column_name));
    } catch (introspectErr) {
      console.warn('[get-order] Column introspection failed (non-fatal):', introspectErr.message);
    }

    const safeOrderCol = (col) => existingOrderCols.size === 0 || existingOrderCols.has(col)
      ? col
      : `NULL AS ${col}`;

    const orderSelectCols = [
      'id',
      'order_number',
      'user_id',
      'email',
      'customer_name',
      'customer_first_name',
      'subtotal_cents',
      'tax_cents',
      'total_cents',
      'status',
      'tracking_number',
      'tracking_numbers',
      'shipping_name',
      'shipping_street',
      'shipping_street2',
      'shipping_city',
      'shipping_state',
      'shipping_zip',
      'shipping_country',
      'shipping_address',
      'discount_code',
      'applied_discount_cents',
      'applied_discount_label',
      'applied_discount_type',
      'same_day_hit_service',
      'saturday_delivery',
      'same_day_fee_cents',
      'saturday_fee_cents',
      'shipping_cents',
      'payment_method',
      'payment_reconciliation_status',
      'paypal_order_id',
      'paypal_capture_id',
      // These fields are used only to verify a signed guest view credential
      // and are removed before the response is serialized.
      'stripe_payment_intent_id',
      'stripe_charge_id',
      'stripe_wallet_type',
      'checkout_idempotency_key',
      'is_test_order',
      'test_order_reason',
      'created_at',
      'updated_at',
    ].map(safeOrderCol).join(', ');

    // Get order details
    const orderResult = await sql(
      `SELECT ${orderSelectCols} FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderResult[0];
    const confirmation = verifyOrderConfirmationToken(
      rawConfirmationToken,
      {
        orderId,
        paypalOrderId: order.paypal_order_id,
        captureId: order.paypal_capture_id,
      },
      { order },
    );
    const orderView = verifyGuestOrderViewToken(rawOrderViewToken, order);
    const confirmationAuthorized = confirmationMatchesPaidOrder(confirmation, order);
    const orderViewAuthorized = Boolean(orderView);
    const sessionAuthorized = Boolean(session && (session.admin || session.sub === order.user_id));
    if (!confirmationAuthorized && !orderViewAuthorized && !sessionAuthorized) {
      return unauthorized('Order ownership could not be verified');
    }

    // Get order items - same bulletproof approach.
    // Pairs: [columnName, optionalAlias, optionalSqlExpr]
    // When sqlExpr is given, the column existence check uses columnName but
    // the SQL emitted is the expression (with the alias preserved).
    const itemFields = [
      ['id'],
      ['id', 'item_id'],
      ['width_in'],
      ['height_in'],
      ['quantity'],
      ['material'],
      ['grommets'],
      ['rounded_corners'],
      ['rope_feet'],
      ['rope_placement'],
      ['pole_pockets'],
      ['pole_pocket_position'],
      ['pole_pocket_size'],
      ['pole_pocket_cost_cents'],
      ['line_total_cents'],
      ['file_key'],
      ['file_name'],
      ['file_url'],
      ['artwork_manifest'],
      ['placement_preview'],
      ['original_filename'],
      ['production_pdf_status'],
      ['production_pdf_error'],
      ['print_ready_url'],
      ['web_preview_url'],
      ['text_elements'],
      ['overlay_image'],
      ['overlay_images'],
      ['thumbnail_url'],
      ['canvas_background_color'],
      ['image_scale'],
      ['image_position'],
      ['final_render_url'],
      ['final_render_file_key'],
      ['final_render_width_px'],
      ['final_render_height_px'],
      ['final_render_dpi'],
      ['canvas_state_json'],
      ['design_service_enabled'],
      ['design_request_text'],
      ['design_draft_preference'],
      ['design_draft_contact'],
      ['design_uploaded_assets'],
      ['final_print_pdf_url'],
      ['final_print_pdf_file_key'],
      ['final_print_pdf_uploaded_at'],
      ['generated_print_pdf_url'],
      ['generated_print_pdf_uploaded_at'],
      ['generated_print_pdf_metadata'],
      ['product_type', 'product_type', `COALESCE(product_type, 'banner')`],
      ['yard_sign_sidedness'],
      ['yard_sign_step_stakes_enabled'],
      ['yard_sign_step_stakes_qty'],
      ['yard_sign_design_count'],
      ['yard_sign_designs'],
      ['yard_sign_signs_subtotal_cents'],
      ['yard_sign_stakes_subtotal_cents'],
    ];

    const haveItemIntrospection = existingItemCols.size > 0;
    const itemSelectCols = itemFields.map(([col, alias, expr]) => {
      const exists = !haveItemIntrospection || existingItemCols.has(col);
      const aliasOut = alias && alias !== col ? ` AS ${alias}` : '';
      if (!exists) return `NULL AS ${alias || col}`;
      return expr ? `${expr}${aliasOut || ` AS ${col}`}` : `${col}${aliasOut}`;
    }).join(', ');

    const itemsResult = await sql(
      `SELECT ${itemSelectCols} FROM order_items WHERE order_id = $1 ORDER BY created_at`,
      [orderId]
    );


    // Legacy repair: infer missing Same-Day fee for historical paid PayPal orders
    // when order-level fee columns were not persisted/populated.
    const subtotal = Number(order.subtotal_cents) || 0;
    const tax = Number(order.tax_cents) || 0;
    const total = Number(order.total_cents) || 0;
    const saturdayFee = Number(order.saturday_fee_cents) || 0;
    const storedSameDayFee = Number(order.same_day_fee_cents) || 0;
    const residual = total - subtotal - tax - saturdayFee;
    const canInferSameDay = storedSameDayFee <= 0
      && residual > 0
      && String(order.status || '').toLowerCase() === 'paid';
    const inferredSameDayFee = canInferSameDay ? residual : storedSameDayFee;
    const inferredSameDaySelected = Boolean(order.same_day_hit_service) || inferredSameDayFee > 0;

    // Combine order with items
    const shippingAddress = normalizeShippingAddress(order);
    const {
      checkout_idempotency_key: _checkoutIdempotencyKey,
      stripe_payment_intent_id: _stripePaymentIntentId,
      stripe_charge_id: _stripeChargeId,
      ...publicOrder
    } = order;
    if (session?.admin) {
      publicOrder.stripe_payment_intent_id = _stripePaymentIntentId || null;
      publicOrder.stripe_charge_id = _stripeChargeId || null;
    }
    const orderWithItems = {
      ...publicOrder,
      tracking_numbers: normalizeTrackingEntries(order),
      trackingNumbers: normalizeTrackingEntries(order),
      same_day_hit_service: inferredSameDaySelected,
      same_day_fee_cents: inferredSameDayFee,
      shippingAddress,
      items: itemsResult
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        order: orderWithItems
      })
    };

  } catch (error) {
    console.error('Error fetching order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to fetch order details',
        details: error.message
      })
    };
  }
};

exports._test = {
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
