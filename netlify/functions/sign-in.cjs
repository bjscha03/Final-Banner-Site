const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Verify password against hash
async function verifyPassword(password, hashedPassword) {
  const crypto = require('crypto');
  
  if (!hashedPassword || !hashedPassword.includes(':')) {
    return false;
  }
  
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

exports.handler = async (event) => {
  // Handle CORS preflight
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
    const { email, password } = JSON.parse(event.body || '{}');
    
    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Email is required' })
      };
    }

    if (!password || typeof password !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Password is required' })
      };
    }

    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('Database URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);
    const normalizedEmail = email.toLowerCase().trim();

    // Query user by email
    const users = await db`
      SELECT id, email, full_name, username, is_admin, password_hash, email_verified
      FROM profiles 
      WHERE email = ${normalizedEmail}
    `;
    
    if (users.length === 0) {
      // Return generic error to prevent email enumeration
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid email or password' })
      };
    }

    const user = users[0];

    // Check if user has a password hash
    if (!user.password_hash) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Account not properly set up. Please use password reset to set your password.' 
        })
      };
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid email or password' })
      };
    }

    // Check email verification
    if (!user.email_verified) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Please verify your email address before signing in. Check your email for verification instructions.' 
        })
      };
    }

    // Return user data (excluding password hash)
    const userData = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      username: user.username,
      is_admin: user.is_admin
    };

    console.log(`Successful sign-in for user: ${user.email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        user: userData 
      })
    };

  } catch (error) {
    console.error('Sign-in failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error' 
      })
    };
  }
};
