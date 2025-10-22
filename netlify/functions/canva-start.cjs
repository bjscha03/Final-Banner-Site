/**
 * Canva Start Function
 * 
 * Initiates the Canva OAuth flow to authorize the user and start a design session.
 * Uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for security.
 * 
 * Environment Variables Required:
 * - CANVA_CLIENT_ID: Your Canva app client ID
 * - CANVA_REDIRECT_URI: The OAuth callback URL
 * - CANVA_SCOPES: Space-separated list of required scopes
 */

const crypto = require('crypto');

/**
 * Generate code verifier and code challenge for PKCE
 */
function generatePKCE() {
  // Generate code verifier (43-128 characters, URL-safe base64)
  const codeVerifier = crypto.randomBytes(96).toString('base64url');
  
  // Generate code challenge (SHA-256 hash of verifier, URL-safe base64)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

exports.handler = async (event, context) => {
  console.log('🎨 Canva Start - Initiating OAuth flow');
  
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const { orderId, width, height, userId } = params;

    // Validate required parameters
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

    // Get environment variables
    const clientId = process.env.CANVA_CLIENT_ID;
    const redirectUri = process.env.CANVA_REDIRECT_URI;
    const scopes = process.env.CANVA_SCOPES || 'design:content:read design:content:write asset:read asset:write';

    if (!clientId || !redirectUri) {
      console.error('❌ Missing Canva configuration');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Canva integration not configured' })
      };
    }

    // Generate PKCE values
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Create state parameter (format: "orderId:codeVerifier:userId:width:height")
    // We include codeVerifier in state so we can retrieve it in the callback
    const state = `${orderId}:${codeVerifier}:${userId}:${width || ''}:${height || ''}`;

    // Build Canva OAuth authorization URL
    const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', redirectUri);

    const finalUrl = authUrl.toString();
    console.log('✅ Redirecting to Canva OAuth:', { orderId, userId });

    // Redirect the user to Canva's authorization page
    return {
      statusCode: 302,
      headers: {
        'Location': finalUrl,
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
