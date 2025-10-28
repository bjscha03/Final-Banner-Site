/**
 * PayPal Capture Credits Order
 * 
 * Captures payment and adds credits to user's account
 * 
 * CRITICAL FIX: Email notifications are now non-blocking to prevent purchase flow from hanging
 */

const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Helper to send email notification (NON-BLOCKING - fire and forget)
async function sendCreditPurchaseEmailAsync(purchaseId, email, credits, amountUSD) {
  // Don't await - fire and forget
  fetch(process.env.URL + '/.netlify/functions/notify-credit-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseId, email, credits, amountUSD }),
  }).then(response => {
    if (response.ok) {
      console.log('✅ Customer email notification triggered:', purchaseId);
    } else {
      console.error('❌ Customer email notification failed:', response.status);
    }
  }).catch(error => {
    console.error('❌ Customer email notification error:', error.message);
  });
}

// Helper to send admin notification (NON-BLOCKING - fire and forget)
async function sendAdminNotificationAsync(purchaseId, email, credits, amountUSD) {
  const adminEmail = process.env.ADMIN_EMAIL || 'support@bannersonthefly.com';
  
  // Don't await - fire and forget
  fetch(process.env.URL + '/.netlify/functions/send-email', {
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
  }).then(response => {
    if (response.ok) {
      console.log('✅ Admin notification triggered');
    } else {
      console.error('❌ Admin notification failed:', response.status);
    }
  }).catch(error => {
    console.error('❌ Admin notification error:', error.message);
  });
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
  const startTime = Date.now();
  
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

    console.log('🔄 Starting credit purchase capture...');
    
    const payload = JSON.parse(event.body || '{}');
    const { orderID, userId, email, credits, amountCents } = payload;

    if (!orderID || !userId || !credits || !amountCents) {
      console.error('❌ Missing required fields in capture request');
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
      console.error('❌ Invalid package:', { credits, amountCents });
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
      console.error('❌ Database not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'DATABASE_NOT_CONFIGURED' }),
      };
    }
    const sql = neon(dbUrl);
    console.log('✅ Database connected');

    // Get PayPal OAuth token
    console.log('🔑 Getting PayPal access token...');
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
      console.error('❌ PayPal token error:', tokenData);
      return {
        statusCode: tokenResponse.status,
        headers,
        body: JSON.stringify({ error: 'PAYPAL_TOKEN_ERROR', details: tokenData }),
      };
    }
    console.log('✅ PayPal access token obtained');

    // Capture the PayPal order
    console.log('💳 Capturing PayPal order:', orderID);
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
      console.error('❌ PayPal capture failed:', captureData);
      return {
        statusCode: captureResponse.status || 502,
        headers,
        body: JSON.stringify({
          error: 'PAYPAL_CAPTURE_FAILED',
          details: captureData,
        }),
      };
    }
    console.log('✅ PayPal order captured successfully');

    // Extract payment details
    const capture = captureData.purchase_units[0].payments.captures[0];
    const capturedAmount = parseFloat(capture.amount.value);
    const payerEmail = captureData.payer.email_address;
    const finalEmail = email || payerEmail;
    const customerName = `${captureData.payer.name.given_name} ${captureData.payer.name.surname}`;

    // Verify amount
    if (Math.round(capturedAmount * 100) !== amountCents) {
      console.error('❌ Amount mismatch:', { expected: amountCents, captured: Math.round(capturedAmount * 100) });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'AMOUNT_MISMATCH' }),
      };
    }

    const purchaseId = randomUUID();
    console.log('💾 Saving purchase to database:', purchaseId);

    // Database operations: Create purchase record and add credits
    // Insert purchase record
    await sql`
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
    console.log('✅ Purchase record created');

    // Ensure user exists
    await sql`
      INSERT INTO users (id, email)
      VALUES (${userId}, ${finalEmail})
      ON CONFLICT (id) DO UPDATE SET email = ${finalEmail}
    `;

    // Ensure user_credits record exists
    await sql`
      INSERT INTO user_credits (user_id, credits)
      VALUES (${userId}, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;

    // Add credits to user's account
    await sql`
      UPDATE user_credits
      SET credits = credits + ${credits},
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
    `;
    console.log(`✅ ${credits} credits added to user ${userId}`);

    // Log the purchase in usage_log
    await sql`
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
    console.log('✅ Usage logged');

    const elapsedTime = Date.now() - startTime;
    console.log(`✅ Credits purchase completed in ${elapsedTime}ms:`, purchaseId);

    // CRITICAL FIX: Send email notifications asynchronously (non-blocking)
    // This ensures the purchase completes even if email fails
    console.log('📧 Triggering email notifications (non-blocking)...');
    sendCreditPurchaseEmailAsync(purchaseId, finalEmail, credits, capturedAmount.toFixed(2));
    sendAdminNotificationAsync(purchaseId, finalEmail, credits, capturedAmount.toFixed(2));

    // Return success immediately - don't wait for emails
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
    const elapsedTime = Date.now() - startTime;
    console.error(`❌ Error capturing PayPal credits order (${elapsedTime}ms):`, error);
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
