/**
 * Notify Credit Purchase
 * 
 * Sends confirmation email to customer after purchasing AI credits
 */

const { Resend } = require('resend');
const { neon } = require('@neondatabase/serverless');

const resend = new Resend(process.env.RESEND_API_KEY);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
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

  try {
    const { purchaseId, email, credits, amountUSD } = JSON.parse(event.body || '{}');

    if (!purchaseId || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'MISSING_REQUIRED_FIELDS' }),
      };
    }

    // Get purchase details from database
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    const sql = neon(dbUrl);

    const purchases = await sql`
      SELECT * FROM credit_purchases
      WHERE id = ${purchaseId}
      LIMIT 1
    `;

    if (purchases.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'PURCHASE_NOT_FOUND' }),
      };
    }

    const purchase = purchases[0];

    // Send confirmation email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .credits-box { background: white; border: 2px solid #667eea; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
          .credits-number { font-size: 48px; font-weight: bold; color: #667eea; }
          .details { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; color: #666; }
          .detail-value { color: #333; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Credits Purchased Successfully!</h1>
          </div>
          
          <div class="content">
            <p>Hi ${purchase.customer_name || 'there'},</p>
            
            <p>Thank you for purchasing AI generation credits! Your credits have been added to your account and are ready to use.</p>
            
            <div class="credits-box">
              <div class="credits-number">${purchase.credits_purchased}</div>
              <p style="margin: 10px 0 0 0; color: #666;">AI Generation Credits</p>
            </div>
            
            <div class="details">
              <h3 style="margin-top: 0;">Purchase Details</h3>
              <div class="detail-row">
                <span class="detail-label">Purchase ID:</span>
                <span class="detail-value">${purchase.id}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Credits Purchased:</span>
                <span class="detail-value">${purchase.credits_purchased} credits</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Amount Paid:</span>
                <span class="detail-value">$${(purchase.amount_cents / 100).toFixed(2)} USD</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Payment Method:</span>
                <span class="detail-value">PayPal</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Transaction ID:</span>
                <span class="detail-value">${purchase.paypal_capture_id}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${new Date(purchase.created_at).toLocaleString()}</span>
              </div>
            </div>
            
            <div style="text-align: center;">
              <a href="https://bannersonthefly.com/design?ai=1" class="button">
                Start Creating AI Banners
              </a>
            </div>
            
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              <strong>What's Next?</strong><br>
              Your credits are now available in your account. Head to the Design page and click "AI Generate" to start creating stunning banner images with AI!
            </p>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Need Help?</strong><br>
              If you have any questions or need assistance, please contact us at 
              <a href="mailto:support@bannersonthefly.com">support@bannersonthefly.com</a>
            </p>
          </div>
          
          <div class="footer">
            <p>This is an automated receipt for your AI credits purchase.</p>
            <p>Banners On The Fly | Professional Banner Printing</p>
            <p>© ${new Date().getFullYear()} Banners On The Fly. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Banners On The Fly <info@bannersonthefly.com>',
      to: email,
      subject: `✅ Your AI Credits Purchase - ${purchase.credits_purchased} Credits`,
      html: emailHtml,
    });

    console.log('✅ Credit purchase email sent:', result.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, emailId: result.id }),
    };
  } catch (error) {
    console.error('Error sending credit purchase email:', error);
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
