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
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'Set NETLIFY_DATABASE_URL or VITE_DATABASE_URL or DATABASE_URL'
        }),
      };
    }

    const sql = neon(dbUrl);

    const { user_id, page = 1 } = event.queryStringParameters || {};
    const limit = 20;
    const offset = (page - 1) * limit;

    let orders;
    
    if (user_id) {
      // Get orders for specific user
      console.log('Fetching orders for user:', user_id);
      orders = await sql`
        SELECT o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents,
               o.status, o.tracking_number, o.created_at, o.updated_at,
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
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key,
                   'file_url', oi.file_url,
                   'thumbnail_url', oi.thumbnail_url,
                   'design_service_enabled', COALESCE(oi.design_service_enabled, false),
                   'design_request_text', oi.design_request_text,
                   'design_draft_preference', oi.design_draft_preference,
                   'design_draft_contact', oi.design_draft_contact,
                   'design_uploaded_assets', COALESCE(oi.design_uploaded_assets, '[]'::jsonb),
                   'final_print_pdf_url', oi.final_print_pdf_url,
                   'final_print_pdf_file_key', oi.final_print_pdf_file_key,
                   'final_print_pdf_uploaded_at', oi.final_print_pdf_uploaded_at
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ${user_id}
        GROUP BY o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents,
                 o.status, o.tracking_number, o.created_at, o.updated_at
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Get all orders (admin view)
      console.log('Fetching all orders');
      orders = await sql`
        SELECT o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents,
               o.status, o.tracking_number, o.created_at, o.updated_at,
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
                   'line_total_cents', oi.line_total_cents,
                   'file_key', oi.file_key,
                   'file_url', oi.file_url,
                   'thumbnail_url', oi.thumbnail_url,
                   'design_service_enabled', COALESCE(oi.design_service_enabled, false),
                   'design_request_text', oi.design_request_text,
                   'design_draft_preference', oi.design_draft_preference,
                   'design_draft_contact', oi.design_draft_contact,
                   'design_uploaded_assets', COALESCE(oi.design_uploaded_assets, '[]'::jsonb),
                   'final_print_pdf_url', oi.final_print_pdf_url,
                   'final_print_pdf_file_key', oi.final_print_pdf_file_key,
                   'final_print_pdf_uploaded_at', oi.final_print_pdf_uploaded_at
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        GROUP BY o.id, o.user_id, o.email, o.subtotal_cents, o.tax_cents, o.total_cents,
                 o.status, o.tracking_number, o.created_at, o.updated_at
        ORDER BY o.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    console.log(`Found ${orders.length} orders`);

    // Format the response - only use columns that definitely exist
    const formattedOrders = orders.map(order => ({
      id: order.id,
      user_id: order.user_id,
      email: order.email,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      total_cents: order.total_cents,
      status: order.status,
      currency: 'USD',
      tracking_number: order.tracking_number,
      tracking_carrier: order.tracking_number ? 'fedex' : null,
      created_at: order.created_at,
      items: order.items || []
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedOrders),
    };
  } catch (error) {
    console.error('Error fetching orders:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch orders', 
        details: error.message 
      }),
    };
  }
};
