/**
 * Detect Abandoned Carts - Scheduled Function
 * Schedule: 0 * * * * (every hour)
 */

const { neon } = require('@neondatabase/serverless');
const { schedule } = require('@netlify/functions');

async function triggerRecoveryEmail(cartId, sequenceNumber = 1) {
  try {
    const functionUrl = process.env.URL 
      ? `${process.env.URL}/.netlify/functions/send-abandoned-cart-email`
      : 'http://localhost:8888/.netlify/functions/send-abandoned-cart-email';

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId, sequenceNumber })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to trigger email for cart ${cartId}:`, error);
      return false;
    }

    const result = await response.json();
    console.log(`Email triggered for cart ${cartId}:`, result);
    return true;
  } catch (error) {
    console.error(`Error triggering email for cart ${cartId}:`, error);
    return false;
  }
}

const handler = async (event, context) => {
  console.log('[detect-abandoned-carts] Starting...');

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);

    // STEP 1: Find newly abandoned carts (1 hour old)
    const newlyAbandoned = await sql`
      SELECT id, user_id, session_id, email, total_value, cart_contents, last_activity_at
      FROM abandoned_carts
      WHERE recovery_status = 'active'
        AND last_activity_at < NOW() - INTERVAL '1 hour'
        AND last_activity_at > NOW() - INTERVAL '72 hours'
        AND total_value > 0
        AND email IS NOT NULL
        AND email != ''
      ORDER BY last_activity_at DESC
    `;

    console.log(`Found ${newlyAbandoned.length} newly abandoned carts`);

    for (const cart of newlyAbandoned) {
      try {
        await sql`
          UPDATE abandoned_carts
          SET recovery_status = 'abandoned', abandoned_at = NOW(), updated_at = NOW()
          WHERE id = ${cart.id}
        `;
        console.log(`Marked cart ${cart.id} as abandoned`);
        await triggerRecoveryEmail(cart.id, 1);
      } catch (error) {
        console.error(`Error processing cart ${cart.id}:`, error);
      }
    }

    // STEP 2: 2nd email (24 hours)
    const readyForEmail2 = await sql`
      SELECT ac.id FROM abandoned_carts ac
      WHERE ac.recovery_status = 'abandoned'
        AND ac.abandoned_at < NOW() - INTERVAL '24 hours'
        AND ac.abandoned_at > NOW() - INTERVAL '72 hours'
        AND ac.recovery_emails_sent = 1
        AND ac.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM cart_recovery_logs crl
          WHERE crl.abandoned_cart_id = ac.id AND crl.event_type = 'email_clicked'
        )
    `;

    console.log(`Found ${readyForEmail2.length} carts ready for 2nd email`);
    for (const cart of readyForEmail2) {
      await triggerRecoveryEmail(cart.id, 2);
    }

    // STEP 3: 3rd email (72 hours)
    const readyForEmail3 = await sql`
      SELECT ac.id FROM abandoned_carts ac
      WHERE ac.recovery_status = 'abandoned'
        AND ac.abandoned_at < NOW() - INTERVAL '72 hours'
        AND ac.abandoned_at > NOW() - INTERVAL '96 hours'
        AND ac.recovery_emails_sent = 2
        AND ac.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM cart_recovery_logs crl
          WHERE crl.abandoned_cart_id = ac.id AND crl.event_type = 'email_clicked'
        )
    `;

    console.log(`Found ${readyForEmail3.length} carts ready for 3rd email`);
    for (const cart of readyForEmail3) {
      await triggerRecoveryEmail(cart.id, 3);
    }

    // STEP 4: Expire old carts
    const expired = await sql`
      UPDATE abandoned_carts
      SET recovery_status = 'expired', updated_at = NOW()
      WHERE recovery_status = 'abandoned' AND abandoned_at < NOW() - INTERVAL '96 hours'
      RETURNING id
    `;

    console.log(`Expired ${expired.length} old carts`);

    const summary = {
      newlyAbandoned: newlyAbandoned.length,
      email2Sent: readyForEmail2.length,
      email3Sent: readyForEmail3.length,
      expired: expired.length,
      timestamp: new Date().toISOString()
    };

    return { statusCode: 200, body: JSON.stringify({ success: true, ...summary }) };
  } catch (error) {
    console.error('[detect-abandoned-carts] Fatal error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

exports.handler = schedule('0 * * * *', handler);
