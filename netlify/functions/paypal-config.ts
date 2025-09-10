import { Handler } from '@netlify/functions';

/**
 * PayPal Configuration Endpoint
 * 
 * Returns only the public PayPal client ID for frontend use.
 * Never exposes secrets or sensitive configuration.
 */

const handler: Handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Check if PayPal is enabled
    const isEnabled = process.env.FEATURE_PAYPAL === '1';
    
    if (!isEnabled) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          enabled: false,
          clientId: null,
          environment: null
        }),
      };
    }

    // Get environment and client ID
    const environment = process.env.PAYPAL_ENV || 'sandbox';
    const clientId = process.env[`PAYPAL_CLIENT_ID_${environment.toUpperCase()}`];

    if (!clientId) {
      console.error(`PayPal client ID not found for environment: ${environment}`);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'PayPal configuration error',
          enabled: false
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        enabled: true,
        clientId,
        environment
      }),
    };

  } catch (error) {
    console.error('PayPal config error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        enabled: false
      }),
    };
  }
};

export { handler };
