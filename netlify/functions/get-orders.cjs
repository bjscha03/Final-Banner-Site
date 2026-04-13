const { neon } = require('@neondatabase/serverless');

// Neon database connection
// Lazily initialize Neon with whichever DB URL is available
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}


exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error('[get-orders] Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'Set NETLIFY_DATABASE_URL or VITE_DATABASE_URL or DATABASE_URL'
        }),
      };
    }

    // --- Diagnostic: log which DB env var is in use and the host (never log secrets) ---
    const whichVar = process.env.NETLIFY_DATABASE_URL ? 'NETLIFY_DATABASE_URL'
      : process.env.VITE_DATABASE_URL ? 'VITE_DATABASE_URL'
      : 'DATABASE_URL';
    let dbHost = '(unknown)';
    try { dbHost = new URL(dbUrl).hostname; } catch (_) { /* non-URL format */ }
    console.log(`[get-orders] Using ${whichVar} → host=${dbHost}`);

    const sql = neon(dbUrl);

    // --- Diagnostic: verify connectivity + row count (cheap on PK-indexed table) ---
    if (process.env.DEBUG_ORDERS) {
      const [countRow] = await sql`SELECT current_schema() AS schema, COUNT(*) AS cnt FROM orders`;
      console.log(`[get-orders] schema=${countRow.schema}  orders COUNT(*)=${countRow.cnt}`);
    }

    // AUTO-MIGRATE: Ensure all columns referenced by the query exist.
    // These columns may be missing if certain migration scripts were never run.
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS image_scale NUMERIC DEFAULT 1,
        ADD COLUMN IF NOT EXISTS image_position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb,
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
        ADD COLUMN IF NOT EXISTS overlay_image JSONB,
        ADD COLUMN IF NOT EXISTS overlay_images JSONB,
        ADD COLUMN IF NOT EXISTS canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF',
        ADD COLUMN IF NOT EXISTS file_key VARCHAR(255),
        ADD COLUMN IF NOT EXISTS file_url TEXT,
        ADD COLUMN IF NOT EXISTS print_ready_url TEXT,
        ADD COLUMN IF NOT EXISTS web_preview_url TEXT,
        ADD COLUMN IF NOT EXISTS text_elements JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS pole_pocket_position TEXT,
        ADD COLUMN IF NOT EXISTS pole_pocket_size TEXT,
        ADD COLUMN IF NOT EXISTS pole_pocket_cost_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS final_render_url TEXT,
        ADD COLUMN IF NOT EXISTS final_render_file_key TEXT,
        ADD COLUMN IF NOT EXISTS final_render_width_px INTEGER,
        ADD COLUMN IF NOT EXISTS final_render_height_px INTEGER,
        ADD COLUMN IF NOT EXISTS final_render_dpi INTEGER,
        ADD COLUMN IF NOT EXISTS canvas_state_json TEXT,
        ADD COLUMN IF NOT EXISTS design_service_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS design_request_text TEXT,
        ADD COLUMN IF NOT EXISTS design_draft_preference VARCHAR(10),
        ADD COLUMN IF NOT EXISTS design_draft_contact VARCHAR(255),
        ADD COLUMN IF NOT EXISTS design_uploaded_assets JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS final_print_pdf_url TEXT,
        ADD COLUMN IF NOT EXISTS final_print_pdf_file_key TEXT,
        ADD COLUMN IF NOT EXISTS final_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'banner'
      `;
      console.log('[get-orders] Auto-migration: order_items columns verified');
    } catch (migErr) {
      console.warn('[get-orders] Auto-migration warning (non-fatal):', migErr.message);
    }

    // AUTO-MIGRATE: Ensure orders table columns exist
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS customer_name TEXT,
        ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(255),
        ADD COLUMN IF NOT EXISTS shipping_name TEXT,
        ADD COLUMN IF NOT EXISTS shipping_street TEXT,
        ADD COLUMN IF NOT EXISTS shipping_street2 TEXT,
        ADD COLUMN IF NOT EXISTS shipping_city TEXT,
        ADD COLUMN IF NOT EXISTS shipping_state TEXT,
        ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
        ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US',
        ADD COLUMN IF NOT EXISTS applied_discount_cents INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS applied_discount_label TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS applied_discount_type TEXT DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS production_email_sent BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS production_email_sent_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE
      `;
      console.log('[get-orders] Auto-migration: orders columns verified');
    } catch (migErr) {
      console.warn('[get-orders] Auto-migration orders table warning (non-fatal):', migErr.message);
    }

    const { user_id, page = 1 } = event.queryStringParameters || {};
    const limit = 20;
    const offset = (page - 1) * limit;

    let orders;

    if (user_id) {
      // Get orders for specific user
      console.log('[get-orders] Fetching orders for user:', user_id);
      orders = await sql`
        SELECT o.*,
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', COALESCE(oi.grommets, 'none'),
                   'rope_feet', COALESCE(oi.rope_feet, 0),
                   'pole_pockets', COALESCE(oi.pole_pockets, false),
                   'pole_pocket_position', oi.pole_pocket_position,
                   'pole_pocket_size', oi.pole_pocket_size,
                   'pole_pocket_cost_cents', oi.pole_pocket_cost_cents,
                   'area_sqft', (oi.width_in * oi.height_in / 144.0),
                   'unit_price_cents', CASE WHEN oi.quantity > 0 THEN (oi.line_total_cents / oi.quantity) ELSE 0 END,
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key,
                   'file_url', oi.file_url,
                   'print_ready_url', oi.print_ready_url,
                   'web_preview_url', oi.web_preview_url,
                   'text_elements', COALESCE(oi.text_elements, '[]'::jsonb),
                   'overlay_image', oi.overlay_image,
                   'overlay_images', oi.overlay_images,
                   'canvas_background_color', COALESCE(oi.canvas_background_color, '#FFFFFF'),
                   'image_scale', COALESCE(oi.image_scale, 1),
                   'image_position', COALESCE(oi.image_position, '{"x": 0, "y": 0}'::jsonb),
                   'thumbnail_url', oi.thumbnail_url,
                   'final_render_url', oi.final_render_url,
                   'final_render_file_key', oi.final_render_file_key,
                   'final_render_width_px', oi.final_render_width_px,
                   'final_render_height_px', oi.final_render_height_px,
                   'final_render_dpi', oi.final_render_dpi,
                   'canvas_state_json', oi.canvas_state_json,
                   'design_service_enabled', COALESCE(oi.design_service_enabled, false),
                   'design_request_text', oi.design_request_text,
                   'design_draft_preference', oi.design_draft_preference,
                   'design_draft_contact', oi.design_draft_contact,
                   'design_uploaded_assets', COALESCE(oi.design_uploaded_assets, '[]'::jsonb),
                   'final_print_pdf_url', oi.final_print_pdf_url,
                   'final_print_pdf_file_key', oi.final_print_pdf_file_key,
                   'final_print_pdf_uploaded_at', oi.final_print_pdf_uploaded_at,
                   'product_type', COALESCE(oi.product_type, 'banner')
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ${user_id}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Get all orders (admin view)
      console.log('[get-orders] Fetching all orders (admin)');
      orders = await sql`
        SELECT o.*,
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'width_in', oi.width_in,
                   'height_in', oi.height_in,
                   'quantity', oi.quantity,
                   'material', oi.material,
                   'grommets', COALESCE(oi.grommets, 'none'),
                   'rope_feet', COALESCE(oi.rope_feet, 0),
                   'pole_pockets', COALESCE(oi.pole_pockets, false),
                   'pole_pocket_position', oi.pole_pocket_position,
                   'pole_pocket_size', oi.pole_pocket_size,
                   'pole_pocket_cost_cents', oi.pole_pocket_cost_cents,
                   'area_sqft', (oi.width_in * oi.height_in / 144.0),
                   'unit_price_cents', CASE WHEN oi.quantity > 0 THEN (oi.line_total_cents / oi.quantity) ELSE 0 END,
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key,
                   'file_url', oi.file_url,
                   'print_ready_url', oi.print_ready_url,
                   'web_preview_url', oi.web_preview_url,
                   'text_elements', COALESCE(oi.text_elements, '[]'::jsonb),
                   'overlay_image', oi.overlay_image,
                   'overlay_images', oi.overlay_images,
                   'canvas_background_color', COALESCE(oi.canvas_background_color, '#FFFFFF'),
                   'image_scale', COALESCE(oi.image_scale, 1),
                   'image_position', COALESCE(oi.image_position, '{"x": 0, "y": 0}'::jsonb),
                   'thumbnail_url', oi.thumbnail_url,
                   'final_render_url', oi.final_render_url,
                   'final_render_file_key', oi.final_render_file_key,
                   'final_render_width_px', oi.final_render_width_px,
                   'final_render_height_px', oi.final_render_height_px,
                   'final_render_dpi', oi.final_render_dpi,
                   'canvas_state_json', oi.canvas_state_json,
                   'design_service_enabled', COALESCE(oi.design_service_enabled, false),
                   'design_request_text', oi.design_request_text,
                   'design_draft_preference', oi.design_draft_preference,
                   'design_draft_contact', oi.design_draft_contact,
                   'design_uploaded_assets', COALESCE(oi.design_uploaded_assets, '[]'::jsonb),
                   'final_print_pdf_url', oi.final_print_pdf_url,
                   'final_print_pdf_file_key', oi.final_print_pdf_file_key,
                   'final_print_pdf_uploaded_at', oi.final_print_pdf_uploaded_at,
                   'product_type', COALESCE(oi.product_type, 'banner')
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    console.log(`[get-orders] Found ${orders.length} orders`);

    // Format the response
    const formattedOrders = orders.map(order => {
      // Recalculate totals from line items (DB values may be incorrect)
      // Filter out phantom null items from LEFT JOIN when order has no items
      const _items = (order.items || []).filter(item => item && item.id !== null);
      const _recalcSubtotal = _items.reduce((sum, item) => sum + (Number(item.line_total_cents) || 0), 0);
      // Subtract discount before computing tax/total (same pattern as notify-order.cjs)
      const _discountCents = Number(order.applied_discount_cents) || 0;
      const _afterDiscount = _recalcSubtotal - _discountCents;
      const _recalcTax = Math.round(_afterDiscount * 0.06);
      const _recalcTotal = _afterDiscount + _recalcTax;
      return {
      id: order.id,
      user_id: order.user_id,
      email: order.email,
      customer_name: order.customer_name,
      subtotal_cents: _recalcSubtotal,
      tax_cents: _recalcTax,
      total_cents: _recalcTotal,
      status: order.status,
      currency: 'USD',
      tracking_number: order.tracking_number,
      tracking_carrier: order.tracking_number ? 'fedex' : null, // Default to fedex when tracking exists
      shipping_name: order.shipping_name,
      shipping_street: order.shipping_street,
      shipping_street2: order.shipping_street2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      shipping_country: order.shipping_country,
      applied_discount_cents: Number(order.applied_discount_cents) || 0,
      applied_discount_label: order.applied_discount_label || '',
      applied_discount_type: order.applied_discount_type || 'none',
      production_email_sent: order.production_email_sent || false,
      production_email_sent_at: order.production_email_sent_at || null,
      shipping_notification_sent: order.shipping_notification_sent || false,
      created_at: order.created_at,
      items: _items
    };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedOrders),
    };
  } catch (error) {
    console.error('[get-orders] Error fetching orders:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch orders', 
        details: error.message,
        code: error.code || null
      }),
    };
  }
};
