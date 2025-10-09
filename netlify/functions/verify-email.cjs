const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
    const { token } = JSON.parse(event.body || '{}');
    
    if (!token || typeof token !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Verification token is required' })
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

    // Find valid verification token
    let verificationTokens;
    try {
      verificationTokens = await db`
        SELECT ev.id, ev.user_id, ev.expires_at, ev.verified, ev.verified_at, p.email
        FROM email_verifications ev
        JOIN profiles p ON p.id = ev.user_id
        WHERE ev.token = ${token}
      `;
    } catch (dbError) {
      console.error('Database query failed:', dbError);

      // Check if it's a missing table error
      if (dbError.message && dbError.message.includes('email_verifications')) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            ok: false,
            error: 'Email verification system not properly configured. Please contact support.',
            details: 'Missing email_verifications table'
          })
        };
      }

      throw dbError; // Re-throw other database errors
    }
    
    if (verificationTokens.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid or expired verification token' })
      };
    }

    const verificationToken = verificationTokens[0];
    
    // Check if token is expired
    if (new Date() > new Date(verificationToken.expires_at)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'Verification token has expired' })
      };
    }

    // Check if already verified
    if (verificationToken.verified || verificationToken.verified_at) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, message: 'Email already verified' })
      };
    }

    // Mark email as verified
    await db`
      UPDATE email_verifications
      SET verified = true, verified_at = NOW()
      WHERE id = ${verificationToken.id}
    `;

    // Update user profile to mark email as verified
    await db`
      UPDATE profiles
      SET email_verified = true, email_verified_at = NOW()
      WHERE id = ${verificationToken.user_id}
    `;

    console.log(`Email verification completed successfully for user: ${verificationToken.email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, message: 'Email verified successfully' })
    };

  } catch (error) {
    console.error('Email verification failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
