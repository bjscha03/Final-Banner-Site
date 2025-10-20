/**
 * Email Tracking Webhook
 * 
 * Receives webhooks from Resend for email events (opens, clicks, bounces)
 * Updates cart_recovery_logs table
 */

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get database connection
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const sql = neon(DATABASE_URL);

    // Parse webhook payload
    const payload = JSON.parse(event.body || '{}');
    
    console.log('[email-webhook] Received event:', payload.type);

    // Extract cart_id from tags
    const cartId = payload.data?.tags?.find(tag => tag.name === 'cart_id')?.value;
    
    if (!cartId) {
      console.log('[email-webhook] No cart_id in payload, skipping');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No cart_id found' })
      };
    }

    // Map Resend event types to our event types
    const eventTypeMap = {
      'email.opened': 'email_opened',
      'email.clicked': 'email_clicked',
      'email.bounced': 'email_bounced',
      'email.delivered': 'email_delivered'
    };

    const eventType = eventTypeMap[payload.type];

    if (!eventType) {
      console.log(`[email-webhook] Unknown event type: ${payload.type}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Event type not tracked' })
      };
    }

    // Get sequence number from tags
    const sequenceNumber = payload.data?.tags?.find(tag => tag.name === 'sequence')?.value;

    // Log the event
    await sql`
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id,
        event_type,
        email_sequence_number,
        metadata,
        created_at
      ) VALUES (
        ${cartId},
        ${eventType},
        ${sequenceNumber ? parseInt(sequenceNumber) : null},
        ${JSON.stringify({
          emailId: payload.data?.email_id || null,
          timestamp: payload.created_at || new Date().toISOString(),
          rawEvent: payload.type
        })}::jsonb,
        NOW()
      )
    `;

    console.log(`[email-webhook] Logged ${eventType} for cart ${cartId}`);

    // If email was clicked, stop sending more emails
    if (eventType === 'email_clicked') {
      await sql`
        UPDATE abandoned_carts
        SET 
          recovery_status = 'engaged',
          updated_at = NOW()
        WHERE id = ${cartId}
          AND recovery_status = 'abandoned'
      `;
      
      console.log(`[email-webhook] Marked cart ${cartId} as engaged (clicked email)`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        eventType,
        cartId
      })
    };

  } catch (error) {
    console.error('[email-webhook] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process webhook',
        message: error.message
      })
    };
  }
};
