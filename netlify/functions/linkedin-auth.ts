/**
 * LinkedIn OAuth - Initiate Authentication Flow
 * 
 * This function starts the LinkedIn OAuth flow by redirecting the user
 * to LinkedIn's authorization page.
 */

import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      console.error('❌ LinkedIn OAuth credentials not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'LinkedIn OAuth not configured. Please contact support.',
        }),
      };
    }

    // Generate a random state parameter for CSRF protection
    const state = Math.random().toString(36).substring(2, 15) + 
                  Math.random().toString(36).substring(2, 15);

    // Build LinkedIn authorization URL
    const scope = 'openid profile email';
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);

    console.log('🔗 LinkedIn OAuth: Redirecting to authorization URL');
    console.log('   Redirect URI:', redirectUri);
    console.log('   State:', state);

    // Return the authorization URL to the client
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        authUrl: authUrl.toString(),
        state,
      }),
    };

  } catch (error: any) {
    console.error('❌ LinkedIn OAuth initiation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Failed to initiate LinkedIn authentication',
      }),
    };
  }
};
