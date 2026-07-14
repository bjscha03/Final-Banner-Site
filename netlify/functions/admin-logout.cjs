const { clearAdminSessionCookie } = require('./_shared/admin-session.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) };
  }
  return {
    statusCode: 200,
    headers: { ...headers, 'Set-Cookie': clearAdminSessionCookie() },
    body: JSON.stringify({ ok: true }),
  };
};
