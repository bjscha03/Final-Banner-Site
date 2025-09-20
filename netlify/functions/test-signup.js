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

// Hash password using PBKDF2
async function hashPassword(password) {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

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
    const { email, password, fullName } = JSON.parse(event.body || '{}');
    
    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Email and password required' })
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
    const userId = generateUUID();
    const hashedPassword = await hashPassword(password);

    // Create user profile
    await db`
      INSERT INTO profiles (id, email, full_name, is_admin, password_hash, email_verified, created_at, updated_at)
      VALUES (${userId}, ${normalizedEmail}, ${fullName || null}, false, ${hashedPassword}, false, NOW(), NOW())
    `;

    // Create email verification token
    const verificationToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db`
      INSERT INTO email_verifications (id, user_id, token, expires_at, verified, created_at)
      VALUES (${generateUUID()}, ${userId}, ${verificationToken}, ${expiresAt}, false, NOW())
    `;

    // Check if RESEND_API_KEY is configured
    const hasResendKey = !!process.env.RESEND_API_KEY;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        message: 'Account created successfully. Email verification token created.',
        debug: {
          userId,
          verificationToken,
          hasResendKey,
          email: normalizedEmail
        }
      })
    };

  } catch (error) {
    console.error('Test sign-up failed:', error);
    
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
