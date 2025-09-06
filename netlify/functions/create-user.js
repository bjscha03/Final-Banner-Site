const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Check if database URL is available
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('NETLIFY_DATABASE_URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL environment variable not set'
        }),
      };
    }

    const userData = JSON.parse(event.body);
    console.log('Creating/updating user profile:', userData);

    const { id, email, full_name, is_admin } = userData;

    if (!id || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields',
          details: 'id and email are required'
        }),
      };
    }

    // Check if email already exists
    const existingUser = await sql`
      SELECT id, email FROM profiles WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Email already exists',
          details: 'An account with this email address already exists'
        }),
      };
    }

    // Insert new user profile
    const result = await sql`
      INSERT INTO profiles (id, email, full_name, is_admin)
      VALUES (${id}, ${email}, ${full_name || null}, ${is_admin || false})
      RETURNING *
    `;

    console.log('User profile created/updated:', result[0]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: result[0]
      }),
    };
  } catch (error) {
    console.error('Error creating user profile:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create user profile', 
        details: error.message 
      }),
    };
  }
};
