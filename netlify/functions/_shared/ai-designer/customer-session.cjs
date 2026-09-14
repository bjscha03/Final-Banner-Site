'use strict';
const crypto = require('crypto');
const COOKIE_NAME = 'banners_ai_customer';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const secret = () => process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET || '';
const signature = payload => crypto.createHmac('sha256', secret()).update(`ai-customer-session:${payload}`).digest('base64url');

function createCustomerSession(now = Date.now()) {
  if (!secret()) throw new Error('AI session signing is unavailable');
  const session = { sub: `ai-guest:${crypto.randomUUID()}`, scope: 'ai-designer', exp: Math.floor(now / 1000) + TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const token = `${payload}.${signature(payload)}`;
  return { session, cookie: `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_SECONDS}` };
}
function readCustomerSession(event, now = Date.now()) {
  const cookies = String(event?.headers?.cookie || event?.headers?.Cookie || '').split(';').map(p => p.trim());
  const token = cookies.find(p => p.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token || token.length > 2048 || !secret()) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signed] = parts;
  const a = Buffer.from(signed), b = Buffer.from(signature(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.scope === 'ai-designer' && /^ai-guest:[a-f0-9-]{36}$/.test(session.sub || '') && session.exp > Math.floor(now / 1000) ? session : null;
  } catch { return null; }
}
module.exports = { createCustomerSession, readCustomerSession };
