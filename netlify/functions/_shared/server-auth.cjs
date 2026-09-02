'use strict';

const crypto = require('crypto');

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_HEADER = 'x-banners-admin-session';
const SESSION_COOKIE = 'banners_admin_session';
const PREVIEW_ADMIN_COOKIE = 'botf_preview_admin';

function isDeployPreviewEnvironment(event) {
  // Netlify function runtimes do not always expose CONTEXT, so the request host
  // is the authoritative signal for a password-gated deploy preview.
  const forwardedHost = String(event?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(event?.headers?.host || event?.headers?.Host || '').trim();
  return /^deploy-preview-\d+--.+\.netlify\.app(?::\d+)?$/i.test(host)
    || process.env.CONTEXT === 'deploy-preview'
    || /^https:\/\/deploy-preview-\d+--.+\.netlify\.app$/i.test(process.env.DEPLOY_PRIME_URL || '');
}

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

function cleanToken(value) {
  return String(value || '').replace(/^Bearer\s+/i, '').trim();
}

function readCookie(event, name) {
  const source = String(event?.headers?.cookie || event?.headers?.Cookie || '');
  const entry = source.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return '';
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return '';
  }
}

function readBodyToken(event) {
  if (event?.isBase64Encoded || typeof event?.body !== 'string') return '';
  // The client writes this field first. Reading only a small prefix avoids
  // parsing multi-megabyte artwork payloads before their size limit is checked.
  const match = event.body.slice(0, 2048).match(/"adminSessionToken"\s*:\s*"([A-Za-z0-9_.-]+)"/);
  return cleanToken(match?.[1]);
}

function readBearer(event) {
  const dedicated = event?.headers?.[SESSION_HEADER] || event?.headers?.['X-Banners-Admin-Session'];
  if (dedicated) return cleanToken(dedicated);
  const value = event?.headers?.authorization || event?.headers?.Authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(String(value))?.[1] || '';
  return bearer || readCookie(event, SESSION_COOKIE) || readBodyToken(event);
}

function sessionCookie(token, secure = true) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
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
  if (isDeployPreviewEnvironment(event) && readCookie(event, PREVIEW_ADMIN_COOKIE) === '1') {
    return { sub: 'preview-admin', email: '', admin: true, preview: true };
  }
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

module.exports = { createSessionToken, verifySessionToken, getSession, requireAdmin, unauthorized, sessionCookie };
