const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    console.log('🔧 FIXING ORDER USER ID - Starting fix...');
    
    // Get the user with email bjscha02@gmail.com
    const users = await sql`SELECT id, email FROM profiles WHERE email = 'bjscha02@gmail.com'`;
    
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const user = users[0];
    console.log('Found user:', user);
    
    // Find orders with null user_id that have the user's email
    const ordersToFix = await sql`
      SELECT id, email, user_id, total_cents, created_at 
      FROM orders 
      WHERE user_id IS NULL AND email = 'bjscha02@gmail.com'
    `;
    
    console.log('Orders to fix:', ordersToFix);
    
    if (ordersToFix.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: 'No orders need fixing',
          user: user,
          ordersToFix: []
        })
      };
    }
    
    // Update the orders to have the correct user_id
    const fixedOrders = [];
    for (const order of ordersToFix) {
      const result = await sql`
        UPDATE orders 
        SET user_id = ${user.id}
        WHERE id = ${order.id}
        RETURNING id, user_id, email, total_cents
      `;
      
      fixedOrders.push(result[0]);
      console.log(`Fixed order ${order.id} - set user_id to ${user.id}`);
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Orders fixed successfully!',
        user: user,
        ordersFixed: fixedOrders.length,
        fixedOrders: fixedOrders
      }, null, 2)
    };
    
  } catch (error) {
    console.error('Fix order user ID error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Fix failed', 
        details: error.message 
      })
    };
  }
};
