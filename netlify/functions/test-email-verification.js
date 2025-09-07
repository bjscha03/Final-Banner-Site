const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

// Send email using Resend
async function sendEmail(type, payload) {
  try {
    const { Resend } = require('resend');

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'RESEND_API_KEY not configured' };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
    const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@bannersonthefly.com';

    let subject, html;
    
    if (type === 'user.verify') {
      subject = 'Verify Your Email Address - Banners on the Fly';
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Welcome to Banners on the Fly!</h2>
          
          <p>Hi ${payload.userName},</p>
          
          <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${payload.verifyUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>

          <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #6b7280;">${payload.verifyUrl}</p>

          <p style="color: #6b7280; font-size: 14px;">
            This verification link will expire in 24 hours for security reasons.
          </p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Questions? Contact us at support@bannersonthefly.com<br>
            Banners on the Fly - Custom Banners Made Easy
          </p>
        </div>
      `;
    } else {
      return { ok: false, error: `Unknown email type: ${type}` };
    }

    const result = await resend.emails.send({
      from: emailFrom,
      to: payload.to,
      replyTo: emailReplyTo,
      subject,
      html
    });

    if (result.error) {
      return { ok: false, error: result.error.message, details: result.error };
    }

    return { ok: true, id: result.data.id };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('Testing email verification system...');
    
    // Test email sending
    const testEmail = 'testverify3@example.com';
    const verifyUrl = 'https://bannersonthefly.com/verify-email?token=test123';
    
    const emailResult = await sendEmail('user.verify', {
      to: testEmail,
      verifyUrl,
      userName: 'Test User'
    });

    console.log('Email result:', emailResult);

    // Check if email_events table exists and log the attempt
    let logResult = null;
    try {
      await sql`
        INSERT INTO email_events (type, to_email, provider_msg_id, status, error_message, created_at)
        VALUES ('user.verify', ${testEmail}, ${emailResult.ok ? emailResult.id : null}, ${emailResult.ok ? 'sent' : 'error'}, ${emailResult.ok ? null : emailResult.error}, NOW())
      `;
      logResult = 'Email attempt logged successfully';
    } catch (logError) {
      logResult = `Failed to log email attempt: ${logError.message}`;
    }

    // Check recent email events
    let recentEvents = [];
    try {
      recentEvents = await sql`
        SELECT type, to_email, status, error_message, created_at 
        FROM email_events 
        WHERE to_email LIKE '%testverify%' 
        ORDER BY created_at DESC 
        LIMIT 5
      `;
    } catch (queryError) {
      console.error('Failed to query email events:', queryError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        emailResult,
        logResult,
        recentEvents,
        resendApiKeyConfigured: !!process.env.RESEND_API_KEY,
        databaseUrlConfigured: !!process.env.NETLIFY_DATABASE_URL
      }),
    };
  } catch (error) {
    console.error('Test failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Test failed', 
        details: error.message 
      }),
    };
  }
};
