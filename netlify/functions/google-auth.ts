/**
 * Google OAuth - Initiate Authentication Flow
 * Fixed: Better error logging and state management
 */

import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    console.error(`❌ Invalid HTTP method: ${event.httpMethod}`);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    // Detailed error logging for missing credentials
    if (!clientId) {
      console.error('❌ GOOGLE_CLIENT_ID environment variable is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Google OAuth not configured. Missing GOOGLE_CLIENT_ID.',
        }),
      };
    }

    if (!redirectUri) {
      console.error('❌ GOOGLE_REDIRECT_URI environment variable is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Google OAuth not configured. Missing GOOGLE_REDIRECT_URI.',
        }),
      };
    }

    // Generate CSRF protection state
    const state = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15);

    const scope = 'openid profile email';
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'select_account');

    console.log('✅ Google OAuth URL generated successfully');
    console.log('   Redirect URI:', redirectUri);
    console.log('   State:', state);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        authUrl: authUrl.toString(),
        state: state, // Return state so frontend can store it
      }),
    };
  } catch (error: any) {
    console.error('❌ Google auth error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Failed to initiate Google authentication',
      }),
    };
  }
};
