/**
 * Canva Get Edit URL Function
 * 
 * Gets the edit URL for an existing Canva design using the design ID.
 * This allows users to re-edit their Canva designs from the cart.
 */

const https = require('https');
const { neon } = require('@neondatabase/serverless');

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
 * Get design details from Canva
 */
async function getCanvaDesign(accessToken, designId) {
  const url = `https://api.canva.com/rest/v1/designs/${designId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  };

  return httpsRequest(url, options);
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { designId, userId } = JSON.parse(event.body || '{}');

    if (!designId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing designId' })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing userId' })
      };
    }

    console.log('🎨 Getting edit URL for design:', designId, 'user:', userId);

    // Get access token from database
    const sql = neon(process.env.DATABASE_URL);
    const tokens = await sql`
      SELECT access_token, refresh_token, expires_at 
      FROM canva_tokens 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!tokens || tokens.length === 0) {
      console.log('❌ No Canva token found for user:', userId);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          error: 'No Canva authorization found',
          needsAuth: true 
        })
      };
    }

    const { access_token } = tokens[0];

    // Get design details from Canva
    const designResponse = await getCanvaDesign(access_token, designId);
    
    console.log('✅ Got design details:', {
      id: designResponse.design?.id,
      title: designResponse.design?.title,
      hasEditUrl: !!designResponse.design?.urls?.edit_url
    });

    const editUrl = designResponse.design?.urls?.edit_url;

    if (!editUrl) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Edit URL not available for this design' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        editUrl,
        designId: designResponse.design?.id,
        title: designResponse.design?.title
      })
    };

  } catch (error) {
    console.error('❌ Error getting edit URL:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to get edit URL' })
    };
  }
};
