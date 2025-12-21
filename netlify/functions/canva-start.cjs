/**
 * Canva Start Function
 * 
 * Initiates the Canva OAuth flow to authorize the user and start a design session.
 * Uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for security.
 */

const crypto = require('crypto');

// Try to load config file (local dev), fallback to env vars (production)
let config;
try {
  config = require('./canva-config.cjs');
} catch (e) {
  config = {
    CANVA_CLIENT_ID: process.env.CANVA_CLIENT_ID || 'OC-AZoNewWGWWOm',
    CANVA_CLIENT_SECRET: process.env.CANVA_CLIENT_SECRET,
    CANVA_REDIRECT_URI: 'https://bannersonthefly.com/.netlify/functions/canva-callback',
    CANVA_SCOPES: process.env.CANVA_SCOPES || 'design:content:read design:content:write asset:read asset:write'
  };
}

/**
 * Generate code verifier and code challenge for PKCE
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(96).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

exports.handler = async (event, context) => {
  console.log('🎨 Canva Start - Initiating OAuth flow');
  
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const { orderId, width, height, userId } = params;

    if (!orderId || !userId) {
      console.error('❌ Missing required parameters:', { orderId, userId });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required parameters',
          required: ['orderId', 'userId']
        })
      };
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = `${orderId}:${codeVerifier}:${userId}:${width || ''}:${height || ''}`;

    const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', config.CANVA_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.CANVA_CLIENT_ID);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', config.CANVA_REDIRECT_URI);

    console.log('✅ Redirecting to Canva OAuth:', { orderId, userId });

    return {
      statusCode: 302,
      headers: {
        'Location': authUrl.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
    };

  } catch (error) {
    console.error('❌ Error in canva-start:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
