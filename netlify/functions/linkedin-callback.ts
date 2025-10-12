/**
 * LinkedIn OAuth - Callback Handler (FIXED VERSION with Account Linking)
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
 */

import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { code, state, error, error_description } = event.queryStringParameters || {};

    // Check for LinkedIn OAuth errors
    if (error) {
      console.error('❌ LinkedIn OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          Location: `/sign-in?error=${encodeURIComponent(error_description || error)}`,
        },
        body: '',
      };
    }

    if (!code) {
      console.error('❌ No authorization code received');
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
      console.error('❌ LinkedIn OAuth credentials not configured');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=LinkedIn OAuth not configured',
        },
        body: '',
      };
    }

    console.log('🔗 LinkedIn OAuth: Exchanging code for access token');

    // Step 1: Exchange authorization code for access token
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
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', errorText);
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

    console.log('✅ Access token obtained');

    // Step 2: Fetch user profile from LinkedIn
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error('❌ Profile fetch failed:', errorText);
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Failed to fetch LinkedIn profile',
        },
        body: '',
      };
    }

    const profile = await profileResponse.json();
    
    console.log('✅ LinkedIn profile fetched:', {
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
    });

    // Step 3: Check database for existing user with same email (ACCOUNT LINKING)
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ Database URL not configured');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Database not configured',
        },
        body: '',
      };
    }

    const db = neon(dbUrl);
    const normalizedEmail = profile.email.toLowerCase().trim();

    // Check if user already exists with this email
    const existingUsers = await db`
      SELECT id, email, full_name, username, is_admin, oauth_provider, oauth_id
      FROM profiles
      WHERE email = ${normalizedEmail}
    `;

    let user;

    if (existingUsers.length > 0) {
      // USER EXISTS - Link LinkedIn to existing account
      const existingUser = existingUsers[0];
      console.log('🔗 Linking LinkedIn to existing account:', existingUser.id);

      // Update the existing user with LinkedIn OAuth info
      await db`
        UPDATE profiles
        SET 
          oauth_provider = 'linkedin',
          oauth_id = ${profile.sub},
          full_name = COALESCE(full_name, ${profile.name || profile.given_name + ' ' + profile.family_name})
        WHERE id = ${existingUser.id}
      `;

      user = {
        id: existingUser.id, // IMPORTANT: Use existing user ID to preserve orders and credits
        email: existingUser.email,
        full_name: existingUser.full_name || profile.name,
        username: existingUser.username,
        is_admin: existingUser.is_admin || false,
        oauth_provider: 'linkedin',
        oauth_id: profile.sub,
      };

      console.log('✅ Account linked successfully - existing user ID:', user.id);
    } else {
      // NEW USER - Create new account
      console.log('🆕 Creating new user account for:', normalizedEmail);

      const newUserId = `linkedin_${profile.sub}`;
      
      // Insert new user into database
      await db`
        INSERT INTO profiles (id, email, full_name, username, is_admin, oauth_provider, oauth_id, email_verified)
        VALUES (
          ${newUserId},
          ${normalizedEmail},
          ${profile.name || profile.given_name + ' ' + profile.family_name},
          ${profile.email?.split('@')[0]},
          false,
          'linkedin',
          ${profile.sub},
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          oauth_provider = 'linkedin',
          oauth_id = ${profile.sub}
      `;

      user = {
        id: newUserId,
        email: normalizedEmail,
        full_name: profile.name || profile.given_name + ' ' + profile.family_name,
        username: profile.email?.split('@')[0],
        is_admin: false,
        oauth_provider: 'linkedin',
        oauth_id: profile.sub,
      };

      console.log('✅ New user created:', user.id);
    }

    // Return HTML that stores user in localStorage and redirects
    const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
  <title>LinkedIn Sign In</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #0077b5;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 { color: #333; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0; }
    .success { color: #0077b5; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2 class="success">Welcome back!</h2>
    <p>Signing you in with LinkedIn...</p>
  </div>
  <script>
    try {
      const user = ${JSON.stringify(user)};
      localStorage.setItem('banners_current_user', JSON.stringify(user));
      console.log('✅ User stored in localStorage:', user.email);
      console.log('✅ User ID:', user.id);
      
      // Redirect to design page after successful sign-in
      setTimeout(() => {
        window.location.href = '/design';
      }, 1000);
    } catch (error) {
      console.error('❌ Error storing user:', error);
      window.location.href = '/sign-in?error=Failed to complete sign-in';
    }
  </script>
</body>
</html>
    `;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: htmlResponse,
    };

  } catch (error: any) {
    console.error('❌ LinkedIn callback error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `/sign-in?error=${encodeURIComponent(error.message || 'LinkedIn authentication failed')}`,
      },
      body: '',
    };
  }
};
