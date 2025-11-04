const { neon } = require('@neondatabase/serverless');

async function checkCart() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  
  // Get the most recent cart
  const result = await sql`
    SELECT user_id, session_id, cart_data, updated_at
    FROM user_carts
    WHERE status = 'active'
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  if (result.length === 0) {
    console.log('No active carts found');
    return;
  }

  const cart = result[0];
  console.log('Most recent cart:');
  console.log('User ID:', cart.user_id);
  console.log('Session ID:', cart.session_id);
  console.log('Updated:', cart.updated_at);
  console.log('Cart data:', JSON.stringify(cart.cart_data, null, 2));
  
  if (cart.cart_data.length > 0) {
    console.log('\nFirst item keys:', Object.keys(cart.cart_data[0]));
  }
}

checkCart().catch(console.error);
