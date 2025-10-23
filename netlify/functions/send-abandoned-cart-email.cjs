/**
 * Send Abandoned Cart Email (Simplified)
 * 
 * Sends recovery emails using Resend API with HTML templates
 */

const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Generate HTML email template
 */
function generateEmailHTML(sequenceNumber, data) {
  const { customerEmail, cartItems, totalValue, discountCode, recoveryUrl } = data;
  
  const brandBlue = '#18448D';
  const brandOrange = '#ff6b35';
  const urgencyRed = '#dc3545';
  
  let subject, heading, message, ctaText, discountHTML = '';
  
  if (sequenceNumber === 1) {
    subject = '👋 You left something behind at Banners On The Fly';
    heading = 'You left something behind!';
    message = 'We noticed you were designing custom banners but didn\'t complete your order. Your cart is waiting for you!';
    ctaText = 'Complete Your Order';
  } else if (sequenceNumber === 2) {
    subject = '🎁 Here\'s 10% off to complete your banner order';
    heading = 'Here\'s 10% off to complete your order! 🎁';
    message = 'We really want to help you get your custom banners! As a thank you for considering us, here\'s a special <strong>10% discount</strong> just for you.';
    ctaText = 'Claim Your 10% Discount';
    const discountedTotal = totalValue * 0.9;
    const savings = totalValue - discountedTotal;
    discountHTML = `
      <div style="background-color: ${brandOrange}; border-radius: 12px; padding: 32px; text-align: center; margin: 24px 0;">
        <p style="font-size: 14px; color: #ffffff; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Your Discount Code:</p>
        <p style="font-size: 32px; font-weight: bold; color: #ffffff; letter-spacing: 2px; margin: 16px 0; font-family: monospace;">${discountCode}</p>
        <p style="font-size: 14px; color: #ffffff; margin-top: 8px;">10% off • Expires in 48 hours</p>
      </div>
      <p style="font-size: 16px; color: #525f7f; margin: 16px 0;">You Save: <strong style="color: ${brandOrange};">$${savings.toFixed(2)}</strong></p>
      <p style="font-size: 24px; font-weight: bold; color: ${brandBlue}; margin: 8px 0;">New Total: $${discountedTotal.toFixed(2)}</p>
    `;
  } else {
    subject = '🔥 LAST CHANCE: 15% off your custom banners (expires soon!)';
    heading = 'Final offer: 15% OFF your order! 🔥';
    message = 'This is our <strong>final reminder</strong> about your cart - and we\'re making it count! We\'ve increased your discount to <strong>15% OFF</strong> as a last chance to help you complete your custom banner order.';
    ctaText = 'Claim Your 15% Discount Now';
    const discountedTotal = totalValue * 0.85;
    const savings = totalValue - discountedTotal;
    discountHTML = `
      <div style="background-color: ${urgencyRed}; padding: 16px; text-align: center; margin-bottom: 24px;">
        <p style="color: #ffffff; font-size: 16px; font-weight: bold; margin: 0; text-transform: uppercase; letter-spacing: 1px;">⏰ LAST CHANCE - Expires in 24 Hours!</p>
      </div>
      <div style="background-color: ${urgencyRed}; border-radius: 12px; padding: 32px; text-align: center; margin: 24px 0; border: 3px solid ${brandOrange};">
        <p style="font-size: 14px; color: #ffffff; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Your FINAL Discount Code:</p>
        <p style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 2px; margin: 16px 0; font-family: monospace;">${discountCode}</p>
        <p style="font-size: 16px; color: #ffffff; margin-top: 8px; font-weight: bold;">15% off • Expires in 24 hours ⏰</p>
      </div>
      <p style="font-size: 18px; font-weight: bold; color: ${urgencyRed}; margin: 16px 0;">You Save: $${savings.toFixed(2)} (15% OFF!)</p>
      <p style="font-size: 28px; font-weight: bold; color: ${brandBlue}; margin: 8px 0;">Final Price: $${discountedTotal.toFixed(2)}</p>
      <div style="background-color: #fff5f5; border-left: 4px solid ${urgencyRed}; padding: 16px; margin: 24px 0; border-radius: 8px;">
        <p style="font-size: 16px; color: ${urgencyRed}; margin: 0;">⚠️ <strong>This is your last chance!</strong> After 24 hours, this offer expires and your cart will be cleared.</p>
      </div>
    `;
  }
  
  // Build cart items HTML
  let cartItemsHTML = '';
  if (cartItems && cartItems.length > 0) {
    cartItemsHTML = '<div style="background-color: #f6f9fc; border-radius: 8px; padding: 24px; margin: 24px 0;">';
    cartItemsHTML += '<p style="font-size: 18px; font-weight: bold; color: ' + brandBlue + '; margin-bottom: 16px;">Your Cart:</p>';
    
    cartItems.forEach(item => {
      const price = (item.line_total_cents / 100).toFixed(2);
      const qty = item.quantity > 1 ? ` (×${item.quantity})` : '';
      cartItemsHTML += `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <p style="font-size: 14px; color: #525f7f; margin: 0;"><strong>${item.width_in}" × ${item.height_in}"</strong> ${item.material} banner${qty}</p>
          <p style="font-size: 14px; font-weight: bold; color: ${brandBlue}; margin: 0;">$${price}</p>
        </div>
      `;
    });
    
    cartItemsHTML += '<hr style="border: 0; height: 1px; background: #e6ebf1; margin: 16px 0;">';
    cartItemsHTML += `<p style="font-size: 18px; font-weight: bold; color: ${brandBlue}; margin-top: 16px;">Original Total: $${totalValue.toFixed(2)}</p>`;
    cartItemsHTML += '</div>';
  }
  
  const buttonColor = sequenceNumber === 3 ? urgencyRed : brandOrange;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; margin-bottom: 64px;">
    <!-- Header -->
    <div style="background-color: ${brandBlue}; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">Banners On The Fly</h1>
    </div>
    
    ${sequenceNumber === 3 ? discountHTML.split('</div>')[0] + '</div>' : ''}
    
    <!-- Content -->
    <div style="padding: 0 48px;">
      <h2 style="font-size: 28px; font-weight: bold; color: ${brandBlue}; margin-top: 32px; margin-bottom: 16px;">${heading}</h2>
      
      <p style="font-size: 16px; line-height: 24px; color: #525f7f; margin-bottom: 16px;">${message}</p>
      
      ${sequenceNumber > 1 && sequenceNumber !== 3 ? discountHTML : ''}
      ${sequenceNumber === 3 ? discountHTML.split('</div>').slice(1).join('</div>') : ''}
      
      ${cartItemsHTML}
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${recoveryUrl}" style="background-color: ${buttonColor}; border-radius: 6px; color: #fff; font-size: ${sequenceNumber === 3 ? '18px' : '16px'}; font-weight: bold; text-decoration: none; display: inline-block; padding: ${sequenceNumber === 3 ? '16px 40px' : '14px 32px'}; ${sequenceNumber === 3 ? 'border: 2px solid ' + brandOrange + ';' : ''}">${ctaText}</a>
      </div>
      
      ${sequenceNumber > 1 ? '<p style="font-size: 16px; color: #525f7f; margin: 16px 0;">Your discount code will be automatically applied when you click the button above!</p>' : ''}
      
      <p style="font-size: 14px; color: #8898aa; line-height: 20px; margin-top: 24px;">Questions? Just reply to this email - we\'re here to help!</p>
    </div>
    
    <!-- Footer -->
    <div style="padding: 0 48px; margin-top: 32px; text-align: center; padding-bottom: 48px;">
      <p style="font-size: 12px; color: #8898aa; line-height: 16px; margin: 4px 0;">Banners On The Fly - Professional Custom Banners</p>
      <p style="font-size: 12px; color: #8898aa; line-height: 16px; margin: 4px 0;"><a href="https://bannersonthefly.com" style="color: ${brandBlue}; text-decoration: underline;">bannersonthefly.com</a></p>
    </div>
  </div>
</body>
</html>
  `;
  
  return { subject, html };
}

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

    // Get Resend API key
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const sql = neon(DATABASE_URL);
    const resend = new Resend(RESEND_API_KEY);

    // Parse request body
    const { cartId, sequenceNumber = 1 } = JSON.parse(event.body || '{}');

    if (!cartId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'cartId is required' })
      };
    }

    console.log(`[send-abandoned-cart-email] Sending email ${sequenceNumber} for cart ${cartId}`);

    // Get cart data
    const cart = await sql`
      SELECT 
        id,
        user_id,
        session_id,
        email,
        phone,
        cart_contents,
        total_value,
        discount_code,
        recovery_status
      FROM abandoned_carts
      WHERE id = ${cartId}
    `;

    if (cart.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Cart not found' })
      };
    }

    const cartData = cart[0];

    // Check if cart has already been recovered
    if (cartData.recovery_status === 'recovered') {
      console.log(`[send-abandoned-cart-email] Cart ${cartId} has already been recovered - skipping email`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true, 
          skipped: true,
          message: 'Cart already recovered - email not sent' 
        })
      };
    }

    if (!cartData.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Cart has no email address' })
      };
    }

    // Generate discount code if needed (for emails 2 and 3)
    let discountCode = cartData.discount_code;
    const discountPercentage = sequenceNumber === 2 ? 10 : sequenceNumber === 3 ? 15 : 0;
    
    if (discountPercentage > 0 && !discountCode) {
      // Generate discount code inline
      const crypto = require('crypto');
      const shortId = crypto.randomBytes(4).toString('hex').toUpperCase();
      discountCode = `CART${discountPercentage}-${shortId}`;
      
      const expirationHours = sequenceNumber === 2 ? 48 : 24;
      const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
      
      await sql`
        INSERT INTO discount_codes (code, discount_percentage, cart_id, single_use, used, expires_at, created_at, updated_at)
        VALUES (${discountCode}, ${discountPercentage}, ${cartData.id}, TRUE, FALSE, ${expiresAt.toISOString()}, NOW(), NOW())
      `;
      
      console.log(`[send-abandoned-cart-email] Generated discount code: ${discountCode}`);
    }

    // Build recovery URL with discount code
    const baseUrl = 'https://bannersonthefly.com';
    const recoveryUrl = discountCode 
      ? `${baseUrl}?recover_cart=1&discount=${discountCode}&cart=${cartData.id}`
      : `${baseUrl}?recover_cart=${cartData.id}`;

    // Parse cart_contents if it's a JSON string
    let cartItems = cartData.cart_contents || [];
    if (typeof cartItems === 'string') {
      try {
        cartItems = JSON.parse(cartItems);
      } catch (e) {
        console.error('[send-abandoned-cart-email] Failed to parse cart_contents:', e);
        cartItems = [];
      }
    }

    console.log('[send-abandoned-cart-email] Cart items:', JSON.stringify(cartItems));

    // Generate email HTML
    const emailData = generateEmailHTML(sequenceNumber, {
      customerEmail: cartData.email,
      cartItems: cartItems,
      totalValue: parseFloat(cartData.total_value),
      discountCode: discountCode || undefined,
      recoveryUrl
    });

    console.log('[send-abandoned-cart-email] Email data generated:', { subject: emailData.subject, hasHtml: !!emailData.html, htmlLength: emailData.html?.length });

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: 'Banners On The Fly <info@bannersonthefly.com>',
      to: cartData.email,
      subject: emailData.subject,
      html: emailData.html,
      tags: [
        { name: 'type', value: 'abandoned_cart' },
        { name: 'sequence', value: sequenceNumber.toString() },
        { name: 'cart_id', value: cartData.id }
      ]
    });

    console.log(`[send-abandoned-cart-email] Email sent:`, emailResult);

    // Update cart recovery status
    await sql`
      UPDATE abandoned_carts
      SET 
        recovery_emails_sent = ${sequenceNumber},
        updated_at = NOW()
      WHERE id = ${cartData.id}
    `;

    // Log email sent event
    await sql`
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id,
        event_type,
        email_sequence_number,
        metadata,
        created_at
      ) VALUES (
        ${cartData.id},
        'email_sent',
        ${sequenceNumber},
        ${JSON.stringify({
          subject: emailData.subject,
          discountCode: discountCode || null,
          emailId: emailResult.id
        })}::jsonb,
        NOW()
      )
    `;

    console.log(`[send-abandoned-cart-email] Success! Email ${sequenceNumber} sent to ${cartData.email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        emailId: emailResult.id,
        sequenceNumber,
        discountCode: discountCode || null
      })
    };

  } catch (error) {
    console.error('[send-abandoned-cart-email] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to send email',
        message: error.message
      })
    };
  }
};
