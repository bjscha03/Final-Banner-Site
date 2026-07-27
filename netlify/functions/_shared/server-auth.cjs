'use strict';

const crypto = require('crypto');

const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret() {
  return process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET || '';
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createSessionToken(user) {
  if (!secret()) throw new Error('AUTH_SESSION_SECRET is not configured');
  const payload = base64url(JSON.stringify({
    sub: user.id,
    email: String(user.email || '').toLowerCase(),
    admin: user.is_admin === true,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  const signature = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readBearer(event) {
  const value = event?.headers?.authorization || event?.headers?.Authorization || '';
  return /^Bearer\s+(.+)$/i.exec(String(value))?.[1] || '';
}

function verifySessionToken(token) {
  if (!token || !secret()) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function getSession(event) {
  return verifySessionToken(readBearer(event));
}

function unauthorized(message = 'Authentication required') {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error: 'UNAUTHORIZED', message }),
  };
}

function requireAdmin(event) {
  const session = getSession(event);
  return session?.admin === true ? { ok: true, session } : { ok: false, response: unauthorized('Verified administrator session required') };
}

module.exports = { createSessionToken, verifySessionToken, getSession, requireAdmin, unauthorized };
