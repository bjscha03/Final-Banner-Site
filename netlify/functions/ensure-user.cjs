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
    const userData = JSON.parse(event.body);
    console.log('Ensuring user exists:', userData);

    const { id, email, username, full_name } = userData;

    if (!id || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'User ID and email are required' }),
      };
    }

    // Check if user already exists by email (primary lookup)
    const existingUser = await sql`
      SELECT id, email, username, full_name, is_admin, created_at FROM profiles WHERE email = ${email}
    `;

    if (existingUser.length > 0) {
      console.log('User already exists:', existingUser[0]);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'User already exists',
          user: existingUser[0]
        }),
      };
    }

    // Create new user
    const newUser = await sql`
      INSERT INTO profiles (id, email, username, full_name, is_admin, created_at)
      VALUES (${id}, ${email}, ${username || null}, ${full_name || null}, false, NOW())
      RETURNING id, email, username, full_name, is_admin, created_at
    `;

    console.log('User created successfully:', newUser[0]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'User created successfully',
        user: newUser[0]
      }),
    };

  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to ensure user exists', 
        details: error.message 
      }),
    };
  }
};
