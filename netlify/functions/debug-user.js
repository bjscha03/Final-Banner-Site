const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const { email } = JSON.parse(event.body || '{}');
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Email is required' })
      };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);
    const normalizedEmail = email.toLowerCase().trim();

    // Get user info
    const users = await db`
      SELECT id, email, full_name, is_admin, email_verified, 
             password_hash IS NOT NULL as has_password_hash,
             LENGTH(password_hash) as password_hash_length,
             CASE 
               WHEN password_hash LIKE '%:%' THEN 'salt:hash format'
               ELSE 'unknown format'
             END as password_format,
             created_at, updated_at
      FROM profiles 
      WHERE email = ${normalizedEmail}
    `;
    
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'User not found' })
      };
    }

    const user = users[0];

    // Get recent password resets
    const resets = await db`
      SELECT id, token, expires_at, used, used_at, created_at
      FROM password_resets 
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    // Get email verification status
    const verifications = await db`
      SELECT id, token, expires_at, verified, verified_at, created_at
      FROM email_verifications 
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 3
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          is_admin: user.is_admin,
          email_verified: user.email_verified,
          has_password_hash: user.has_password_hash,
          password_hash_length: user.password_hash_length,
          password_format: user.password_format,
          created_at: user.created_at,
          updated_at: user.updated_at
        },
        recent_password_resets: resets,
        email_verifications: verifications
      })
    };

  } catch (error) {
    console.error('Debug user failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: error.message 
      })
    };
  }
};
