'use strict';
const crypto = require('crypto');

// Conditional writes prevent concurrent function instances from exceeding a quota.
async function consumeQuota(store, key, limit, windowMs, now = Date.now()) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const current = existing?.data?.resetAt > now ? existing.data : { count: 0, resetAt: now + windowMs };
    if (current.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    const result = await store.setJSON(key, { count: current.count + 1, resetAt: current.resetAt }, existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true });
    if (result.modified) return { allowed: true };
  }
  return { allowed: false, retryAfter: 5 };
}
async function customerLimit(event, session, action, limit, windowMs) {
  if (session.admin === true) return null;
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'ai-designer-customer-limits', consistency: 'strong' });
  const ip = String(event.netlify?.clientIp || '').trim();
  // Missing trusted platform identity fails closed; never trust a caller's X-Forwarded-For.
  if (!ip) throw new Error('Client identity unavailable');
  const scope = event.netlify?.deployContext === 'production' ? 'production' : 'preview';
  const hash = crypto.createHash('sha256').update(ip).digest('hex');
  for (const key of [`${scope}/ip/${hash}/${action}`, `${scope}/session/${session.sub}/${action}`]) {
    const result = await consumeQuota(store, key, limit, windowMs);
    if (!result.allowed) return result;
  }
  return null;
}
module.exports = { consumeQuota, customerLimit };
