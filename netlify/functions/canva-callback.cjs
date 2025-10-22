/**
 * Canva OAuth Callback Function
 * 
 * Handles the OAuth callback from Canva after user authorizes the app.
 * Exchanges the authorization code for an access token, then creates a design
 * with the user's uploaded image.
 * 
 * Environment Variables Required:
 * - CANVA_CLIENT_ID: Your Canva app client ID
 * - CANVA_CLIENT_SECRET: Your Canva app client secret
 * - CANVA_REDIRECT_URI: The OAuth callback URL
 */

const https = require('https');

/**
 * Make HTTPS request helper
 */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code, codeVerifier, clientId, clientSecret, redirectUri) {
  const tokenUrl = 'https://api.canva.com/rest/v1/oauth/token';
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(params.toString())
    }
  };

  return httpsRequest(tokenUrl, options, params.toString());
}

/**
 * Create a design in Canva
 */
async function createCanvaDesign(accessToken, width, height, title = 'Banner Design') {
  const createUrl = 'https://api.canva.com/rest/v1/designs';
  
  // Convert inches to pixels at 150 DPI
  const widthPx = Math.round(parseFloat(width) * 150);
  const heightPx = Math.round(parseFloat(height) * 150);
  
  const designData = {
    design_type: 'Custom',
    asset_type: 'Poster',
    title: title,
    width: {
      value: widthPx,
      unit: 'px'
    },
    height: {
      value: heightPx,
      unit: 'px'
    }
  };

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  return httpsRequest(createUrl, options, JSON.stringify(designData));
}

exports.handler = async (event, context) => {
  console.log('🔄 Canva Callback - Processing OAuth callback');

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
    const { code, state, error, error_description } = params;

    // Check for OAuth errors
    if (error) {
      console.error('❌ OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          'Location': `https://www.bannersonthefly.com/design?error=${encodeURIComponent(error_description || error)}`
        },
        body: ''
      };
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('❌ Missing code or state parameter');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Parse state (format: "orderId:codeVerifier:userId:width:height")
    const [orderId, codeVerifier, userId, width, height] = state.split(':');

    if (!orderId || !codeVerifier || !userId) {
      console.error('❌ Invalid state parameter');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid state parameter' })
      };
    }

    // Get environment variables
    const clientId = process.env.CANVA_CLIENT_ID;
    const clientSecret = process.env.CANVA_CLIENT_SECRET;
    const redirectUri = process.env.CANVA_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing Canva configuration');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Canva integration not configured' })
      };
    }

    console.log('🔑 Exchanging code for access token...');
    const tokenResponse = await exchangeCodeForToken(
      code,
      codeVerifier,
      clientId,
      clientSecret,
      redirectUri
    );

    const { access_token, refresh_token, expires_in } = tokenResponse;

    if (!access_token) {
      console.error('❌ No access token received');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to obtain access token' })
      };
    }

    console.log('✅ Access token obtained');

    // Create a design in Canva if dimensions are provided
    let designId = null;
    let editUrl = null;

    if (width && height) {
      console.log('🎨 Creating Canva design:', { width, height });
      const designResponse = await createCanvaDesign(
        access_token,
        width,
        height,
        `Banner ${orderId}`
      );

      designId = designResponse.design?.id;
      editUrl = designResponse.design?.urls?.edit_url;

      console.log('✅ Design created:', { designId, editUrl });
    }

    // Redirect back to the site with the design info
    const redirectUrl = new URL('https://www.bannersonthefly.com/design/canva-editor');
    redirectUrl.searchParams.set('orderId', orderId);
    redirectUrl.searchParams.set('userId', userId);
    
    if (designId) {
      redirectUrl.searchParams.set('designId', designId);
    }
    
    if (editUrl) {
      redirectUrl.searchParams.set('editUrl', editUrl);
    }

    // Store access token in query param (temporary - should use session/database in production)
    redirectUrl.searchParams.set('token', access_token);

    console.log('✅ Redirecting to:', redirectUrl.pathname);

    return {
      statusCode: 302,
      headers: {
        'Location': redirectUrl.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
    };

  } catch (error) {
    console.error('❌ Error in canva-callback:', error);
    
    return {
      statusCode: 302,
      headers: {
        'Location': `https://www.bannersonthefly.com/design?error=${encodeURIComponent(error.message)}`
      },
      body: ''
    };
  }
};
