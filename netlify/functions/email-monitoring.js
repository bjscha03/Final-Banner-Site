// netlify/functions/email-monitoring.js
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
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

    const db = neon(dbUrl);
    const timeframe = event.queryStringParameters?.timeframe || '24h';
    
    // Convert timeframe to SQL interval
    const intervalMap = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };
    const interval = intervalMap[timeframe] || '24 hours';

    // Recent email activity (last 24 hours for now)
    const recentEmails = await db`
      SELECT
        created_at,
        type,
        to_email,
        status,
        error_message,
        order_id
      FROM email_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Email statistics by type and status
    const emailStats = await db`
      SELECT
        type,
        status,
        COUNT(*) as count
      FROM email_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY type, status
      ORDER BY type, status
    `;

    // Failed emails requiring attention
    const failedEmails = await db`
      SELECT 
        created_at,
        type,
        to_email,
        error_message,
        order_id
      FROM email_events 
      WHERE status = 'error' 
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Order confirmation status overview
    const orderEmailStatus = await db`
      SELECT
        o.id,
        o.email,
        o.confirmation_email_status,
        o.confirmation_email_sent_at,
        o.created_at as order_created_at,
        ee.status as latest_email_status,
        ee.created_at as email_sent_at,
        ee.error_message
      FROM orders o
      LEFT JOIN email_events ee ON ee.order_id::text = o.id::text AND ee.type = 'order.confirmation'
      WHERE o.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY o.created_at DESC
      LIMIT 20
    `;

    // Email delivery rates
    const deliveryRates = await db`
      SELECT
        type,
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced,
        COUNT(CASE WHEN status = 'complained' THEN 1 END) as complained,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
        ROUND(
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN status IN ('sent', 'delivered', 'bounced', 'complained') THEN 1 END), 0),
          2
        ) as delivery_rate_percent
      FROM email_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND status != 'error'
      GROUP BY type
      ORDER BY type
    `;

    // System health indicators
    const healthCheck = {
      database_connected: true,
      resend_api_configured: !!process.env.RESEND_API_KEY,
      webhook_secret_configured: !!process.env.RESEND_WEBHOOK_SECRET,
      site_url_configured: !!(process.env.SITE_URL || process.env.PUBLIC_SITE_URL),
      email_from_configured: !!process.env.EMAIL_FROM
    };

    const response = {
      timeframe,
      timestamp: new Date().toISOString(),
      health: healthCheck,
      summary: {
        total_emails: recentEmails.length,
        failed_emails: failedEmails.length,
        delivery_rates: deliveryRates
      },
      recent_emails: recentEmails,
      email_stats: emailStats,
      failed_emails: failedEmails,
      order_email_status: orderEmailStatus
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response, null, 2)
    };

  } catch (error) {
    console.error('Email monitoring failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch email monitoring data',
        details: error.message
      })
    };
  }
};
