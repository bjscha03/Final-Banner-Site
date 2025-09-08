const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const envVars = {
      NETLIFY_DATABASE_URL: !!process.env.NETLIFY_DATABASE_URL,
      DATABASE_URL: !!process.env.DATABASE_URL,
      VITE_DATABASE_URL: !!process.env.VITE_DATABASE_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
      availableKeys: Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('RESEND'))
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(envVars)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
