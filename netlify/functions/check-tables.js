const { neon } = require('@neondatabase/serverless');

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
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('Database URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);

    // Check which tables exist
    const tables = await db`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;

    // Check if email_verifications table exists
    const emailVerificationsExists = tables.some(t => t.table_name === 'email_verifications');
    
    // Check if password_resets table exists
    const passwordResetsExists = tables.some(t => t.table_name === 'password_resets');

    // Check recent email events
    let emailEvents = [];
    try {
      emailEvents = await db`
        SELECT type, to_email, status, error_message, created_at
        FROM email_events 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
    } catch (error) {
      console.log('Email events table might not exist or have issues:', error.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true,
        tables: tables.map(t => t.table_name),
        emailVerificationsExists,
        passwordResetsExists,
        recentEmailEvents: emailEvents
      })
    };

  } catch (error) {
    console.error('Failed to check tables:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Failed to check tables',
        details: error.message
      })
    };
  }
};
