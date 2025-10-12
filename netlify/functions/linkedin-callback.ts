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
 * - Redirects to HOME PAGE after successful sign-in
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

    console.log('✅ Authorization code received');

    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', errorText);
      throw new Error('Failed to exchange authorization code for access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Access token obtained');

    // Fetch user profile
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error('❌ Profile fetch failed:', errorText);
      throw new Error('Failed to fetch user profile');
    }

    const profile = await profileResponse.json();
    console.log('✅ User profile fetched:', profile);

    // Connect to database
    const sql = neon(process.env.DATABASE_URL!);

    // Check if user exists with this email
    const existingUsers = await sql`
      SELECT * FROM users WHERE email = ${profile.email}
    `;

    let user;

    if (existingUsers.length > 0) {
      // User exists - update with LinkedIn info
      const existingUser = existingUsers[0];
      console.log('✅ Found existing user with email:', profile.email);

      const updatedUsers = await sql`
        UPDATE users 
        SET 
          oauth_provider = 'linkedin',
          oauth_id = ${profile.sub},
          full_name = ${profile.name || existingUser.full_name},
          username = ${profile.given_name?.toLowerCase() || existingUser.username}
        WHERE id = ${existingUser.id}
        RETURNING *
      `;

      user = updatedUsers[0];
      console.log('✅ Updated existing user with LinkedIn OAuth');
    } else {
      // Create new user
      console.log('✅ Creating new user for:', profile.email);

      const newUsers = await sql`
        INSERT INTO users (email, full_name, username, oauth_provider, oauth_id, is_admin)
        VALUES (
          ${profile.email},
          ${profile.name || 'LinkedIn User'},
          ${profile.given_name?.toLowerCase() || profile.email.split('@')[0]},
          'linkedin',
          ${profile.sub},
          false
        )
        RETURNING *
      `;

      user = newUsers[0];
      console.log('✅ New user created');
    }

    // Return HTML page that stores user in localStorage and redirects
    const htmlResponse = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signing In...</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 3rem 2.5rem;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 450px;
    }
    .spinner {
      border: 5px solid #f3f3f3;
      border-top: 5px solid #0077b5;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 { 
      color: #0077b5; 
      margin: 0 0 0.5rem; 
      font-size: 1.75rem;
      font-weight: 700;
    }
    p { 
      color: #666; 
      margin: 0;
      font-size: 1.1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Welcome!</h2>
    <p>Completing your sign-in...</p>
  </div>
  <script>
    try {
      const user = ${JSON.stringify(user)};
      
      // Store user in localStorage
      localStorage.setItem('banners_current_user', JSON.stringify(user));
      
      // Redirect to HOME PAGE after successful sign-in
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
      
    } catch (error) {
      console.error('❌ Error storing user:', error);
      setTimeout(() => {
        window.location.href = '/sign-in?error=' + encodeURIComponent('Failed to complete sign-in');
      }, 2000);
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
