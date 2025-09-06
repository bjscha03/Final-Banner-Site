const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    console.log('Environment variables check:');
    console.log('NETLIFY_DATABASE_URL exists:', !!process.env.NETLIFY_DATABASE_URL);
    
    if (!process.env.NETLIFY_DATABASE_URL) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'NETLIFY_DATABASE_URL not found',
          env_vars: Object.keys(process.env).filter(key => key.includes('DATABASE'))
        }),
      };
    }

    // Test database connection
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    console.log('Testing database connection...');
    
    const result = await sql`SELECT 1 as test, NOW() as current_time`;
    console.log('Database test result:', result);

    // Check if tables exist
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('orders', 'order_items')
      ORDER BY table_name;
    `;
    console.log('Tables found:', tablesResult);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        database_connected: true,
        test_query: result,
        tables: tablesResult,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Database test error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Database test failed', 
        details: error.message,
        stack: error.stack
      }),
    };
  }
};
