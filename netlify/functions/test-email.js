const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Check environment variables
    const hasResendKey = !!process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM || 'info@bannersonthefly.com';
    
    let emailTestResult = null;
    
    if (hasResendKey) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        // Test email send
        const { data, error } = await resend.emails.send({
          from: emailFrom,
          to: 'test@example.com',
          subject: 'Test Email - Configuration Check',
          html: '<p>This is a test email to verify Resend API configuration.</p>'
        });
        
        if (error) {
          emailTestResult = { success: false, error: error.message };
        } else {
          emailTestResult = { success: true, messageId: data?.id };
        }
      } catch (error) {
        emailTestResult = { success: false, error: error.message };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        config: {
          hasResendKey,
          emailFrom,
          nodeEnv: process.env.NODE_ENV,
          netlifyContext: process.env.CONTEXT
        },
        emailTest: emailTestResult
      })
    };

  } catch (error) {
    console.error('Email test failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: error.message 
      })
    };
  }
};
