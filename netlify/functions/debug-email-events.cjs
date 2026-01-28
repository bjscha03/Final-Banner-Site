const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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

    const db = neon(dbUrl);
    
    // Get recent email events
    const emailEvents = await db`
      SELECT * FROM email_events 
      ORDER BY created_at DESC 
      LIMIT 20
    `;
    
    // Get recent orders with email status
    const orders = await db`
      SELECT id, email, customer_name, confirmation_email_status, confirmation_emailed_at, 
             admin_notification_status, admin_notification_sent_at, created_at
      FROM orders 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    // Check if RESEND_API_KEY is configured
    const hasResendKey = !!process.env.RESEND_API_KEY;
    const resendKeyPrefix = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 10) + '...' : 'NOT SET';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        hasResendKey,
        resendKeyPrefix,
        emailEvents,
        recentOrders: orders
      }, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

