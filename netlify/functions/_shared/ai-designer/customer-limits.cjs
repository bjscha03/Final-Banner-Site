'use strict';
const crypto = require('crypto');
let schemaReady;

async function ensureQuotaSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql.transaction(tx => [
      tx`SELECT pg_advisory_xact_lock(hashtext('ai-designer-customer-limits-v1')::bigint)`,
      tx`CREATE TABLE IF NOT EXISTS ai_designer_customer_limits (
        quota_key TEXT PRIMARY KEY,
        hit_count INTEGER NOT NULL CHECK (hit_count > 0),
        reset_at TIMESTAMPTZ NOT NULL
      )`,
    ]).catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
}

// The conflict update and predicate run under PostgreSQL's row lock. Concurrent
// function instances cannot read the same count and both consume the last slot.
async function consumeQuota(sql, key, limit, windowMs) {
  const rows = await sql`
    INSERT INTO ai_designer_customer_limits AS quota (quota_key, hit_count, reset_at)
    VALUES (${key}, 1, NOW() + (${windowMs} * INTERVAL '1 millisecond'))
    ON CONFLICT (quota_key) DO UPDATE SET
      hit_count = CASE WHEN quota.reset_at <= NOW() THEN 1 ELSE quota.hit_count + 1 END,
      reset_at = CASE WHEN quota.reset_at <= NOW()
        THEN NOW() + (${windowMs} * INTERVAL '1 millisecond') ELSE quota.reset_at END
    WHERE quota.reset_at <= NOW() OR quota.hit_count < ${limit}
    RETURNING hit_count
  `;
  return rows.length ? { allowed: true } : { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
}

async function customerLimit(event, session, action, limit, windowMs) {
  if (session.admin === true) return null;
  const ip = String(event.netlify?.clientIp || '').trim();
  if (!ip) throw new Error('Client identity unavailable');
  const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!databaseUrl) throw new Error('Quota database unavailable');
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(databaseUrl);
  await ensureQuotaSchema(sql);
  const scope = event.netlify?.deployContext === 'production' ? 'production' : 'preview';
  const secret = process.env.AUTH_SESSION_SECRET || process.env.CLOUDINARY_API_SECRET;
  if (!secret) throw new Error('Quota identity unavailable');
  const hash = value => crypto.createHmac('sha256', secret).update(`ai-quota:${value}`).digest('hex');
  for (const key of [`${scope}/ip/${hash(ip)}/${action}`, `${scope}/session/${hash(session.sub)}/${action}`]) {
    const result = await consumeQuota(sql, key, limit, windowMs);
    if (!result.allowed) return result;
  }
  return null;
}
module.exports = { consumeQuota, customerLimit, ensureQuotaSchema };
