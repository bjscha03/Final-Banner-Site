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
    
    console.log('🔍 DEBUG ORDERS - Starting debug...');
    
    // Get all users
    const users = await sql`SELECT id, email, username FROM profiles ORDER BY created_at DESC LIMIT 10`;
    console.log('Users found:', users);
    
    // Get all orders
    const orders = await sql`SELECT id, user_id, email, total_cents, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10`;
    console.log('Orders found:', orders);
    
    // Get all order items
    const orderItems = await sql`SELECT order_id, width_in, height_in, quantity, material, line_total_cents FROM order_items LIMIT 10`;
    console.log('Order items found:', orderItems);
    
    // Check for user ID format mismatches
    const userIds = users.map(u => u.id);
    const orderUserIds = orders.map(o => o.user_id);
    
    console.log('User IDs format:', userIds);
    console.log('Order User IDs format:', orderUserIds);
    
    // Find matches
    const matches = [];
    const mismatches = [];
    
    orderUserIds.forEach(orderUserId => {
      const match = userIds.find(userId => userId === orderUserId);
      if (match) {
        matches.push({ orderUserId, matchedUserId: match });
      } else {
        mismatches.push({ orderUserId, availableUserIds: userIds });
      }
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        debug: 'orders-user-id-matching',
        users: users,
        orders: orders,
        orderItems: orderItems,
        userIds: userIds,
        orderUserIds: orderUserIds,
        matches: matches,
        mismatches: mismatches,
        analysis: {
          totalUsers: users.length,
          totalOrders: orders.length,
          totalOrderItems: orderItems.length,
          matchingOrders: matches.length,
          mismatchedOrders: mismatches.length
        }
      }, null, 2)
    };
    
  } catch (error) {
    console.error('Debug orders error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Debug failed', 
        details: error.message 
      })
    };
  }
};
