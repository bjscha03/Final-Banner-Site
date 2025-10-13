/**
 * LinkedIn OAuth - Callback Handler (PRODUCTION VERSION)
 *
 * This function handles the callback from LinkedIn after user authorization,
 * exchanges the authorization code for an access token, fetches user profile,
 * and creates/links the user account.
 *
 * KEY FEATURES:
 * - Checks database for existing users with same email
 * - Links LinkedIn OAuth to existing email/password accounts
 * - Prevents duplicate accounts for same email
 * - Ensures AI credits and orders are preserved
 * - Redirects to HOME PAGE after successful sign-in
 */

import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

export const handler: Handler = async (event) => {
  console.log('🔵 LinkedIn callback triggered');
  console.log('🔵 Query params:', event.queryStringParameters);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { code, state, error, error_description } = event.queryStringParameters || {};
    console.log('🔵 Code:', code ? 'present' : 'missing');
    console.log('🔵 Error:', error);

    // Check for LinkedIn OAuth errors
    if (error) {
      console.error('LinkedIn OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=' + encodeURIComponent(error_description || error) + '',
        },
        body: '',
      };
    }

    if (!code) {
      console.error('No authorization code received');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=No authorization code received',
        },
        body: '',
      };
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('LinkedIn OAuth credentials not configured');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=LinkedIn OAuth not configured',
        },
        body: '',
      };
    }

    // Step 1: Exchange authorization code for access token
    console.log('🔵 Exchanging code for access token...');
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('❌ Token exchange failed. Status:', tokenResponse.status);
      console.error('❌ Error data:', errorData);
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Failed to exchange authorization code',
        },
        body: '',
      };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('🔵 Access token received');

    // Step 2: Fetch user profile from LinkedIn
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      console.error('Failed to fetch LinkedIn profile');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Failed to fetch user profile',
        },
        body: '',
      };
    }

    const profile = await profileResponse.json();

    // Step 3: Create or update user in database
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    const sql = neon(dbUrl);

    const normalizedEmail = profile.email?.toLowerCase();

    // Check if user already exists with this email
    const existingUsers = await sql`
      SELECT * FROM profiles
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    let user: any;

    if (existingUsers.length > 0) {
      // USER EXISTS - Link LinkedIn to existing account
      const existingUser = existingUsers[0];

      // Update the existing user with LinkedIn OAuth info
      await sql`
        UPDATE profiles
        SET
          oauth_provider = 'linkedin',
          oauth_id = ${profile.sub},
          full_name = COALESCE(full_name, ${profile.name}),
          avatar_url = COALESCE(avatar_url, ${profile.picture}),
          updated_at = NOW()
        WHERE id = ${existingUser.id}
      `;

      user = existingUser;
    } else {
      // NEW USER - Create account
      const newUsers = await sql`
        INSERT INTO profiles (
          id,
          email,
          full_name,
          oauth_provider,
          oauth_id,
          avatar_url,
          email_verified,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          ${normalizedEmail},
          ${profile.name},
          'linkedin',
          ${profile.sub},
          ${profile.picture},
          true,
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      user = newUsers[0];

      // Initialize AI credits for new user (10 free credits)
      await sql`
        INSERT INTO ai_credits (user_id, credits_remaining, credits_total, created_at, updated_at)
        VALUES (${user.id}, 10, 10, NOW(), NOW())
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    // Step 4: Create session token
    const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await sql`
      INSERT INTO sessions (user_id, token, expires_at, created_at)
      VALUES (${user.id}, ${sessionToken}, ${expiresAt.toISOString()}, NOW())
    `;

    // Step 5: Create safe user object (exclude password)
    const safeUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      oauth_provider: user.oauth_provider,
      oauth_id: user.oauth_id,
      email_verified: user.email_verified,
      is_admin: user.is_admin || false,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    // Step 6: Return HTML page that stores user in localStorage and redirects
    const html = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Signing in...</title>' +
'  <style>' +
'    body {' +
'      font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;' +
'      display: flex;' +
'      align-items: center;' +
'      justify-content: center;' +
'      min-height: 100vh;' +
'      margin: 0;' +
'      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);' +
'    }' +
'    .container {' +
'      background: white;' +
'      padding: 3rem;' +
'      border-radius: 1rem;' +
'      box-shadow: 0 20px 60px rgba(0,0,0,0.3);' +
'      text-align: center;' +
'      max-width: 400px;' +
'    }' +
'    .spinner {' +
'      border: 4px solid #f3f3f3;' +
'      border-top: 4px solid #667eea;' +
'      border-radius: 50%;' +
'      width: 50px;' +
'      height: 50px;' +
'      animation: spin 1s linear infinite;' +
'      margin: 0 auto 1.5rem;' +
'    }' +
'    @keyframes spin {' +
'      0% { transform: rotate(0deg); }' +
'      100% { transform: rotate(360deg); }' +
'    }' +
'    h2 {' +
'      color: #333;' +
'      margin: 0 0 0.5rem;' +
'    }' +
'    p {' +
'      color: #666;' +
'      margin: 0;' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="container">' +
'    <div class="spinner"></div>' +
'    <h2>Welcome!</h2>' +
'    <p>Completing your sign-in...</p>' +
'  </div>' +
'  <script>' +
'    try {' +
'      const user = ' + JSON.stringify(safeUser) + ';' +
'      console.log(\'✅ LinkedIn OAuth: Storing user\', user.email);' +
'      console.log(\'✅ LinkedIn OAuth: Storing user\', user.email);' +
'      localStorage.setItem(\'banners_current_user\', JSON.stringify(user));' +
'      console.log(\'✅ LinkedIn OAuth: Redirecting to home\');' +
'      console.log(\'✅ LinkedIn OAuth: Redirecting to home\');' +
'      window.location.href = \'/sign-in?error=\' + encodeURIComponent(error.message);' +
'    } catch (error) {' +
'      console.error(\'❌ LinkedIn OAuth: Error storing user:\', error);' +
'      alert(\'Error completing sign-in: \' + error.message);' +
'      window.location.href = \'/sign-in?error=\' + encodeURIComponent(error.message);' +
'    }' +
'  </script>' +
'</body>' +
'</html>';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html,
    };
  } catch (error: any) {
    console.error('LinkedIn callback error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: '/sign-in?error=' + encodeURIComponent(error.message || 'LinkedIn authentication failed') + '',
      },
      body: '',
    };
  }
};
