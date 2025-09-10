/**
 * Test PayPal Authentication
 * 
 * This function tests if PayPal credentials are working in the Netlify environment
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const getPayPalCredentials = () => {
  const env = process.env.PAYPAL_ENV || 'sandbox';
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];
  
  console.log('Test PayPal credentials:', { 
    env, 
    clientIdExists: !!clientId, 
    secretExists: !!secret,
    clientIdLength: clientId?.length,
    secretLength: secret?.length,
    clientIdStart: clientId?.substring(0, 10),
    secretStart: secret?.substring(0, 10)
  });
  
  return {
    clientId,
    secret,
    baseUrl: env === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com'
  };
};

const testPayPalAuth = async () => {
  const { clientId, secret, baseUrl } = getPayPalCredentials();
  
  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured`);
  }
  
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  
  console.log('Testing PayPal auth with:', { baseUrl, authLength: auth.length });
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  console.log('PayPal auth response:', { status: response.status, ok: response.ok });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal auth failed:', { status: response.status, error });
    throw new Error(`PayPal auth failed: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  console.log('PayPal auth success:', { 
    tokenType: data.token_type, 
    expiresIn: data.expires_in,
    tokenLength: data.access_token?.length 
  });
  
  return data.access_token;
};

exports.handler = async (event, context) => {
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('=== PayPal Auth Test Starting ===');
    
    // Test environment variables
    console.log('Environment check:', {
      FEATURE_PAYPAL: process.env.FEATURE_PAYPAL,
      PAYPAL_ENV: process.env.PAYPAL_ENV,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      hasSecret: !!process.env.PAYPAL_SECRET_SANDBOX,
      hasDatabase: !!process.env.NETLIFY_DATABASE_URL
    });
    
    // Test PayPal authentication
    const accessToken = await testPayPalAuth();
    
    console.log('=== PayPal Auth Test Complete ===');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'PayPal authentication successful',
        tokenLength: accessToken?.length,
        environment: process.env.PAYPAL_ENV || 'sandbox'
      }),
    };

  } catch (error) {
    console.error('PayPal auth test failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        environment: process.env.PAYPAL_ENV || 'sandbox'
      }),
    };
  }
};
