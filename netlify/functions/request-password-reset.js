const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Generate secure random token
function generateSecureToken(bytes = 32) {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('hex');
}

// Generate UUID
function generateUUID() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

// Send email using existing email system
async function sendEmail(type, payload) {
  try {
    // Import the email functions
    const { Resend } = require('resend');
    
    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;
    
    if (type === 'user.reset') {
      subject = 'Reset Your Password - Banners On The Fly';
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Reset Your Password</h2>
          <p>Hello ${payload.userName || 'there'},</p>
          <p>You requested to reset your password for your Banners On The Fly account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.resetUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6b7280;">${payload.resetUrl}</p>
          <p style="color: #6b7280; font-size: 14px;">
            This link will expire in 60 minutes. If you didn't request this password reset, you can safely ignore this email.
          </p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Banners On The Fly<br>
            Custom Banner Printing Services
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
    const { email } = JSON.parse(event.body || '{}');
    
    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Email is required' })
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
      SELECT id, email FROM profiles WHERE email = ${normalizedEmail}
    `;
    
    // Always return success to prevent email enumeration
    if (users.length === 0) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true })
      };
    }

    const user = users[0];
    const token = generateSecureToken(32); // 64 character hex string
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes from now

    // Create/upsert password reset entry
    await db`
      INSERT INTO password_resets (id, user_id, token, expires_at, used, created_at)
      VALUES (${generateUUID()}, ${user.id}, ${token}, ${expiresAt}, false, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        token = EXCLUDED.token,
        expires_at = EXCLUDED.expires_at,
        used = false,
        created_at = NOW()
    `;

    // Build reset URL using origin from headers or env var
    const origin = event.headers['x-forwarded-host'] 
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
    
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Send reset email
    const emailResult = await sendEmail('user.reset', {
      to: normalizedEmail,
      resetUrl,
      userName: user.email.split('@')[0] // Use email prefix as fallback name
    });

    // Log email attempt
    await logEmailAttempt({
      type: 'user.reset',
      to: normalizedEmail,
      status: emailResult.ok ? 'sent' : 'error',
      providerMsgId: emailResult.ok ? emailResult.id : undefined,
      errorMessage: emailResult.ok ? undefined : `${emailResult.error} ${emailResult.details ? JSON.stringify(emailResult.details) : ''}`.trim()
    });

    if (!emailResult.ok) {
      console.error('Password reset email failed:', emailResult);
      // Still return success to prevent information leakage
    } else {
      console.log(`Password reset email sent successfully to ${normalizedEmail}, token expires at ${expiresAt.toISOString()}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };

  } catch (error) {
    console.error('Password reset request failed:', error);
    
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
