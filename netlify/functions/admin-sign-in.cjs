'use strict';

const crypto = require('crypto');
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

  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!configuredPassword) {
    console.error('[admin-sign-in] ADMIN_PASSWORD is not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: 'Admin login is not configured. Set ADMIN_PASSWORD on the server.' }),
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

  const submitted = Buffer.from(password);
  const expected = Buffer.from(configuredPassword);
  const passwordMatches = submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);
  if (!passwordMatches) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Invalid admin password' }) };
  }

  // This server-issued identity is only a UI/session subject. Every protected
  // endpoint still verifies the signed HMAC token and its admin claim.
  const adminUser = { id: 'server-admin', email: '', is_admin: true };
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, user: adminUser, sessionToken: createSessionToken(adminUser) }),
  };
};
