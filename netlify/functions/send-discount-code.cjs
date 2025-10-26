const { neon } = require('@neondatabase/serverless');
const https = require('https');

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

async function sendEmailPostmark(to, code, expiresAt) {
  const apiKey = process.env.POSTMARK_API_KEY;
  
  if (!apiKey) {
    console.warn('[send-discount-code] POSTMARK_API_KEY not configured, skipping email');
    return { success: false, error: 'Email not configured' };
  }

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const emailData = JSON.stringify({
    From: process.env.POSTMARK_FROM_EMAIL || 'noreply@bannersonthefly.com',
    To: to,
    Subject: 'Your 20% Off Code Inside 🎉',
    HtmlBody: \`
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #18448D 0%, #1a5bb8 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 32px;">20% OFF</h1>
                    <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 18px;">Your First Banner Order</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">
                      Thanks for your interest! Here's your exclusive discount code:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                      <tr>
                        <td style="background-color: #f9fafb; border: 2px dashed #18448D; border-radius: 12px; padding: 24px; text-align: center;">
                          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Your Code</p>
                          <p style="margin: 0; color: #18448D; font-size: 28px; font-weight: bold; font-family: monospace;">\${code}</p>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="https://bannersonthefly.com/design" style="display: inline-block; background: #18448D; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                            Start Designing →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
                      <strong>Expires:</strong> \${expiryDate}<br>
                      <strong>One-time use per customer</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    \`,
    TextBody: \`Your 20% Off Code: \${code}\\n\\nUse code \${code} at checkout to save 20%.\\n\\nExpires: \${expiryDate}\\n\\nStart designing: https://bannersonthefly.com/design\`,
    MessageStream: 'outbound'
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.postmarkapp.com',
      port: 443,
      path: '/email',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': apiKey,
        'Content-Length': Buffer.byteLength(emailData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[send-discount-code] Email sent:', to);
          resolve({ success: true });
        } else {
          console.error('[send-discount-code] Error:', res.statusCode, data);
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error('[send-discount-code] Request error:', error);
      reject(error);
    });

    req.write(emailData);
    req.end();
  });
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

    const rateLimitCheck = await sql\`SELECT check_ip_rate_limit(\${clientIP}) as allowed\`;
    
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

    await sql\`
      INSERT INTO email_captures (email, consent, source, ip, user_agent)
      VALUES (\${normalizedEmail}, \${consent}, \${source}, \${clientIP}, \${userAgent})
    \`;

    const result = await sql\`
      SELECT * FROM get_or_create_discount_code(
        \${normalizedEmail},
        \${clientIP},
        \${userAgent},
        \${campaign}
      )
    \`;

    if (result.length === 0) {
      throw new Error('Failed to generate discount code');
    }

    const { code, discount_percentage, expires_at, is_new } = result[0];

    console.log('[send-discount-code] Code generated:', { code, isNew: is_new });

    sendEmailPostmark(normalizedEmail, code, expires_at).catch(error => {
      console.error('[send-discount-code] Email send failed:', error);
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        code,
        discountPercentage: discount_percentage,
        expiresAt: expires_at,
        isNew: is_new,
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
