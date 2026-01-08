const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow DELETE method
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { cartId } = body;

    // Validate cart ID
    if (!cartId || typeof cartId !== 'string') {
      console.error('[delete-abandoned-cart] Missing or invalid cartId');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Cart ID is required' })
      };
    }

    // Get database connection
    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('[delete-abandoned-cart] No database URL found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);

    // First, verify the cart exists
    const existingCart = await sql`
      SELECT id, email FROM abandoned_carts WHERE id = ${cartId}
    `;

    if (existingCart.length === 0) {
      console.log('[delete-abandoned-cart] Cart not found: ' + cartId);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Abandoned cart not found' })
      };
    }

    const cartEmail = existingCart[0].email;

    // Delete the cart
    const result = await sql`
      DELETE FROM abandoned_carts WHERE id = ${cartId}
      RETURNING id
    `;

    if (result.length === 0) {
      console.error('[delete-abandoned-cart] Failed to delete cart: ' + cartId);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to delete cart' })
      };
    }

    console.log('[delete-abandoned-cart] Successfully deleted cart: ' + cartId + ' (' + cartEmail + ')');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        message: 'Abandoned cart deleted successfully',
        deletedCartId: cartId
      })
    };

  } catch (error) {
    console.error('[delete-abandoned-cart] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to delete abandoned cart',
        message: error.message 
      })
    };
  }
};
