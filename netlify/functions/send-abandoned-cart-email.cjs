/**
 * Send Abandoned Cart Email
 * 
 * Sends recovery emails using Resend API with React Email templates
 */

const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { render } = require('@react-email/render');
const React = require('react');

// Import email templates
const AbandonedCartReminder = require('../../emails/templates/AbandonedCartReminder.jsx').default;
const AbandonedCartDiscount10 = require('../../emails/templates/AbandonedCartDiscount10.jsx').default;
const AbandonedCartDiscount15 = require('../../emails/templates/AbandonedCartDiscount15.jsx').default;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Get email template and subject based on sequence number
 */
function getEmailConfig(sequenceNumber, data) {
  switch (sequenceNumber) {
    case 1:
      return {
        subject: '👋 You left something behind at Banners On The Fly',
        template: AbandonedCartReminder,
        discountPercentage: 0
      };
    case 2:
      return {
        subject: '🎁 Here\'s 10% off to complete your banner order',
        template: AbandonedCartDiscount10,
        discountPercentage: 10
      };
    case 3:
      return {
        subject: '🔥 LAST CHANCE: 15% off your custom banners (expires soon!)',
        template: AbandonedCartDiscount15,
        discountPercentage: 15
      };
    default:
      throw new Error(`Invalid sequence number: ${sequenceNumber}`);
  }
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

    if (!cartData.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Cart has no email address' })
      };
    }

    // Get email configuration
    const emailConfig = getEmailConfig(sequenceNumber, cartData);

    // Generate discount code if needed (for emails 2 and 3)
    let discountCode = cartData.discount_code;
    
    if (emailConfig.discountPercentage > 0 && !discountCode) {
      // Call generate-discount function
      const generateUrl = process.env.URL 
        ? `${process.env.URL}/.netlify/functions/generate-discount`
        : 'http://localhost:8888/.netlify/functions/generate-discount';

      const discountResponse = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartId: cartData.id,
          discountPercentage: emailConfig.discountPercentage,
          expirationHours: sequenceNumber === 2 ? 48 : 24
        })
      });

      if (discountResponse.ok) {
        const discountResult = await discountResponse.json();
        discountCode = discountResult.code;
        console.log(`[send-abandoned-cart-email] Generated discount code: ${discountCode}`);
      } else {
        console.error('[send-abandoned-cart-email] Failed to generate discount code');
      }
    }

    // Build recovery URL with discount code
    const baseUrl = 'https://bannersonthefly.com/cart';
    const recoveryUrl = discountCode 
      ? `${baseUrl}?discount=${discountCode}&cart=${cartData.id}`
      : `${baseUrl}?cart=${cartData.id}`;

    // Prepare template data
    const templateData = {
      customerEmail: cartData.email,
      cartItems: cartData.cart_contents || [],
      totalValue: parseFloat(cartData.total_value),
      discountCode: discountCode || undefined,
      recoveryUrl
    };

    // Render email HTML
    const emailHtml = render(
      React.createElement(emailConfig.template, templateData)
    );

    // Send email via Resend
    const emailResult = await resend.emails.send({
      from: 'Banners On The Fly <orders@bannersonthefly.com>',
      to: cartData.email,
      subject: emailConfig.subject,
      html: emailHtml,
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
          subject: emailConfig.subject,
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
