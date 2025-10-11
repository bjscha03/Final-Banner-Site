/**
 * PayPal Capture Credits Order
 * 
 * Captures payment and adds credits to user's account
 */

const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Helper to send email notification
async function sendCreditPurchaseEmail(purchaseId, email, credits, amountUSD) {
  try {
    console.log('Triggering credit purchase notification:', purchaseId);
    const siteURL = process.env.URL || 'https://bannersonthefly.com';
    const notifyURL = `${siteURL}/.netlify/functions/notify-credit-purchase`;

    fetch(notifyURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseId, email, credits, amountUSD }),
    });

    console.log('Credit purchase notification sent:', purchaseId);
  } catch (error) {
    console.error('Failed to send credit purchase notification:', purchaseId, error);
  }
}

// Helper to send admin notification
async function sendAdminNotification(purchaseId, email, credits, amountUSD) {
  try {
    const siteURL = process.env.URL || 'https://bannersonthefly.com';
    const adminEmail = process.env.ADMIN_EMAIL || 'support@bannersonthefly.com';
    
    fetch(`${siteURL}/.netlify/functions/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: adminEmail,
        subject: `🎉 New AI Credits Purchase - ${credits} credits`,
        html: `
          <h2>New AI Credits Purchase</h2>
          <p><strong>Purchase ID:</strong> ${purchaseId}</p>
          <p><strong>Customer Email:</strong> ${email}</p>
          <p><strong>Credits Purchased:</strong> ${credits}</p>
          <p><strong>Amount:</strong> $${amountUSD}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `,
      }),
    });
  } catch (error) {
    console.error('Failed to send admin notification:', error);
  }
}

const getPayPalCredentials = () => {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const clientId = process.env[`PAYPAL_CLIENT_ID_${env.toUpperCase()}`];
  const secret = process.env[`PAYPAL_SECRET_${env.toUpperCase()}`];

  if (!clientId || !secret) {
    throw new Error(`PayPal credentials not configured for environment: ${env}`);
  }

  return {
    clientId,
    secret,
    baseUrl: env === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com'
  };
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
      };
    }

    const payload = JSON.parse(event.body || '{}');
    const { orderID, userId, email, credits, amountCents } = payload;

    if (!orderID || !userId || !credits || !amountCents) {
      console.error('Missing required fields in capture request');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'MISSING_REQUIRED_FIELDS' }),
      };
    }

    // Validate credit package
    const validPackages = {
      10: 500,
      50: 2000,
      100: 3500,
    };

    if (!validPackages[credits] || validPackages[credits] !== amountCents) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'INVALID_PACKAGE' }),
      };
    }

    const { clientId, secret, baseUrl } = getPayPalCredentials();

    // Database connection
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'DATABASE_NOT_CONFIGURED' }),
      };
    }
    const sql = neon(dbUrl);

    // Get PayPal OAuth token
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return {
        statusCode: tokenResponse.status,
        headers,
        body: JSON.stringify({ error: 'PAYPAL_TOKEN_ERROR', details: tokenData }),
      };
    }

    // Capture the PayPal order
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
        'PayPal-Request-Id': `cap_credits_${orderID}`,
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || /INTERNAL/.test(captureData?.name || '')) {
      return {
        statusCode: captureResponse.status || 502,
        headers,
        body: JSON.stringify({
          error: 'PAYPAL_CAPTURE_FAILED',
          details: captureData,
        }),
      };
    }

    // Extract payment details
    const capture = captureData.purchase_units[0].payments.captures[0];
    const capturedAmount = parseFloat(capture.amount.value);
    const payerEmail = captureData.payer.email_address;
    const finalEmail = email || payerEmail;
    const customerName = `${captureData.payer.name.given_name} ${captureData.payer.name.surname}`;

    // Verify amount
    if (Math.round(capturedAmount * 100) !== amountCents) {
      console.error('Amount mismatch:', { expected: amountCents, captured: Math.round(capturedAmount * 100) });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'AMOUNT_MISMATCH' }),
      };
    }

    const purchaseId = randomUUID();

    // Database transaction: Create purchase record and add credits
    await sql.transaction(async (tx) => {
      // Insert purchase record
      await tx`
        INSERT INTO credit_purchases (
          id, user_id, email, credits_purchased, amount_cents,
          payment_method, paypal_order_id, paypal_capture_id,
          status, customer_name
        ) VALUES (
          ${purchaseId}, ${userId}, ${finalEmail}, ${credits}, ${amountCents},
          'paypal', ${orderID}, ${capture.id},
          'completed', ${customerName}
        )
      `;

      // Ensure user exists
      await tx`
        INSERT INTO users (id, email)
        VALUES (${userId}, ${finalEmail})
        ON CONFLICT (id) DO UPDATE SET email = ${finalEmail}
      `;

      // Ensure user_credits record exists
      await tx`
        INSERT INTO user_credits (user_id, credits)
        VALUES (${userId}, 0)
        ON CONFLICT (user_id) DO NOTHING
      `;

      // Add credits to user's account
      await tx`
        UPDATE user_credits
        SET credits = credits + ${credits},
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
      `;

      // Log the purchase in usage_log
      await tx`
        INSERT INTO usage_log (user_id, event, meta)
        VALUES (
          ${userId},
          'CREDITS_PURCHASED',
          ${JSON.stringify({
            purchaseId,
            credits,
            amountUSD: capturedAmount,
            paypalOrderId: orderID,
            paypalCaptureId: capture.id,
          })}
        )
      `;
    });

    console.log('✅ Credits purchase completed:', purchaseId, `${credits} credits added to user ${userId}`);

    // Send notifications (fire-and-forget)
    sendCreditPurchaseEmail(purchaseId, finalEmail, credits, capturedAmount.toFixed(2));
    sendAdminNotification(purchaseId, finalEmail, credits, capturedAmount.toFixed(2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        purchaseId,
        credits,
        amountUSD: capturedAmount.toFixed(2),
      }),
    };
  } catch (error) {
    console.error('Error capturing PayPal credits order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        message: error.message,
      }),
    };
  }
};
