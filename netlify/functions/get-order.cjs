const { neon } = require('@neondatabase/serverless');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
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

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const sql = neon(dbUrl);

    // AUTO-MIGRATE: Ensure all referenced columns exist.
    // Each ALTER runs independently so a single failure does not roll back the rest.
    const ALLOWED_TABLES = new Set(['orders', 'order_items']);
    const SAFE_DDL_RE = /^[A-Za-z0-9_ ,'"\.\(\)\{\}\[\]:\-#=]+$/;
    const ensureColumn = async (table, columnDef) => {
      if (!ALLOWED_TABLES.has(table) || !SAFE_DDL_RE.test(columnDef)) {
        console.warn(`[get-order] Refusing unsafe migration for ${table}/${columnDef}`);
        return;
      }
      try {
        await sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDef}`);
      } catch (migErr) {
        console.warn(`[get-order] Auto-migration ${table}.${columnDef} (non-fatal):`, migErr.message);
      }
    };

    const orderItemColumns = [
      `image_scale NUMERIC DEFAULT 1`,
      `image_position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb`,
      `thumbnail_url TEXT`,
      `overlay_image JSONB`,
      `overlay_images JSONB`,
      `canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF'`,
      `file_url TEXT`,
      `print_ready_url TEXT`,
      `web_preview_url TEXT`,
      `text_elements JSONB DEFAULT '[]'::jsonb`,
      `pole_pocket_position TEXT`,
      `rope_placement TEXT`,
      `pole_pocket_size TEXT`,
      `pole_pocket_cost_cents INTEGER DEFAULT 0`,
      `rounded_corners TEXT`,
      `final_render_url TEXT`,
      `final_render_file_key TEXT`,
      `final_render_width_px INTEGER`,
      `final_render_height_px INTEGER`,
      `final_render_dpi INTEGER`,
      `canvas_state_json TEXT`,
      `design_service_enabled BOOLEAN DEFAULT FALSE`,
      `design_request_text TEXT`,
      `design_draft_preference VARCHAR(10)`,
      `design_draft_contact VARCHAR(255)`,
      `design_uploaded_assets JSONB DEFAULT '[]'::jsonb`,
      `final_print_pdf_url TEXT`,
      `final_print_pdf_file_key TEXT`,
      `final_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE`,
      `generated_print_pdf_url TEXT`,
      `generated_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE`,
      `product_type TEXT DEFAULT 'banner'`,
      `yard_sign_sidedness TEXT`,
      `yard_sign_step_stakes_enabled BOOLEAN DEFAULT false`,
      `yard_sign_step_stakes_qty INTEGER DEFAULT 0`,
      `yard_sign_design_count INTEGER DEFAULT 0`,
      `yard_sign_designs JSONB`,
      `yard_sign_signs_subtotal_cents INTEGER DEFAULT 0`,
      `yard_sign_stakes_subtotal_cents INTEGER DEFAULT 0`,
    ];
    for (const col of orderItemColumns) {
      await ensureColumn('order_items', col);
    }

    // AUTO-MIGRATE: Ensure shipping columns exist on orders table
    const orderColumns = [
      `customer_name TEXT`,
      `customer_first_name TEXT`,
      `shipping_name TEXT`,
      `shipping_street TEXT`,
      `shipping_street2 TEXT`,
      `shipping_city TEXT`,
      `shipping_state TEXT`,
      `shipping_zip TEXT`,
      `shipping_country TEXT`,
      `shipping_address JSONB`,
      `same_day_hit_service BOOLEAN DEFAULT FALSE`,
      `saturday_delivery BOOLEAN DEFAULT FALSE`,
      `same_day_fee_cents INTEGER DEFAULT 0`,
      `saturday_fee_cents INTEGER DEFAULT 0`,
      `order_timestamp_et TEXT`,
      `same_day_qualified BOOLEAN DEFAULT FALSE`,
    ];
    for (const col of orderColumns) {
      await ensureColumn('orders', col);
    }

    // Parse query parameters
    const orderId = event.queryStringParameters?.id;

    if (!orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order ID is required' })
      };
    }

    // BULLETPROOF SELECT: introspect existing columns up front so a missing
    // column (e.g. silent migration failure) never 500s the endpoint.
    let existingOrderCols = new Set();
    let existingItemCols = new Set();
    try {
      const [oCols, iCols] = await Promise.all([
        sql(`SELECT column_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'orders'`),
        sql(`SELECT column_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'order_items'`),
      ]);
      existingOrderCols = new Set(oCols.map(r => r.column_name));
      existingItemCols = new Set(iCols.map(r => r.column_name));
    } catch (introspectErr) {
      console.warn('[get-order] Column introspection failed (non-fatal):', introspectErr.message);
    }

    const safeOrderCol = (col) => existingOrderCols.size === 0 || existingOrderCols.has(col)
      ? col
      : `NULL AS ${col}`;
    // For order_items, allow an alias so an aliased expression can be substituted with NULL.
    const safeItemCol = (col, alias) => {
      const out = alias ? ` AS ${alias}` : '';
      return existingItemCols.size === 0 || existingItemCols.has(col) ? `${col}${out}` : `NULL${out || ` AS ${col}`}`;
    };

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
      'shipping_name',
      'shipping_street',
      'shipping_street2',
      'shipping_city',
      'shipping_state',
      'shipping_zip',
      'shipping_country',
      'shipping_address',
      'applied_discount_cents',
      'applied_discount_label',
      'applied_discount_type',
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

    // Get order items - same bulletproof approach.
    // Pairs: [columnName, optionalAlias, optionalSqlExpr]
    // When sqlExpr is given, the column existence check uses columnName but
    // the SQL emitted is the expression (with the alias preserved).
    const itemFields = [
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
      ['file_url'],
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

    // Combine order with items
    const shippingAddress = normalizeShippingAddress(order);
    const orderWithItems = {
      ...order,
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
