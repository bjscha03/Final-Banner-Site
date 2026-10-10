'use strict';

const crypto = require('node:crypto');
const twilio = require('twilio');

function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name] ?? '';
}

function settings() {
  let config = {};
  try { config = JSON.parse(env('BOF_SMS_SETTINGS') || '{}'); } catch { /* disabled */ }
  const accountSid = env('TWILIO_ACCOUNT_SID').trim();
  const authToken = env('TWILIO_AUTH_TOKEN').trim();
  const phoneNumber = String(config.phoneNumber || '').trim();
  const origin = String(config.origin || 'https://bannersonthefly.com').replace(/\/$/, '');
  const mode = config.mode === 'live' ? 'live' : 'test';
  const testPhones = Array.isArray(config.testPhones) ? config.testPhones.filter(isPhone) : [];
  const originAllowed = /^https:\/\/(?:bannersonthefly\.com|[a-z0-9-]+--bannersonthefly\.netlify\.app)$/.test(origin);
  return {
    accountSid, authToken, phoneNumber, origin, mode, testPhones,
    enabled: config.enabled === true && /^AC[a-f0-9]{32}$/i.test(accountSid)
      && authToken.length >= 20 && isPhone(phoneNumber) && originAllowed
      && (mode === 'live' || testPhones.length > 0),
    dailyMessages: Math.max(1, Math.min(10000, Number(config.dailyMessages) || 200)),
    monthlyMessages: Math.max(1, Math.min(100000, Number(config.monthlyMessages) || 2000)),
    sessionMessages: Math.max(10, Math.min(100, Number(config.sessionMessages) || 50)),
  };
}

function isPhone(value) { return /^\+1[2-9]\d{9}$/.test(String(value || '')); }
function allowedRecipient(phone, config = settings()) {
  return isPhone(phone) && (config.mode === 'live' || config.testPhones.includes(phone));
}
function tokenFor(session, config = settings()) {
  const payload = `${session.id}.${Math.floor(new Date(session.expires_at).getTime() / 1000)}`;
  return `${payload}.${crypto.createHmac('sha256', config.authToken).update(`bof-sms-v1:${payload}`).digest('base64url')}`;
}
function verifyToken(token, config = settings(), now = Date.now()) {
  const [id, expiry, supplied, ...extra] = String(token || '').split('.');
  if (extra.length || !/^[a-f0-9-]{36}$/i.test(id || '') || !/^\d{10}$/.test(expiry || '')
      || Number(expiry) * 1000 <= now || Number(expiry) * 1000 > now + 8 * 86400000) return null;
  const expected = crypto.createHmac('sha256', config.authToken).update(`bof-sms-v1:${id}.${expiry}`).digest('base64url');
  const left = Buffer.from(supplied || '');
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right) ? id : null;
}
function orderUrl(session, config = settings()) { return `${config.origin}/text-order/${tokenFor(session, config)}`; }

function verifyWebhook(request, params, config = settings()) {
  const url = new URL(request.url);
  // Pin the configured external origin; do not trust forwarded host headers.
  const externalUrl = `${config.origin}${url.pathname}${url.search}`;
  const signature = request.headers.get('x-twilio-signature') || '';
  return params.AccountSid === config.accountSid && Boolean(signature)
    && twilio.validateRequest(config.authToken, signature, externalUrl, params);
}

function workerSignature(body, config = settings()) {
  return crypto.createHmac('sha256', config.authToken).update(`bof-sms-worker:${body}`).digest('hex');
}
function verifyWorker(body, signature, config = settings()) {
  const expected = workerSignature(body, config);
  const left = Buffer.from(String(signature || ''));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
async function kickWorker(config = settings(), fetcher = fetch) {
  const body = JSON.stringify({ issuedAt: Date.now() });
  const response = await fetcher(`${config.origin}/.netlify/functions/twilio-worker-background`, {
    method: 'POST', body, headers: { 'content-type': 'application/json', 'x-bof-sms-worker': workerSignature(body, config) },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('SMS_WORKER_UNAVAILABLE');
}

function client(config = settings()) { return twilio(config.accountSid, config.authToken, { timeout: 20000, autoRetry: false }); }
const privateHeaders = { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

module.exports = { env, settings, isPhone, allowedRecipient, tokenFor, verifyToken, orderUrl, verifyWebhook, workerSignature, verifyWorker, kickWorker, client, privateHeaders };
