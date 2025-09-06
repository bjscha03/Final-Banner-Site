const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    if (!process.env.NETLIFY_DATABASE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database not configured' }),
      };
    }

    if (event.httpMethod === 'GET') {
      // Get all profiles and recent orders
      const profiles = await sql`
        SELECT id, email, full_name, is_admin, created_at 
        FROM profiles 
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const orders = await sql`
        SELECT id, user_id, email, total_cents, status, created_at
        FROM orders 
        ORDER BY created_at DESC
        LIMIT 10
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          profiles: profiles,
          orders: orders,
          profile_count: profiles.length,
          order_count: orders.length
        }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Test creating a user
      const testUser = {
        id: 'test_' + Date.now(),
        email: 'test' + Date.now() + '@example.com',
        full_name: 'Test User',
        is_admin: false
      };

      console.log('Creating test user:', testUser);

      const result = await sql`
        INSERT INTO profiles (id, email, full_name, is_admin)
        VALUES (${testUser.id}, ${testUser.email}, ${testUser.full_name}, ${testUser.is_admin})
        RETURNING *
      `;

      console.log('Test user created:', result[0]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Test user created successfully',
          user: result[0]
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };

  } catch (error) {
    console.error('Error in test-auth function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack
      }),
    };
  }
};
