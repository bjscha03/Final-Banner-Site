'use strict';

const crypto = require('crypto');
const { createSessionToken } = require('../server-auth.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Origin',
};

function response(statusCode, payload, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(payload) };
}

function requestOrigin(event) {
  const origin = String(event?.headers?.origin || '').trim();
  const host = String(event?.headers?.['x-forwarded-host'] || event?.headers?.host || '').trim();
  const proto = String(event?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return { origin, expected: host ? `${proto}://${host}` : '' };
}

function configuredPasswordHash() {
  const configuredHash = String(process.env.ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(configuredHash)) return Buffer.from(configuredHash, 'hex');
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  if (configuredPassword.length >= 12) return crypto.createHash('sha256').update(configuredPassword).digest();
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...headers, Allow: 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { ok: false, error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });

  const { origin, expected } = requestOrigin(event);
  if (!origin || !expected || origin !== expected) {
    return response(403, { ok: false, error: 'This request must come from the same site.' });
  }

  const expectedHash = configuredPasswordHash();
  if (!expectedHash || !(process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET)) {
    return response(503, { ok: false, error: 'Admin authentication is not configured for this deployment.' });
  }

  let password;
  try {
    ({ password } = JSON.parse(event.body || '{}'));
  } catch {
    return response(400, { ok: false, error: 'Invalid request body' });
  }
  if (!password || typeof password !== 'string') {
    return response(400, { ok: false, error: 'Password is required' });
  }

  const submittedHash = crypto.createHash('sha256').update(password).digest();
  if (!crypto.timingSafeEqual(submittedHash, expectedHash)) {
    return response(401, { ok: false, error: 'Invalid admin password' });
  }

  const adminUser = { id: 'server-admin', email: '', is_admin: true };
  return response(200, { ok: true, user: adminUser, sessionToken: createSessionToken(adminUser) });
};
