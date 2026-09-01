'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const limiter = require('../_shared/abandoned-cart-capture-rate-limit.cjs');

const ENV = { ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET: 'capture-rate-test-secret' };

test('capture identifiers are keyed digests and never raw recipient or IP data', () => {
  const email = 'Buyer@Example.com';
  const ip = '203.0.113.19';
  const emailHash = limiter.hashIdentifier('recipient', email, ENV);
  const ipHash = limiter.hashIdentifier('ip', ip, ENV);

  assert.match(emailHash, /^[a-f0-9]{64}$/);
  assert.match(ipHash, /^[a-f0-9]{64}$/);
  assert.notEqual(emailHash, limiter.hashIdentifier('ip', email, ENV));
  assert.equal(emailHash.includes('buyer'), false);
  assert.equal(ipHash.includes('203'), false);
  assert.equal(limiter.hashIdentifier('recipient', email, {}), null);
  assert.equal(limiter.hashIdentifier('ip', ip, {}), null);
  assert.match(limiter.hashIdentifier('owner', 'session-local-only', {}), /^[a-f0-9]{64}$/);
  assert.throws(
    () => limiter.buildCaptureRateRules({
      sessionId: 'session_without_secret',
      email: 'buyer@example.com',
      ip,
    }, {}),
    /HMAC secret/,
  );
});

test('production capture accepts only a valid trusted edge client IP', () => {
  assert.equal(limiter.clientIpFromEvent({ headers: {
    'x-nf-client-connection-ip': '203.0.113.19',
    'x-forwarded-for': '198.51.100.8',
  } }, { trustedOnly: true }), '203.0.113.19');
  assert.equal(limiter.clientIpFromEvent({ headers: {
    'x-forwarded-for': '198.51.100.8',
  } }, { trustedOnly: true }), '');
  assert.equal(limiter.clientIpFromEvent({ headers: {
    'x-nf-client-connection-ip': 'not-an-ip',
  } }, { trustedOnly: true }), '');
  assert.equal(limiter.clientIpFromEvent({ headers: {
    'x-forwarded-for': '198.51.100.8, 203.0.113.19',
  } }), '198.51.100.8');
});

test('debounced updates reuse quota actors while new sessions and recipients consume distinct quota', () => {
  const base = {
    sessionId: 'session_legitimate_buyer_123',
    email: 'buyer@example.com',
    ip: '203.0.113.19',
  };
  const first = limiter.buildCaptureRateRules(base, ENV);
  const repeated = limiter.buildCaptureRateRules(base, ENV);
  const changedRecipient = limiter.buildCaptureRateRules({ ...base, email: 'other@example.com' }, ENV);
  const changedSession = limiter.buildCaptureRateRules({ ...base, sessionId: 'session_second_device_456' }, ENV);

  assert.deepEqual(repeated, first);
  assert.deepEqual(first.map((rule) => rule.scope), ['session', 'ip', 'recipient']);
  assert.equal(first.find((rule) => rule.scope === 'session').maxHitsPerActor, 30);
  assert.equal(first.find((rule) => rule.scope === 'recipient').maxActors, 3);
  assert.equal(first.find((rule) => rule.scope === 'recipient').maxHitsPerActor, null);
  assert.equal(first.find((rule) => rule.scope === 'ip').maxHitsPerActor, null);
  assert.equal(first.find((rule) => rule.scope === 'ip').actorHash,
    repeated.find((rule) => rule.scope === 'ip').actorHash);
  assert.notEqual(first.find((rule) => rule.scope === 'ip').actorHash,
    changedRecipient.find((rule) => rule.scope === 'ip').actorHash);
  assert.notEqual(first.find((rule) => rule.scope === 'recipient').actorHash,
    changedSession.find((rule) => rule.scope === 'recipient').actorHash);

  const signedInFirst = limiter.buildCaptureRateRules({
    ...base,
    userId: '1f692f32-9f8d-4a26-9a39-31c60f036331',
  }, ENV);
  const signedInSecondSession = limiter.buildCaptureRateRules({
    ...base,
    sessionId: 'session_second_device_456',
    userId: '1f692f32-9f8d-4a26-9a39-31c60f036331',
  }, ENV);
  assert.deepEqual(signedInSecondSession, signedInFirst);
});

test('the limiter bootstraps idempotent durable storage under an advisory transaction lock', async () => {
  limiter._test.resetSchemaPromise();
  const queries = [];
  const sql = (strings, ...values) => {
    queries.push({ query: strings.join('?'), values });
    return Promise.resolve([]);
  };
  sql.transaction = async (builder) => Promise.all(builder(sql));

  await Promise.all([
    limiter._test.ensureCaptureRateLimitSchema(sql),
    limiter._test.ensureCaptureRateLimitSchema(sql),
  ]);

  const source = queries.map(({ query }) => query).join('\n');
  assert.equal((source.match(/CREATE TABLE IF NOT EXISTS abandoned_cart_capture_rate_limits/g) || []).length, 1);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /PRIMARY KEY \(scope, subject_hash, actor_hash\)/);
  assert.match(source, /last_seen_at < NOW\(\) - INTERVAL '2 days'/);
});

test('capture use self-bootstraps a branch missing migration 036 before consuming quota', async () => {
  limiter._test.resetSchemaPromise();
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.join('?');
    queries.push({ query, values });
    if (/WITH rate_lock AS MATERIALIZED/.test(query)) {
      return [{ allowed: true, retry_after_seconds: 60 }];
    }
    return [];
  };
  sql.transaction = async (builder) => Promise.all(builder(sql));

  const result = await limiter.consumeCaptureQuota(sql, {
    sessionId: 'session_bootstrap_without_036',
    email: 'buyer@example.com',
    ip: '203.0.113.20',
  }, ENV);

  assert.equal(result.allowed, true);
  const createIndex = queries.findIndex(({ query }) => (
    /CREATE TABLE IF NOT EXISTS abandoned_cart_capture_rate_limits/.test(query)
  ));
  const consumeIndex = queries.findIndex(({ query }) => /WITH rate_lock AS MATERIALIZED/.test(query));
  assert.ok(createIndex >= 0);
  assert.ok(consumeIndex > createIndex);
  assert.equal(queries.filter(({ query }) => /WITH rate_lock AS MATERIALIZED/.test(query)).length, 3);
});

test('a durable rule is serialized and returns a bounded retry signal', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{ allowed: false, retry_after_seconds: 3600 }];
  };
  const rule = limiter.buildCaptureRateRules({
    sessionId: 'session_rate_limited_123',
    email: 'buyer@example.com',
    ip: '203.0.113.19',
  }, ENV).find((candidate) => candidate.scope === 'ip');

  const result = await limiter._test.consumeRule(sql, rule);
  assert.deepEqual(result, { allowed: false, scope: 'ip', retryAfterSeconds: 3600 });
  assert.match(calls[0].query, /pg_advisory_xact_lock/);
  assert.match(calls[0].query, /ON CONFLICT \(scope, subject_hash, actor_hash\)/);
  assert.match(calls[0].query, /WHEN \?::INTEGER IS NULL[\s\S]*?THEN abandoned_cart_capture_rate_limits\.hit_count/);
  assert.equal(calls[0].values.includes('buyer@example.com'), false);
  assert.equal(calls[0].values.includes('203.0.113.19'), false);
});

test('migration 036 stores only hashed limiter identifiers', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname,
    '../../../migrations/036_abandoned_cart_capture_rate_limits.sql',
  ), 'utf8');
  assert.match(migration, /subject_hash TEXT NOT NULL/);
  assert.match(migration, /actor_hash TEXT NOT NULL/);
  assert.doesNotMatch(migration, /\bemail\s+TEXT\b/i);
  assert.doesNotMatch(migration, /\bip(?:_address)?\s+TEXT\b/i);
});
