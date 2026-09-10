'use strict';

const { createHash, createHmac } = require('crypto');
const { isIP } = require('node:net');

const CAPTURE_RATE_SCHEMA_LOCK = 'abandoned-cart-capture-rate-limit-v1';
const HASH_CONTEXT = 'bof-abandoned-cart-capture-v1';
const HASH_PATTERN = /^[a-f0-9]{64}$/;

// These limits protect the public guest-capture endpoint without treating each
// debounced update as a new cart. The IP and recipient quotas count distinct
// actors, while the session burst ceiling stops one actor from writing forever.
const CAPTURE_LIMITS = Object.freeze({
  session: Object.freeze({ windowSeconds: 60, maxActors: 1, maxHitsPerActor: 30 }),
  ip: Object.freeze({ windowSeconds: 60 * 60, maxActors: 60, maxHitsPerActor: null }),
  recipient: Object.freeze({ windowSeconds: 24 * 60 * 60, maxActors: 3, maxHitsPerActor: null }),
});

let schemaReadyPromise = null;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rateLimitSecret(env = process.env) {
  return clean(env.ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET)
    || clean(env.AUTH_SESSION_SECRET)
    || clean(env.ABANDONED_CART_RECOVERY_SECRET);
}

function hashIdentifier(scope, value, env = process.env) {
  const normalizedScope = clean(scope).toLowerCase();
  const normalizedValue = clean(value).toLowerCase();
  if (!normalizedScope || !normalizedValue) return null;
  const message = `${HASH_CONTEXT}\0${normalizedScope}\0${normalizedValue}`;
  const secret = rateLimitSecret(env);
  if (!secret && ['recipient', 'ip', 'ip-actor'].includes(normalizedScope)) return null;
  return secret
    ? createHmac('sha256', secret).update(message).digest('hex')
    : createHash('sha256').update(message).digest('hex');
}

function clientIpFromEvent(event, options = {}) {
  const headers = event?.headers || {};
  const read = (name) => {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    return clean(key ? headers[key] : '');
  };
  // Netlify supplies x-nf-client-connection-ip at the trusted edge. Production
  // contact capture must not fall back to a caller-spoofable forwarding header.
  const trustedEdgeIp = read('x-nf-client-connection-ip');
  if (isIP(trustedEdgeIp)) return trustedEdgeIp;
  if (options.trustedOnly === true) return '';

  // Local adapters and older non-production events may expose only a forwarded
  // hop. Still reject malformed values before hashing or quota accounting.
  const fallbackIp = read('x-forwarded-for').split(',')[0].trim() || read('client-ip');
  return isIP(fallbackIp) ? fallbackIp : '';
}

function buildCaptureRateRules({ sessionId, userId, email, ip }, env = process.env) {
  const owner = clean(userId) || clean(sessionId);
  if (!owner) return [];
  if (email && !rateLimitSecret(env)) {
    throw new Error('Contact capture requires a configured rate-limit HMAC secret');
  }
  const ownerHash = hashIdentifier('owner', owner, env);
  const recipientHash = email ? hashIdentifier('recipient', email, env) : null;
  const ipHash = ip ? hashIdentifier('ip', ip, env) : null;
  const rules = [{
    scope: 'session',
    subjectHash: ownerHash,
    actorHash: ownerHash,
    ...CAPTURE_LIMITS.session,
  }];

  if (ipHash) {
    rules.push({
      scope: 'ip',
      subjectHash: ipHash,
      // Changing the recipient consumes a new IP actor, but ordinary updates
      // to the same cart/contact reuse the existing actor row.
      actorHash: hashIdentifier('ip-actor', `${ownerHash}:${recipientHash || 'no-recipient'}`, env),
      ...CAPTURE_LIMITS.ip,
    });
  }
  if (recipientHash) {
    rules.push({
      scope: 'recipient',
      subjectHash: recipientHash,
      actorHash: ownerHash,
      ...CAPTURE_LIMITS.recipient,
    });
  }
  return rules;
}

async function ensureCaptureRateLimitSchema(sql) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = Promise.resolve().then(async () => {
      if (typeof sql?.transaction !== 'function') {
        throw new Error('Capture rate-limit schema requires transaction support');
      }
      await sql.transaction((transactionSql) => [
        transactionSql`SELECT pg_advisory_xact_lock(hashtext(${CAPTURE_RATE_SCHEMA_LOCK})::bigint)`,
        transactionSql`
          CREATE TABLE IF NOT EXISTS abandoned_cart_capture_rate_limits (
            scope TEXT NOT NULL CHECK (scope IN ('session', 'ip', 'recipient')),
            subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
            actor_hash TEXT NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
            window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count > 0),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (scope, subject_hash, actor_hash)
          )
        `,
        transactionSql`
          CREATE INDEX IF NOT EXISTS idx_abandoned_cart_capture_limits_window
            ON abandoned_cart_capture_rate_limits(scope, subject_hash, window_started_at)
        `,
        transactionSql`
          CREATE INDEX IF NOT EXISTS idx_abandoned_cart_capture_limits_last_seen
            ON abandoned_cart_capture_rate_limits(last_seen_at)
        `,
        transactionSql`
          DELETE FROM abandoned_cart_capture_rate_limits
           WHERE ctid IN (
             SELECT ctid
               FROM abandoned_cart_capture_rate_limits
              WHERE last_seen_at < NOW() - INTERVAL '2 days'
              ORDER BY last_seen_at ASC
              LIMIT 5000
           )
        `,
      ]);
    }).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

function truthyDatabaseBoolean(value) {
  return value === true || value === 't' || value === 1 || value === '1';
}

async function consumeRule(sql, rule) {
  if (!['session', 'ip', 'recipient'].includes(rule.scope)
      || !HASH_PATTERN.test(rule.subjectHash || '')
      || !HASH_PATTERN.test(rule.actorHash || '')) {
    throw new Error('Invalid capture rate-limit rule');
  }
  const lockKey = `capture-rate:${rule.scope}:${rule.subjectHash}`;
  const rows = await sql`
    WITH rate_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS acquired
    ), current_actor AS MATERIALIZED (
      SELECT limit_row.window_started_at, limit_row.hit_count
        FROM abandoned_cart_capture_rate_limits AS limit_row
        CROSS JOIN rate_lock
       WHERE limit_row.scope = ${rule.scope}
         AND limit_row.subject_hash = ${rule.subjectHash}
         AND limit_row.actor_hash = ${rule.actorHash}
       LIMIT 1
    ), active_actors AS MATERIALIZED (
      SELECT COUNT(*)::INTEGER AS actor_count
        FROM abandoned_cart_capture_rate_limits AS limit_row
        CROSS JOIN rate_lock
       WHERE limit_row.scope = ${rule.scope}
         AND limit_row.subject_hash = ${rule.subjectHash}
         AND limit_row.window_started_at > NOW() - (${rule.windowSeconds} * INTERVAL '1 second')
    ), decision AS MATERIALIZED (
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM current_actor
           WHERE window_started_at > NOW() - (${rule.windowSeconds} * INTERVAL '1 second')
        ) THEN (
          ${rule.maxHitsPerActor}::INTEGER IS NULL
          OR COALESCE((SELECT hit_count FROM current_actor), 0) < ${rule.maxHitsPerActor}
        )
        ELSE COALESCE((SELECT actor_count FROM active_actors), 0) < ${rule.maxActors}
      END AS allowed
    ), recorded AS (
      INSERT INTO abandoned_cart_capture_rate_limits (
        scope, subject_hash, actor_hash, window_started_at, hit_count, last_seen_at, created_at
      )
      SELECT ${rule.scope}, ${rule.subjectHash}, ${rule.actorHash}, NOW(), 1, NOW(), NOW()
        FROM decision
       WHERE allowed = TRUE
      ON CONFLICT (scope, subject_hash, actor_hash)
      DO UPDATE SET
        window_started_at = CASE
          WHEN abandoned_cart_capture_rate_limits.window_started_at
                 <= NOW() - (${rule.windowSeconds} * INTERVAL '1 second') THEN NOW()
          ELSE abandoned_cart_capture_rate_limits.window_started_at
        END,
        hit_count = CASE
          WHEN abandoned_cart_capture_rate_limits.window_started_at
                 <= NOW() - (${rule.windowSeconds} * INTERVAL '1 second') THEN 1
          WHEN ${rule.maxHitsPerActor}::INTEGER IS NULL
            THEN abandoned_cart_capture_rate_limits.hit_count
          ELSE abandoned_cart_capture_rate_limits.hit_count + 1
        END,
        last_seen_at = NOW()
      RETURNING hit_count
    )
    SELECT decision.allowed AND EXISTS (SELECT 1 FROM recorded) AS allowed,
           ${rule.scope}::TEXT AS scope,
           ${rule.windowSeconds}::INTEGER AS retry_after_seconds
      FROM decision
  `;
  return {
    allowed: truthyDatabaseBoolean(rows[0]?.allowed),
    scope: rule.scope,
    retryAfterSeconds: Number(rows[0]?.retry_after_seconds || rule.windowSeconds),
  };
}

async function consumeCaptureQuota(sql, capture, env = process.env) {
  await ensureCaptureRateLimitSchema(sql);
  const rules = buildCaptureRateRules(capture, env);
  for (const rule of rules) {
    const result = await consumeRule(sql, rule);
    if (!result.allowed) return result;
  }
  return { allowed: true, scope: null, retryAfterSeconds: 0 };
}

module.exports = {
  CAPTURE_LIMITS,
  buildCaptureRateRules,
  clientIpFromEvent,
  consumeCaptureQuota,
  hashIdentifier,
  rateLimitSecret,
  _test: {
    CAPTURE_RATE_SCHEMA_LOCK,
    consumeRule,
    ensureCaptureRateLimitSchema,
    resetSchemaPromise() { schemaReadyPromise = null; },
    truthyDatabaseBoolean,
  },
};
