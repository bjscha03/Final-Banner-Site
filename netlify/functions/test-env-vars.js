// Test script to check environment variables
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const envVars = {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET' : 'NOT_SET',
    EMAIL_FROM: process.env.EMAIL_FROM || 'NOT_SET',
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || 'NOT_SET',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'NOT_SET',
    NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL ? 'SET' : 'NOT_SET',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET'
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ envVars })
  };
};
