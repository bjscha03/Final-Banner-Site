const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function getClientIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         event.headers['client-ip'] ||
         '0.0.0.0';
}

async function sendEmailResend(to, code, expiresAt) {
  try {
    const { Resend } = require('resend');
    
    if (!process.env.RESEND_API_KEY) {
      console.error('[send-discount-code] RESEND_API_KEY not configured!');
      return { success: false, error: 'Email not configured' };
    }

    console.log('[send-discount-code] Initializing Resend with API key:', process.env.RESEND_API_KEY.substring(0, 10) + '...');
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailFrom = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
    
    console.log('[send-discount-code] Sending email from:', emailFrom, 'to:', to);
    
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const html = `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Your 20% Discount Code</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f3f4f6;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6;">
          <tr>
            <td align="center" style="padding: 20px 0;">
              <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px;">
                
                <!-- Logo Header -->
                <tr>
                  <td align="center" style="padding: 40px 20px; background-color: #ffffff;">
                    <img src="https://bannersonthefly.com/images/header-logo.png" alt="Banners on the Fly" width="200" style="display: block; max-width: 200px; height: auto;" />
                  </td>
                </tr>
                
                <!-- Orange Banner -->
                <tr>
                  <td align="center" style="padding: 50px 20px; background-color: #ff6b35;">
                    <h1 style="margin: 0; padding: 0; color: #ffffff; font-size: 48px; font-weight: bold; font-family: Arial, sans-serif;">20% OFF</h1>
                    <p style="margin: 10px 0 0 0; padding: 0; color: #ffffff; font-size: 20px; font-family: Arial, sans-serif;">Your First Banner Order</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 30px 0; color: #374151; font-size: 18px; text-align: center; font-family: Arial, sans-serif; line-height: 1.6;">
                      Thanks for your interest! Here's your exclusive discount code:
                    </p>
                    
                    <!-- Discount Code Box -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
                      <tr>
                        <td align="center" style="padding: 30px 20px; background-color: #fff5f0; border: 3px dashed #ff6b35; border-radius: 8px;">
                          <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; font-family: Arial, sans-serif; font-weight: bold;">YOUR CODE</p>
                          <p style="margin: 0; color: #ff6b35; font-size: 36px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 3px;">${code}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" style="border-radius: 50px; background-color: #ff6b35;">
                                <a href="https://bannersonthefly.com/design" target="_blank" style="font-size: 18px; font-family: Arial, sans-serif; color: #ffffff; text-decoration: none; padding: 18px 50px; border-radius: 50px; display: inline-block; font-weight: bold;">Start Designing →</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Expiry Info -->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 30px 0 0 0; background-color: #f9fafb; border-radius: 8px;">
                      <tr>
                        <td align="center" style="padding: 20px;">
                          <p style="margin: 0 0 5px 0; color: #374151; font-size: 14px; font-family: Arial, sans-serif;">
                            <strong style="color: #18448D;">Expires:</strong> ${expiryDate}
                          </p>
                          <p style="margin: 0; color: #6b7280; font-size: 13px; font-family: Arial, sans-serif;">
                            One-time use per customer
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td align="center" style="padding: 20px 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: Arial, sans-serif; line-height: 1.6;">
                      © ${new Date().getFullYear()} Banners on the Fly. All rights reserved.<br/>
                      Professional custom banners delivered fast.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: emailFrom,
      to: to,
      subject: 'Your 20% Off Code Inside 🎉',
      html: html,
      text: `Your 20% Off Code: ${code}\n\nUse code ${code} at checkout to save 20%.\n\nExpires: ${expiryDate}\n\nStart designing: https://bannersonthefly.com/design`
    });

    console.log('[send-discount-code] Resend API response:', JSON.stringify(result));

    if (result.error) {
      console.error('[send-discount-code] Resend error:', result.error);
      return { success: false, error: result.error };
    }

    console.log('[send-discount-code] Email sent successfully! ID:', result.data?.id);
    return { success: true, id: result.data?.id };
    
  } catch (error) {
    console.error('[send-discount-code] Email send exception:', error.message, error.stack);
    return { success: false, error: error.message };
  }
}

exports.handler = async (event, context) => {
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
    const { email, consent, source = 'first_visit' } = JSON.parse(event.body || '{}');

    if (!email || !isValidEmail(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid email address is required' })
      };
    }

    if (!consent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Privacy policy consent is required' })
      };
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('[send-discount-code] No database URL found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration error' })
      };
    }

    const sql = neon(databaseUrl);
    const normalizedEmail = email.toLowerCase().trim();
    const clientIP = getClientIP(event);
    const userAgent = event.headers['user-agent'] || '';
    const campaign = source === 'first_visit' ? 'popup_first_visit' : 'popup_exit_intent';

    console.log('[send-discount-code] Request:', { email: normalizedEmail, source, ip: clientIP });

    const rateLimitCheck = await sql`SELECT check_ip_rate_limit(${clientIP}::INET) as allowed`;
    
    if (!rateLimitCheck[0].allowed) {
      console.warn('[send-discount-code] Rate limit exceeded:', clientIP);
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'Too many requests. Please try again tomorrow.',
          rateLimited: true
        })
      };
    }

    await sql`
      INSERT INTO email_captures (email, consent, source, ip, user_agent)
      VALUES (${normalizedEmail}, ${consent}, ${source}, ${clientIP}::INET, ${userAgent})
    `;

    const result = await sql`
      SELECT * FROM get_or_create_discount_code(
        ${normalizedEmail},
        ${clientIP}::INET,
        ${userAgent},
        ${campaign}
      )
    `;

    if (result.length === 0) {
      throw new Error('Failed to generate discount code');
    }

    const { code, discount_percentage, expires_at, is_new } = result[0];

    console.log('[send-discount-code] Code generated:', { code, isNew: is_new });

    // Send email and wait for result (with timeout protection)
    let emailResult = { success: false, error: 'Email not sent' };
    try {
      // Set a timeout to prevent blocking too long
      const emailPromise = sendEmailResend(normalizedEmail, code, expires_at);
      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve({ success: false, error: 'Email timeout after 8 seconds' }), 8000)
      );
      
      emailResult = await Promise.race([emailPromise, timeoutPromise]);
      
      if (emailResult.success) {
        console.log('[send-discount-code] ✅ Email sent successfully to:', normalizedEmail);
      } else {
        console.error('[send-discount-code] ❌ Email failed:', emailResult.error);
      }
    } catch (emailError) {
      console.error('[send-discount-code] ❌ Email exception:', emailError);
      emailResult = { success: false, error: emailError.message };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        code,
        discountPercentage: discount_percentage,
        expiresAt: expires_at,
        isNew: is_new,
        emailSent: emailResult.success,
        emailError: emailResult.success ? undefined : emailResult.error,
        message: is_new 
          ? 'Discount code created and sent to your email!' 
          : 'Your existing code has been resent to your email!'
      })
    };

  } catch (error) {
    console.error('[send-discount-code] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to process request',
        message: error.message 
      })
    };
  }
};
