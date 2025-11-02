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

// Send verification email
async function sendVerificationEmail(email, verifyUrl, userName) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Welcome to Banners On The Fly - Verify Your Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Welcome to Banners On The Fly!</h2>
          <p>Hello ${userName || 'there'},</p>
          <p>Thank you for signing up! Please verify your email address by clicking the button below.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Confirm Email Address
            </a>
          </div>

          <p>If the button doesn't work, copy and paste this link:</p>
          <p style="word-break: break-all; color: #6b7280;">${verifyUrl}</p>

          <p>This verification link will expire in 24 hours.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Banners On The Fly<br>
            Custom banners made easy
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Email send error:', error);
      return { ok: false, error: error.message };
    }

    return { ok: true, messageId: data?.id };
  } catch (error) {
    console.error('Email system error:', error);
    return { ok: false, error: error.message };
  }
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
      SELECT id, email_verified FROM profiles WHERE email = ${normalizedEmail}
    `;
    
    console.log(`🔍 SIGN-UP: Checking for existing user with email: ${normalizedEmail}`);
    console.log(`🔍 SIGN-UP: Found ${existingUsers.length} existing users`);
    
    if (existingUsers.length > 0) {
      console.error(`❌ SIGN-UP: User already exists: ${normalizedEmail}, verified: ${existingUsers[0].email_verified}`);
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

    // Create email verification token
    const verificationToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db`
      INSERT INTO email_verifications (id, user_id, token, expires_at, verified, created_at)
      VALUES (${generateUUID()}, ${userId}, ${verificationToken}, ${expiresAt}, false, NOW())
    `;

    // Build verification URL
    const origin = event.headers['x-forwarded-host'] 
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
    
    const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;

    // Send verification email
    const emailResult = await sendVerificationEmail(normalizedEmail, verifyUrl, fullName);
    
    if (!emailResult.ok) {
      console.error('Failed to send verification email:', emailResult.error);
      // Don't fail the signup, just log the error
    }

    console.log(`✅ SIGN-UP: User account created successfully: ${normalizedEmail}`);

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
