exports.handler = async (event, context) => {
  try {
    // Check environment variables (without exposing sensitive data)
    const envCheck = {
      NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL ? '✅ Set' : '❌ Missing',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      NETLIFY_DEV: process.env.NETLIFY_DEV || 'not set'
    };

    // Check URL format (first few characters only for security)
    if (process.env.NETLIFY_DATABASE_URL) {
      envCheck.DATABASE_URL_FORMAT = process.env.NETLIFY_DATABASE_URL.startsWith('postgresql://') ? '✅ Valid PostgreSQL' : '❌ Invalid format';
      envCheck.DATABASE_URL_PREVIEW = process.env.NETLIFY_DATABASE_URL.substring(0, 25) + '...';
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Environment check completed',
        environment: envCheck,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Environment check error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Environment check failed',
        details: error.message
      })
    };
  }
};
