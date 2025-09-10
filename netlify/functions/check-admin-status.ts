import { Handler } from '@netlify/functions';

/**
 * Admin Status Check Endpoint
 * 
 * Checks if a user email is in the ADMIN_TEST_PAY_ALLOWLIST environment variable.
 * Used to determine if a user should see admin test payment options.
 */

const handler: Handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    const { email } = requestBody;

    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' }),
      };
    }

    // Check admin allowlist from environment variable
    const adminAllowlist = process.env.ADMIN_TEST_PAY_ALLOWLIST;
    let isAdmin = false;

    if (adminAllowlist) {
      const allowedEmails = adminAllowlist.split(',').map(e => e.trim().toLowerCase());
      isAdmin = allowedEmails.includes(email.toLowerCase());
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isAdmin,
        email: email.toLowerCase()
      }),
    };

  } catch (error) {
    console.error('Admin status check error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        isAdmin: false
      }),
    };
  }
};

export { handler };
