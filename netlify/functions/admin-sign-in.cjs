'use strict';

const signIn = require('./sign-in.cjs');
const { createSessionToken } = require('./_shared/server-auth.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!configuredEmail) {
    console.error('[admin-sign-in] ADMIN_EMAIL is not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'Admin login is not configured. Set ADMIN_EMAIL on the server.' }),
    };
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid request body' }) };
  }
  if (!password || typeof password !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Password is required' }) };
  }

  const response = await signIn.handler({
    ...event,
    body: JSON.stringify({ email: configuredEmail, password }),
  }, context);
  if (response.statusCode < 200 || response.statusCode >= 300) return { ...response, headers: { ...headers, ...(response.headers || {}) } };

  const payload = JSON.parse(response.body || '{}');
  if (!payload.ok || !payload.user || String(payload.user.email || '').toLowerCase() !== configuredEmail) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Invalid admin password' }) };
  }

  const adminUser = { ...payload.user, is_admin: true };
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, user: adminUser, sessionToken: createSessionToken(adminUser) }),
  };
};
