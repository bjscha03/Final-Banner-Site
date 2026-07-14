const { verifyAdminSession, readAdminSessionCookie } = require('./_shared/admin-session.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const result = verifyAdminSession(event);
  const adminSessionPresent = Boolean(readAdminSessionCookie(event));
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      authenticated: result.valid,
      isAdmin: result.valid,
      source: result.valid ? 'signed_admin_session' : 'none',
      diagnostics: {
        adminSessionPresent,
        adminSessionValid: result.valid,
        adminSessionExpired: result.reason === 'expired',
      },
    }),
  };
};
