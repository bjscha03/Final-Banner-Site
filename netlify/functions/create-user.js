const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

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

// Send email using existing email system
async function sendEmail(type, payload) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;

    if (type === 'user.verify') {
      subject = 'Welcome to Banners On The Fly - Verify Your Email';
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Welcome to Banners On The Fly!</h2>
          <p>Hello ${payload.userName || 'there'},</p>
          <p>Thank you for signing up for Banners On The Fly! To complete your account setup and start creating custom banners, please verify your email address by clicking the button below.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.verifyUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Confirm Email Address
            </a>
          </div>

          <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6b7280;">${payload.verifyUrl}</p>

          <p style="color: #6b7280; font-size: 14px;">
            This verification link will expire in 24 hours for security reasons.
          </p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Questions? Contact us at support@bannersonthefly.com<br>
            Banners On The Fly - Custom Banner Printing Services
          </p>
        </div>
      `;
    } else {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    const result = await resend.emails.send({
      from: emailFrom,
      to: payload.to,
      replyTo: emailReplyTo,
      subject,
      html
    });

    return { ok: true, id: result.data?.id };
  } catch (error) {
    console.error('Email send error:', error);
    return {
      ok: false,
      error: error.message || 'Email send failed',
      details: error
    };
  }
}

// Log email attempt to database
async function logEmailAttempt(attempt) {
  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;

    const db = neon(dbUrl);
    await db`
      INSERT INTO email_events (type, to_email, provider_msg_id, status, error_message, order_id, created_at)
      VALUES (
        ${attempt.type},
        ${attempt.to},
        ${attempt.providerMsgId || null},
        ${attempt.status},
        ${attempt.errorMessage || null},
        ${attempt.orderId || null},
        NOW()
      )
    `;
  } catch (error) {
    console.error('Failed to log email attempt:', error);
  }
}

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

    const { id, email, username, full_name, is_admin, is_signup } = userData;

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

    // For sign up, check if email or username already exists
    // For sign in, allow updating existing profiles
    const existingUser = await sql`
      SELECT id, email, username FROM profiles WHERE email = ${email}
    `;

    // Check if username already exists (only for sign up)
    let existingUsername = [];
    if (is_signup && username) {
      existingUsername = await sql`
        SELECT id, username FROM profiles WHERE username = ${username}
      `;
    }

    let result;

    // Check if username already exists (for sign up)
    if (is_signup && existingUsername.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Username already exists',
          details: 'This username is already taken. Please choose a different one.'
        }),
      };
    }

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
          SET username = ${username || null},
              full_name = ${full_name || null},
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
        INSERT INTO profiles (id, email, username, full_name, is_admin)
        VALUES (${id}, ${email}, ${username || null}, ${full_name || null}, ${is_admin || false})
        RETURNING *
      `;

      // If this is a signup, send verification email
      if (is_signup) {
        console.log('Sending verification email for new signup:', email);

        // Generate verification token
        const verificationToken = generateSecureToken(32);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        // Store verification token
        try {
          await sql`
            INSERT INTO email_verifications (id, user_id, token, expires_at, created_at)
            VALUES (${generateUUID()}, ${id}, ${verificationToken}, ${expiresAt}, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
              token = EXCLUDED.token,
              expires_at = EXCLUDED.expires_at,
              verified = false,
              created_at = NOW()
          `;

          // Build verification URL
          const origin = process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
          const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;

          // Send verification email
          const emailResult = await sendEmail('user.verify', {
            to: email,
            verifyUrl,
            userName: username || full_name || email.split('@')[0]
          });

          // Log email attempt
          await logEmailAttempt({
            type: 'user.verify',
            to: email,
            status: emailResult.ok ? 'sent' : 'error',
            providerMsgId: emailResult.ok ? emailResult.id : undefined,
            errorMessage: emailResult.ok ? undefined : `${emailResult.error} ${emailResult.details ? JSON.stringify(emailResult.details) : ''}`.trim()
          });

          if (emailResult.ok) {
            console.log(`Verification email sent successfully to ${email}, token expires at ${expiresAt.toISOString()}`);
          } else {
            console.error('Verification email failed:', emailResult);
          }
        } catch (emailError) {
          console.error('Failed to send verification email:', emailError);
          // Don't fail user creation if email fails
        }
      }
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
