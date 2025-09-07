const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { query } = JSON.parse(event.body);
    
    if (!query) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required' }),
      };
    }

    console.log('Executing query:', query);

    // Handle specific queries safely
    if (query.includes('SELECT') && query.includes('email_verifications')) {
      const result = await sql`
        SELECT id, user_id, token, expires_at, verified, created_at
        FROM email_verifications
        ORDER BY created_at DESC
        LIMIT 5
      `;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, result }),
      };
    }

    // For security, only allow specific safe queries
    const allowedQueries = {
      'tables': "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      'email_events': "SELECT * FROM email_events ORDER BY created_at DESC LIMIT 10",
      'orders': "SELECT id, email, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10",
      'profiles': "SELECT id, email, is_admin, created_at FROM profiles ORDER BY created_at DESC LIMIT 10"
    };

    const queryKey = query.toLowerCase().trim();
    let actualQuery = allowedQueries[queryKey];

    if (!actualQuery) {
      // Check if it's one of the allowed patterns
      if (query.includes('information_schema.tables')) {
        actualQuery = allowedQueries.tables;
      } else {
        throw new Error('Query not allowed. Use: tables, email_events, orders, or profiles');
      }
    }

    const result = await sql([actualQuery]);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, result }),
    };
  } catch (error) {
    console.error('Query failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Query failed', 
        details: error.message 
      }),
    };
  }
};
