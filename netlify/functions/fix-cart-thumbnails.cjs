const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const sql = neon(DATABASE_URL);

    console.log('[fix-cart-thumbnails] Starting cart thumbnail fix...');

    // Get all active carts
    const carts = await sql`
      SELECT id, user_id, session_id, cart_data
      FROM user_carts
      WHERE status = 'active'
    `;

    console.log(`[fix-cart-thumbnails] Found ${carts.length} active carts`);

    let fixedCount = 0;
    let totalItemsFixed = 0;

    for (const cart of carts) {
      let cartData = cart.cart_data || [];
      let modified = false;

      // Clean each item in the cart
      const cleanedData = cartData.map((item) => {
        let itemModified = false;

        // Remove blob URLs and data URLs
        if (item.file_url?.startsWith('blob:') || item.file_url?.startsWith('data:')) {
          console.log(`[fix-cart-thumbnails] Removing invalid file_url from item ${item.id} in cart ${cart.id}`);
          item.file_url = null;
          itemModified = true;
        }

        if (item.web_preview_url?.startsWith('blob:') || item.web_preview_url?.startsWith('data:')) {
          console.log(`[fix-cart-thumbnails] Removing invalid web_preview_url from item ${item.id} in cart ${cart.id}`);
          item.web_preview_url = null;
          itemModified = true;
        }

        if (item.print_ready_url?.startsWith('blob:') || item.print_ready_url?.startsWith('data:')) {
          console.log(`[fix-cart-thumbnails] Removing invalid print_ready_url from item ${item.id} in cart ${cart.id}`);
          item.print_ready_url = null;
          itemModified = true;
        }

        // CRITICAL FIX: Reconstruct Cloudinary URL from file_key if URL is missing
        if (!item.file_url && item.file_key) {
          item.file_url = `https://res.cloudinary.com/dtrxl120u/image/upload/${item.file_key}`;
          console.log(`[fix-cart-thumbnails] Reconstructed file_url from file_key for item ${item.id}: ${item.file_url}`);
          itemModified = true;
        }

        if (itemModified) {
          totalItemsFixed++;
          modified = true;
        }

        return item;
      });

      // Update cart if modified
      if (modified) {
        const cleanedDataJson = JSON.stringify(cleanedData);
        await sql`
          UPDATE user_carts
          SET cart_data = ${cleanedDataJson}::jsonb,
              updated_at = NOW()
          WHERE id = ${cart.id}
        `;
        fixedCount++;
        console.log(`[fix-cart-thumbnails] Fixed cart ${cart.id}`);
      }
    }

    const message = `Fixed ${fixedCount} carts with ${totalItemsFixed} items`;
    console.log(`[fix-cart-thumbnails] ${message}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message,
        cartsFixed: fixedCount,
        itemsFixed: totalItemsFixed,
      }),
    };
  } catch (error) {
    console.error('[fix-cart-thumbnails] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
