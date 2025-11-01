const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const sql = neon(DATABASE_URL);

    // Get all active carts with their data
    const carts = await sql`
      SELECT id, user_id, session_id, cart_data, created_at, updated_at
      FROM user_carts
      WHERE status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `;

    // Sanitize the output - show structure but mask sensitive data
    const sanitized = carts.map(cart => ({
      id: cart.id,
      user_id: cart.user_id ? `${cart.user_id.substring(0, 8)}...` : null,
      session_id: cart.session_id ? `${cart.session_id.substring(0, 12)}...` : null,
      item_count: cart.cart_data?.length || 0,
      items: cart.cart_data?.map(item => ({
        id: item.id,
        has_file_url: !!item.file_url,
        file_url_preview: item.file_url ? item.file_url.substring(0, 50) + '...' : null,
        has_web_preview_url: !!item.web_preview_url,
        web_preview_url_preview: item.web_preview_url ? item.web_preview_url.substring(0, 50) + '...' : null,
        has_print_ready_url: !!item.print_ready_url,
        print_ready_url_preview: item.print_ready_url ? item.print_ready_url.substring(0, 50) + '...' : null,
        has_aiDesign: !!item.aiDesign,
        aiDesign_assets: item.aiDesign?.assets ? {
          has_proofUrl: !!item.aiDesign.assets.proofUrl,
          proofUrl_preview: item.aiDesign.assets.proofUrl ? item.aiDesign.assets.proofUrl.substring(0, 50) + '...' : null,
        } : null,
      })) || [],
      created_at: cart.created_at,
      updated_at: cart.updated_at,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ carts: sanitized }, null, 2),
    };
  } catch (error) {
    console.error('[debug-cart] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
