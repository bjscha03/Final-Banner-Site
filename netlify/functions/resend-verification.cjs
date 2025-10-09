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
      subject: 'Banners On The Fly - Verify Your Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Verify Your Email Address</h2>
          <p>Hello ${userName || 'there'},</p>
          <p>Please verify your email address by clicking the button below to complete your account setup.</p>

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

    // Check if user exists
    const users = await db`
      SELECT id, email, full_name, email_verified
      FROM profiles 
      WHERE email = ${normalizedEmail}
    `;
    
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ ok: false, error: 'No account found with this email address' })
      };
    }

    const user = users[0];

    // Check if already verified
    if (user.email_verified) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'This email address is already verified' })
      };
    }

    // Check rate limiting - get last resend time
    const recentVerifications = await db`
      SELECT created_at
      FROM email_verifications 
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (recentVerifications.length > 0) {
      const lastResend = new Date(recentVerifications[0].created_at);
      const now = new Date();
      const timeDiff = (now - lastResend) / 1000; // seconds
      
      if (timeDiff < 60) { // 60 second cooldown
        const waitTime = Math.ceil(60 - timeDiff);
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ 
            ok: false, 
            error: `Please wait ${waitTime} seconds before requesting another verification email` 
          })
        };
      }
    }

    // Generate new verification token
    const verificationToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update/replace existing verification token
    await db`
      INSERT INTO email_verifications (id, user_id, token, expires_at, verified, created_at)
      VALUES (gen_random_uuid(), ${user.id}, ${verificationToken}, ${expiresAt}, false, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        token = EXCLUDED.token,
        expires_at = EXCLUDED.expires_at,
        verified = false,
        created_at = NOW()
    `;

    // Build verification URL
    const origin = event.headers['x-forwarded-host'] 
      ? `https://${event.headers['x-forwarded-host']}`
      : process.env.PUBLIC_SITE_URL || 'https://www.bannersonthefly.com';
    
    const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;

    // Send verification email
    const emailResult = await sendVerificationEmail(normalizedEmail, verifyUrl, user.full_name);
    
    if (!emailResult.ok) {
      console.error('Failed to send verification email:', emailResult.error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Failed to send verification email. Please try again.' 
        })
      };
    }

    console.log(`Verification email resent successfully to: ${normalizedEmail}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        message: 'Verification email sent successfully'
      })
    };

  } catch (error) {
    console.error('Resend verification failed:', error);
    
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
