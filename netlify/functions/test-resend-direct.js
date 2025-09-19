// Test Resend API directly
const { Resend } = require('resend');

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
    if (!process.env.RESEND_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'RESEND_API_KEY not configured' })
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    console.log('Testing Resend API with key:', process.env.RESEND_API_KEY.substring(0, 10) + '...');
    
    const result = await resend.emails.send({
      from: 'orders@bannersonthefly.com',
      to: 'info@bannersonthefly.com',
      subject: 'Test Admin Notification',
      html: '<p>This is a test admin notification email.</p>'
    });
    
    console.log('Resend API Response:', JSON.stringify(result, null, 2));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        result: result,
        messageId: result.id,
        resultKeys: Object.keys(result),
        resultData: result.data ? Object.keys(result.data) : 'no data property'
      })
    };
    
  } catch (error) {
    console.error('Resend API Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error,
        stack: error.stack
      })
    };
  }
};
