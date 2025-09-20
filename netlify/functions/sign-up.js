const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Generate UUID
function generateUUID() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

// Generate secure random token
function generateSecureToken(bytes = 32) {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('hex');
}

// Validate password strength
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters long' };
  }
  
  return { valid: true };
}

// Hash password using PBKDF2
async function hashPassword(password) {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
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
    const { email, password, fullName, username } = JSON.parse(event.body || '{}');
    
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

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: passwordValidation.error })
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
    const isAdmin = normalizedEmail.includes('admin');

    // Check if user already exists
    const existingUsers = await db`
      SELECT id FROM profiles WHERE email = ${normalizedEmail}
    `;
    
    if (existingUsers.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'An account with this email address already exists. Please sign in instead.' 
        })
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    const userId = generateUUID();

    // Create user profile
    await db`
      INSERT INTO profiles (id, email, full_name, username, is_admin, password_hash, email_verified, created_at, updated_at)
      VALUES (${userId}, ${normalizedEmail}, ${fullName || null}, ${username || null}, ${isAdmin}, ${hashedPassword}, false, NOW(), NOW())
    `;

    console.log(`User account created successfully: ${normalizedEmail}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        message: 'Account created successfully. Please check your email to verify your account.'
      })
    };

  } catch (error) {
    console.error('Sign-up failed:', error);
    
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
