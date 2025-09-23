const fs = require('fs');

// Create a simplified PayPal capture function without the utils dependency for now
const simpleContent = `// Simplified PayPal capture - supports both sandbox and live environments
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { orderID } = JSON.parse(event.body || '{}');
    if (!orderID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing orderID' }) };
    }

    // Get environment and credentials
    const env = process.env.PAYPAL_ENV || 'sandbox';
    const clientId = process.env[\`PAYPAL_CLIENT_ID_\${env.toUpperCase()}\`];
    const secret = process.env[\`PAYPAL_SECRET_\${env.toUpperCase()}\`];
    
    if (!clientId || !secret) {
      console.error(\`PayPal credentials missing for environment: \${env}\`);
      return { statusCode: 500, headers, body: JSON.stringify({ 
        error: 'PayPal credentials missing',
        environment: env
      }) };
    }

    const baseUrl = env === 'live' 
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // Get PayPal access token
    const tokenResponse = await fetch(\`\${baseUrl}/v1/oauth2/token\`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Authorization': \`Basic \${Buffer.from(\`\${clientId}:\${secret}\`).toString('base64')}\`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('PayPal token error:', errorText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal authentication failed' }) };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Capture the payment
    const captureResponse = await fetch(\`\${baseUrl}/v2/checkout/orders/\${orderID}/capture\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${accessToken}\`,
        'PayPal-Request-Id': \`\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`
      }
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error('PayPal capture error:', errorText);
      return { statusCode: 400, headers, body: JSON.stringify({ 
        error: 'Payment capture failed',
        details: errorText
      }) };
    }

    const captureData = await captureResponse.json();
    
    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderID: orderID,
        captureID: captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        status: captureData.status,
        environment: env
      })
    };

  } catch (error) {
    console.error('PayPal capture function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
`;

// Backup the current file
fs.copyFileSync('netlify/functions/paypal-capture-minimal.js', 'netlify/functions/paypal-capture-minimal.js.backup2');

// Write the simplified version
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', simpleContent);
console.log('Created simplified PayPal capture function!');
