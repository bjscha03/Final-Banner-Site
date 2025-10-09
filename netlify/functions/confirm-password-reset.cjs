const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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

// Simple password hashing (for now - replace with bcrypt in production)
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
    const { token, newPassword } = JSON.parse(event.body || '{}');
    
    if (!token || typeof token !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Reset token is required' })
      };
    }

    // Validate password
    const passwordValidation = validatePassword(newPassword);
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

    // Find valid reset token
    const resetTokens = await db`
      SELECT pr.id, pr.user_id, pr.expires_at, pr.used, pr.used_at, p.email
      FROM password_resets pr
      JOIN profiles p ON p.id = pr.user_id
      WHERE pr.token = ${token}
    `;
    
    if (resetTokens.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid or expired reset token' })
      };
    }

    const resetToken = resetTokens[0];
    
    // Check if token is expired
    if (new Date() > new Date(resetToken.expires_at)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Reset token has expired' })
      };
    }

    // Check if token was already used
    if (resetToken.used || resetToken.used_at) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Reset token has already been used' })
      };
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await db`
      UPDATE profiles 
      SET password_hash = ${hashedPassword}, updated_at = NOW()
      WHERE id = ${resetToken.user_id}
    `;

    // Mark token as used
    await db`
      UPDATE password_resets 
      SET used = true, used_at = NOW()
      WHERE id = ${resetToken.id}
    `;

    console.log(`Password reset completed successfully for user: ${resetToken.email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };

  } catch (error) {
    console.error('Password reset confirmation failed:', error);
    
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
