const { neon } = require('@neondatabase/serverless');

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

    // AUTO-MIGRATE: Ensure all referenced order_items columns exist
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS image_scale NUMERIC DEFAULT 1,
        ADD COLUMN IF NOT EXISTS image_position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb,
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
        ADD COLUMN IF NOT EXISTS overlay_image JSONB,
        ADD COLUMN IF NOT EXISTS overlay_images JSONB,
        ADD COLUMN IF NOT EXISTS canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF',
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
    } catch (migErr) {
      console.warn('[get-order] Auto-migration warning (non-fatal):', migErr.message);
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

    // Get order details
    const orderResult = await sql`
      SELECT
        id,
        order_number,
        user_id,
        email,
        subtotal_cents,
        tax_cents,
        total_cents,
        status,
        tracking_number,
        applied_discount_cents,
        applied_discount_label,
        applied_discount_type,
        created_at,
        updated_at
      FROM orders
      WHERE id = ${orderId}
    `;

    if (orderResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'Order not found' })
      };
    }

    const order = orderResult[0];

    // Get order items
    const itemsResult = await sql`
      SELECT
        width_in,
        height_in,
        quantity,
        material,
        grommets,
        rope_feet,
        pole_pockets,
        pole_pocket_position,
        pole_pocket_size,
        pole_pocket_cost_cents,
        line_total_cents,
        file_key,
        file_url,
        print_ready_url,
        web_preview_url,
        text_elements,
        overlay_image,
        overlay_images,
        thumbnail_url,
        canvas_background_color,
        image_scale,
        image_position,
        final_render_url,
        final_render_file_key,
        final_render_width_px,
        final_render_height_px,
        final_render_dpi,
        canvas_state_json,
        design_service_enabled,
        design_request_text,
        design_draft_preference,
        design_draft_contact,
        design_uploaded_assets,
        final_print_pdf_url,
        final_print_pdf_file_key,
        final_print_pdf_uploaded_at,
        COALESCE(product_type, 'banner') as product_type
      FROM order_items
      WHERE order_id = ${orderId}
      ORDER BY created_at
    `;

    // Combine order with items
    const orderWithItems = {
      ...order,
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
