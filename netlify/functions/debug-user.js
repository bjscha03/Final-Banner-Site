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
    // Check if database URL is available
    if (!process.env.NETLIFY_DATABASE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database configuration missing'
        }),
      };
    }

    if (event.httpMethod === 'GET') {
      // Get all profiles
      const profiles = await sql`
        SELECT id, email, full_name, is_admin, created_at 
        FROM profiles 
        ORDER BY created_at DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          profiles: profiles,
          count: profiles.length
        }),
      };
    }

    if (event.httpMethod === 'POST') {
      // Create a specific user profile (for debugging)
      const userData = JSON.parse(event.body);
      
      // If no specific user data provided, create a default test user
      const defaultUser = {
        id: userData.id || 'test-user-123',
        email: userData.email || 'test@example.com',
        full_name: userData.full_name || 'Test User',
        is_admin: userData.is_admin || false
      };

      const result = await sql`
        INSERT INTO profiles (id, email, full_name, is_admin)
        VALUES (${defaultUser.id}, ${defaultUser.email}, ${defaultUser.full_name}, ${defaultUser.is_admin})
        ON CONFLICT (email) 
        DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          is_admin = EXCLUDED.is_admin,
          updated_at = NOW()
        RETURNING *
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          user: result[0],
          message: 'User profile created/updated'
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };

  } catch (error) {
    console.error('Error in debug-user function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
    };
  }
};
