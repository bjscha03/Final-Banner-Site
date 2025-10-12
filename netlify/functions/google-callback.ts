import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query as neonQuery } from '@neondatabase/serverless';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://bannersonthefly.com/.netlify/functions/google-callback';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const { code, state, error, error_description } = event.queryStringParameters || {};

  if (error) {
    return {
      statusCode: 302,
      headers: {
        Location: '/sign-in?error=' + encodeURIComponent(error_description || error),
      },
      body: '',
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing authorization code' }),
    };
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Google token error:', errorData);
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=' + encodeURIComponent('Failed to get access token'),
        },
        body: '',
      };
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: 'Bearer ' + tokenData.access_token,
      },
    });

    if (!userInfoResponse.ok) {
      console.error('Google userinfo error:', await userInfoResponse.text());
      return {
        statusCode: 302,
        headers: {
          Location: '/sign-in?error=' + encodeURIComponent('Failed to get user info'),
        },
        body: '',
      };
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json();

    const existingUserResult = await neonQuery(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [googleUser.email]
    );

    let user;

    if (existingUserResult.rows.length > 0) {
      user = existingUserResult.rows[0];
      
      if (!user.google_id) {
        await neonQuery(
          'UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2',
          [googleUser.id, user.id]
        );
        user.google_id = googleUser.id;
      }
    } else {
      const insertResult = await neonQuery(
        'INSERT INTO users (email, google_id, ai_credits, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *',
        [googleUser.email, googleUser.id, 3]
      );
      user = insertResult.rows[0];
    }

    const html = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Signing in...</title>' +
'  <style>' +
'    body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }' +
'    .container { background: white; padding: 3rem; border-radius: 1rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px; }' +
'    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }' +
'    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }' +
'    h2 { color: #333; margin: 0 0 0.5rem; }' +
'    p { color: #666; margin: 0; }' +
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
'      const user = ' + JSON.stringify(user) + ';' +
'      localStorage.setItem(\'banners_current_user\', JSON.stringify(user));' +
'      window.location.href = \'/\';' +
'    } catch (error) {' +
'      console.error(\'Error storing user:\', error);' +
'      window.location.href = \'/\';' +
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

  } catch (error) {
    console.error('Google OAuth error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: '/sign-in?error=' + encodeURIComponent('Authentication failed'),
      },
      body: '',
    };
  }
};
