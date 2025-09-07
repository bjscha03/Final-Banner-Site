import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { sendEmail, logEmailAttempt } from '../../src/lib/email';
import { generateSecureToken, generateUUID } from '../../src/lib/crypto';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const handler: Handler = async (event) => {
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
