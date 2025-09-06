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

    const { id, email, full_name, is_admin, is_signup } = userData;

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

    // For sign up, check if email already exists
    // For sign in, allow updating existing profiles
    const existingUser = await sql`
      SELECT id, email FROM profiles WHERE email = ${email}
    `;

    let result;

    if (existingUser.length > 0) {
      if (is_signup) {
        // For sign up, reject if email exists
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Email already exists',
            details: 'An account with this email address already exists'
          }),
        };
      } else {
        // Update existing user (for sign in)
        console.log('Updating existing user profile');
        result = await sql`
          UPDATE profiles
          SET full_name = ${full_name || null},
              is_admin = ${is_admin || false},
              updated_at = NOW()
          WHERE email = ${email}
          RETURNING *
        `;
      }
    } else {
      // Insert new user profile (for sign up or first sign in)
      console.log('Creating new user profile');
      result = await sql`
        INSERT INTO profiles (id, email, full_name, is_admin)
        VALUES (${id}, ${email}, ${full_name || null}, ${is_admin || false})
        RETURNING *
      `;
    }

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
