const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

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
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database not configured' })
      };
    }

    const sql = neon(dbUrl);

    // Add shipping notification tracking columns
    await sql`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS shipping_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS shipping_notification_sent_at TIMESTAMP WITH TIME ZONE;
    `;

    // Create index for performance on shipping notification queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_shipping_notification_sent 
      ON orders(shipping_notification_sent);
    `;

    // Create index for performance on shipping notification timestamp queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_shipping_notification_sent_at 
      ON orders(shipping_notification_sent_at);
    `;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Shipping notification columns migration completed successfully'
      })
    };

  } catch (error) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Migration failed',
        details: error.message
      })
    };
  }
};
