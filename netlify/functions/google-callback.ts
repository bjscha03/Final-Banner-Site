/**
 * Google OAuth - Callback Handler
 * Fixed to match LinkedIn callback pattern
 */

import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

export const handler: Handler = async (event) => {
  console.log('🔵 Google callback triggered');
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

    // Check for Google OAuth errors
    if (error) {
      console.error('Google OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=' + encodeURIComponent(error_description || error),
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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Google OAuth credentials not configured');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Google OAuth not configured',
        },
        body: '',
      };
    }

    // Step 1: Exchange authorization code for access token
    console.log('🔵 Exchanging code for access token...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
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

    // Step 2: Fetch user profile from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to fetch Google user info');
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=Failed to fetch user profile',
        },
        body: '',
      };
    }

    const googleUser = await userInfoResponse.json();
    console.log('🔵 Google user info received:', googleUser.email);

    // Step 3: Create or update user in database
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    const sql = neon(dbUrl);

    const normalizedEmail = googleUser.email?.toLowerCase();

    // Check if user already exists with this email
    const existingUsers = await sql`
      SELECT * FROM profiles
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    let user: any;

    if (existingUsers.length > 0) {
      // USER EXISTS - Link Google to existing account
      const existingUser = existingUsers[0];
      console.log('🔵 Existing user found, linking Google OAuth');

      // Update the existing user with Google OAuth info
      await sql`
        UPDATE profiles
        SET google_id = ${googleUser.id},
            updated_at = NOW()
        WHERE id = ${existingUser.id}
      `;

      user = {
        ...existingUser,
        google_id: googleUser.id,
      };

      console.log('🔵 Linked Google to existing account');
    } else {
      // NEW USER - Create account with Google OAuth
      console.log('🔵 Creating new user with Google OAuth');

      const newUsers = await sql`
        INSERT INTO profiles (
          email,
          google_id,
          email_verified,
          created_at,
          updated_at
        ) VALUES (
          ${normalizedEmail},
          ${googleUser.id},
          true,
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      user = newUsers[0];

      // Grant 10 free AI credits for new users (if table exists)
      try {
        await sql`
          INSERT INTO ai_credits (user_id, credits_remaining, credits_total, created_at, updated_at)
          VALUES (${user.id}, 10, 10, NOW(), NOW())
        `;
        console.log('🔵 New user created with 10 free AI credits');
      } catch (creditsError: any) {
        console.warn('⚠️ Could not grant AI credits (table may not exist):', creditsError.message);
        console.log('🔵 New user created (AI credits skipped)');
      }
      
      console.log('�� New user details:', { id: user.id, email: user.email, email_verified: user.email_verified });
    }

    console.log('🔵 Final user object before creating safeUser:', { id: user.id, email: user.email, email_verified: user.email_verified, is_admin: user.is_admin });

    // Create safe user object (exclude sensitive fields)
    const safeUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      email_verified: user.email_verified || true,
      is_admin: user.is_admin || false,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    // Return HTML page that stores user in localStorage and redirects
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signing in...</title>
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
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
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
    h2 { color: #333; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0; }
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
      const user = ${JSON.stringify(safeUser)};
      console.log('✅ Google OAuth: Storing user in localStorage:', user);
      localStorage.setItem('banners_current_user', JSON.stringify(user));
      
      // Verify storage was successful
      const stored = localStorage.getItem('banners_current_user');
      if (!stored) {
        throw new Error('Failed to store user in localStorage');
      }
      
      console.log('✅ Google OAuth: User stored successfully, verified');
      
      // CRITICAL FIX: Dispatch user-changed event to trigger cart reload
      // This ensures the cart loads immediately for Google OAuth users
      // (Manual login already does this in auth.ts signIn() function)
      console.log('🔔 Google OAuth: Dispatching user-changed event to trigger cart reload');
      window.dispatchEvent(new Event('user-changed'));
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'banners_current_user',
        newValue: JSON.stringify(user),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }));
      console.log('✅ Google OAuth: Events dispatched successfully');
      
      // Check for checkout context to determine redirect
      let redirectUrl = '/?oauth=success&provider=google';
      try {
        const checkoutContext = localStorage.getItem('checkout-context-storage');
        if (checkoutContext) {
          const context = JSON.parse(checkoutContext);
          if (context?.state?.isInCheckoutFlow && context?.state?.returnUrl) {
            const contextAge = Date.now() - (context.state.contextSetAt || 0);
            const maxAge = 30 * 60 * 1000; // 30 minutes
            
            if (contextAge < maxAge) {
              redirectUrl = context.state.returnUrl + '?oauth=success&provider=google';
              console.log('✅ Google OAuth: Checkout context found, redirecting to:', redirectUrl);
              
              // Clear checkout context after using it
              localStorage.removeItem('checkout-context-storage');
            } else {
              console.log('⏰ Google OAuth: Checkout context expired, using default redirect');
            }
          }
        }
      } catch (e) {
        console.error('❌ Google OAuth: Error checking checkout context:', e);
      }
      
      console.log('✅ Google OAuth: Redirecting to:', redirectUrl);
      
      // Small delay to ensure localStorage is fully written and events are processed
      setTimeout(() => {
        window.location.replace(redirectUrl);
      }, 250);
    } catch (error) {
      console.error('❌ Google OAuth: Error storing user:', error);
      alert('Error completing sign-in: ' + error.message);
      window.location.replace('/sign-in?error=Failed to complete sign-in');
    }
  </script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html,
    };

  } catch (error: any) {
    console.error('❌ Google OAuth error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: '/sign-in?error=' + encodeURIComponent('Authentication failed: ' + error.message),
      },
      body: '',
    };
  }
};
