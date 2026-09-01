import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _test as dispatcher } from '../reconcile-pending-paypal.mjs';
import { _test as background } from '../reconcile-pending-paypal-background.mjs';

const require = createRequire(import.meta.url);
const queue = require('../_shared/admin-payment-reconciliation.cjs');
const capture = require('../_shared/legacy/paypal-capture-final.cjs');
const migrationRunner = require('../../../migrations/run-migration.cjs');

const queryText = (query) => Array.isArray(query) ? query.join('?') : String(query || '');

test('040 is atomic/idempotent and repairs only derived queue state on a partial rollout', () => {
  const source = fs.readFileSync(
    path.resolve('migrations/040_admin_payment_reconciliation_queue.sql'),
    'utf8',
  );
  const statements = migrationRunner.prepareMigrationStatements(source);

  assert.match(source, /\bBEGIN;/);
  assert.match(source, /\bCOMMIT;\s*$/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.admin_payment_reconciliation_queue/);
  assert.match(source, /order_id UUID PRIMARY KEY REFERENCES public\.orders\(id\) ON DELETE CASCADE/);
  assert.match(source, /paypal_order_id TEXT NOT NULL/);
  assert.match(source, /attempt_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(source, /next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  assert.match(source, /lease_token UUID/);
  assert.match(source, /lease_until TIMESTAMPTZ/);
  assert.match(source, /last_error TEXT/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS paypal_order_id TEXT/);
  assert.match(source, /UPDATE public\.admin_payment_reconciliation_queue AS queue[\s\S]*orders\.paypal_order_id/);
  assert.match(source, /DELETE FROM public\.admin_payment_reconciliation_queue[\s\S]*paypal_order_id/);
  assert.match(source, /ALTER COLUMN paypal_order_id SET NOT NULL/);
  assert.doesNotMatch(source, /(?:UPDATE|DELETE FROM)\s+orders\b/i);
  assert.doesNotMatch(source, /\bDROP\s+(?:TABLE|COLUMN)\b/i);
  assert.doesNotMatch(source, /\bTRUNCATE\b/i);
  assert.match(source, /constraint_state\.confrelid = 'public\.orders'::regclass/);
  assert.match(source, /constraint_state\.confdeltype = 'c'/);
  assert.match(source, /pg_get_expr\(constraint_state\.conbin/);
  assert.match(source, /index_state\.indrelid = 'public\.admin_payment_reconciliation_queue'::regclass/);
  assert.match(source, /index_state\.indkey::text/);
  assert.match(source, /incompatible column types/);
  assert.match(source, /DROP CONSTRAINT admin_payment_reconciliation_lease_pair/);
  assert.match(source, /DROP INDEX public\.idx_admin_payment_reconciliation_due/);
  assert.ok(statements.length > 5);
});

test('discovery preserves stable retry state and resets only a changed provider generation', () => {
  const source = queue.buildSeedQuery();
  assert.match(source, /order_id, paypal_order_id, attempt_count/);
  assert.match(source, /queue\.paypal_order_id IS DISTINCT FROM orders\.paypal_order_id/);
  assert.match(source, /ON CONFLICT \(order_id\) DO UPDATE/);
  assert.match(source, /attempt_count = 0/);
  assert.match(source, /next_attempt_at = NOW\(\)/);
  assert.match(source, /lease_token = NULL/);
  assert.match(source, /WHERE admin_payment_reconciliation_queue\.paypal_order_id\s+IS DISTINCT FROM EXCLUDED\.paypal_order_id/);
  assert.match(source, /captured_bookkeeping_pending[\s\S]*urgent_lane/);
  assert.match(source, /urgent_lane[\s\S]*WHERE eligible\.bookkeeping_pending[\s\S]*LIMIT \$3/);
  assert.match(source, /recent_lane[\s\S]*order_created_at DESC[\s\S]*LIMIT \$4/);
  assert.match(source, /order_created_at DESC NULLS LAST/);
  assert.match(source, /oldest_lane[\s\S]*order_created_at ASC[\s\S]*LIMIT \$1/);
  assert.deepEqual(queue.seedLaneLimits(500), { urgent: 100, recent: 200, oldestReserved: 1 });
});

test('claims are bounded, lease-safe, and fair after misses back off', () => {
  const claim = queue.buildClaimQuery();
  const prune = queue.buildPruneQuery();
  const eligibility = queue.eligiblePayPalPredicate('orders', '$2');
  assert.match(claim, /queue\.next_attempt_at <= NOW\(\)/);
  assert.match(claim, /queue\.lease_until IS NULL OR queue\.lease_until <= NOW\(\)/);
  assert.match(claim, /urgent_lane[\s\S]*captured_bookkeeping_pending[\s\S]*LIMIT \$5/);
  assert.match(claim, /recent_lane[\s\S]*orders\.created_at DESC[\s\S]*LIMIT \$6/);
  assert.match(claim, /recent_lane[\s\S]*<> 'captured_bookkeeping_pending'[\s\S]*LIMIT \$6/);
  assert.match(
    claim,
    /ORDER BY COALESCE\([\s\S]*orders\.created_at >= NOW\(\) - INTERVAL '24 hours',[\s\S]*FALSE[\s\S]*\) DESC,[\s\S]*orders\.created_at DESC NULLS LAST,[\s\S]*\(queue\.attempt_count = 0\) DESC/,
  );
  assert.match(claim, /oldest_lane[\s\S]*queue\.next_attempt_at ASC[\s\S]*LIMIT CASE WHEN \$1 > 0 THEN 1 ELSE 0 END/);
  assert.match(claim, /filler_lane[\s\S]*LIMIT \$1/);
  assert.match(claim, /FOR UPDATE OF queue SKIP LOCKED/);
  assert.match(claim, /LIMIT \$1/);
  assert.match(claim, /queue\.paypal_order_id = orders\.paypal_order_id/);
  assert.match(prune, /lease_until IS NULL OR queue\.lease_until <= NOW\(\)/);
  assert.match(prune, /NOT \([\s\S]*status/);
  assert.match(prune, /LIMIT \$1/);
  assert.match(eligibility, /captured_bookkeeping_pending/);
  assert.match(eligibility, /'paid','in_production','shipped','delivered','fulfilled','refunded'/);
  assert.match(eligibility, /paypal_capture_id[\s\S]*IS NOT NULL/);
  assert.equal(queue.retryDelaySeconds(0), 300);
  assert.equal(queue.retryDelaySeconds(1), 600);
  assert.equal(queue.retryDelaySeconds(100), 21600);
  assert.equal(queue.clippedError('x'.repeat(900)).length, 500);
  assert.deepEqual(queue.claimLaneLimits(5), { urgent: 2, recent: 2, oldestReserved: 1 });
  assert.deepEqual(queue.claimLaneLimits(1), { urgent: 0, recent: 0, oldestReserved: 1 });
});

test('five poison candidates run in parallel, back off, and cannot starve the older due candidate', async () => {
  queue.resetSchemaReadinessForTests();
  const poison = Array.from({ length: 5 }, (_, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index}`,
    paypal_order_id: `PAYPAL-POISON-${index}`,
    attempt_count: 0,
    lease_token: '11111111-1111-4111-8111-111111111111',
  }));
  const older = {
    id: '00000000-0000-4000-8000-000000000099',
    paypal_order_id: 'PAYPAL-OLDER-RECOVERABLE',
    attempt_count: 0,
    lease_token: '22222222-2222-4222-8222-222222222222',
  };
  let sweep = 0;
  let active = 0;
  let maxActive = 0;
  const sql = async (query) => {
    const text = queryText(query);
    if (/WITH target AS/i.test(text)) return [{ ready: true }];
    if (/WITH stale AS/i.test(text) || /INSERT INTO admin_payment_reconciliation_queue/i.test(text)) return [];
    if (/WITH urgent_lane AS/i.test(text)) return sweep++ === 0 ? poison : [older];
    if (/UPDATE admin_payment_reconciliation_queue[\s\S]*attempt_count = attempt_count \+ 1/i.test(text)) {
      return [{ order_id: 'retry' }];
    }
    if (/DELETE FROM admin_payment_reconciliation_queue/i.test(text)) return [{ order_id: older.id }];
    throw new Error(`unexpected SQL: ${text}`);
  };

  const first = await queue.runReconciliationBatch({
    sql,
    ownerToken: poison[0].lease_token,
    reconcileCandidate: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { disposition: 'retry', error: 'provider still pending' };
    },
  });
  const second = await queue.runReconciliationBatch({
    sql,
    ownerToken: older.lease_token,
    reconcileCandidate: async (candidate) => ({
      disposition: candidate.id === older.id ? 'complete' : 'retry',
    }),
  });

  assert.equal(first.claimed, 5);
  assert.equal(first.retried, 5);
  assert.equal(maxActive, 5);
  assert.equal(second.claimed, 1);
  assert.equal(second.completed, 1);
  queue.resetSchemaReadinessForTests();
});

test('a large historical backlog reserves one claim for oldest progress and admits urgent and recent work immediately', async () => {
  queue.resetSchemaReadinessForTests();
  const candidates = [
    { id: '10000000-0000-4000-8000-000000000001', paypal_order_id: 'URGENT-CAPTURED', attempt_count: 0, lease_token: '33333333-3333-4333-8333-333333333333', claim_lane: 'urgent' },
    { id: '10000000-0000-4000-8000-000000000002', paypal_order_id: 'RECENT-RETRY-1', attempt_count: 1, lease_token: '33333333-3333-4333-8333-333333333333', claim_lane: 'recent' },
    { id: '10000000-0000-4000-8000-000000000003', paypal_order_id: 'RECENT-NEW-2', attempt_count: 0, lease_token: '33333333-3333-4333-8333-333333333333', claim_lane: 'recent' },
    { id: '10000000-0000-4000-8000-000000000004', paypal_order_id: 'OLDEST-OF-10000', attempt_count: 7, lease_token: '33333333-3333-4333-8333-333333333333', claim_lane: 'oldest' },
    { id: '10000000-0000-4000-8000-000000000005', paypal_order_id: 'FAIR-FILLER', attempt_count: 1, lease_token: '33333333-3333-4333-8333-333333333333', claim_lane: 'fair_filler' },
  ];
  let seedParameters;
  let claimParameters;
  const observedLanes = [];
  const sql = async (query, parameters = []) => {
    const text = queryText(query);
    if (/WITH target AS/i.test(text)) return [{ ready: true }];
    if (/WITH stale AS/i.test(text)) return [];
    if (/WITH eligible AS MATERIALIZED/i.test(text) && /INSERT INTO admin_payment_reconciliation_queue/i.test(text)) {
      seedParameters = parameters;
      return [];
    }
    if (/WITH urgent_lane AS/i.test(text) && /claimed AS/i.test(text)) {
      claimParameters = parameters;
      return candidates;
    }
    if (/DELETE FROM admin_payment_reconciliation_queue/i.test(text)) return [{ order_id: parameters[0] }];
    throw new Error(`unexpected SQL: ${text}`);
  };

  const result = await queue.runReconciliationBatch({
    sql,
    ownerToken: '33333333-3333-4333-8333-333333333333',
    reconcileCandidate: async (candidate) => {
      observedLanes.push(candidate.claim_lane);
      return { disposition: 'complete' };
    },
  });

  assert.deepEqual(seedParameters, [500, false, 100, 200]);
  assert.deepEqual(claimParameters, [5, '33333333-3333-4333-8333-333333333333', 60_000, false, 2, 2]);
  assert.deepEqual(new Set(observedLanes), new Set(['urgent', 'recent', 'oldest', 'fair_filler']));
  assert.equal(result.claimed, 5);
  assert.equal(result.completed, 5);
  assert.equal(result.leaseLost, 0);
  queue.resetSchemaReadinessForTests();
});

test('recent retries rank ahead of ten thousand historical never-attempted rows, including null dates', () => {
  const now = Date.parse('2026-09-01T16:00:00.000Z');
  const historical = Array.from({ length: 5_000 }, (_, index) => ({
    id: `historical-${String(index).padStart(5, '0')}`,
    created_at: new Date(now - ((index + 30) * 24 * 60 * 60 * 1000)).toISOString(),
    attempt_count: 0,
    next_attempt_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }));
  const nullDateHistorical = Array.from({ length: 5_000 }, (_, index) => ({
    id: `historical-null-${String(index).padStart(5, '0')}`,
    created_at: null,
    attempt_count: 0,
    next_attempt_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }));
  const currentRetry = {
    id: 'current-retry',
    created_at: '2026-09-01T15:00:00.000Z',
    attempt_count: 1,
    next_attempt_at: '2026-09-01T15:10:00.000Z',
    updated_at: '2026-09-01T15:05:00.000Z',
  };

  const selected = [...historical, ...nullDateHistorical, currentRetry]
    .sort((left, right) => queue.compareRecentLaneCandidates(left, right, now))
    .slice(0, 2);

  assert.equal(selected[0].id, currentRetry.id);
  assert.ok(selected.some((candidate) => candidate.id === currentRetry.id));
});

test('rolling deploys repair the queue once and verify catalog readiness before claiming work', async () => {
  queue.resetSchemaReadinessForTests();
  const calls = [];
  let readinessChecks = 0;
  const sql = async (query) => {
    const text = queryText(query);
    calls.push(text);
    if (/WITH target AS/i.test(text)) {
      readinessChecks += 1;
      return [{ ready: readinessChecks > 1 }];
    }
    if (/DO \$queue_schema\$/i.test(text)) return [];
    throw new Error(`unexpected SQL: ${text}`);
  };

  await queue.ensureReconciliationQueueSchema(sql);
  await queue.ensureReconciliationQueueSchema(sql);

  assert.equal(readinessChecks, 2);
  assert.equal(calls.filter((text) => /DO \$queue_schema\$/i.test(text)).length, 1);
  assert.match(calls.join('\n'), /pg_advisory_xact_lock/);
  assert.match(calls.join('\n'), /CREATE UNIQUE INDEX idx_admin_payment_reconciliation_order_id_unique/);
  assert.match(calls.join('\n'), /ALTER COLUMN attempt_count SET NOT NULL/);
  assert.match(queue.buildSchemaReadinessQuery(), /attribute\.atttypid <> expected\.type_oid/);
  assert.match(queue.buildSchemaReadinessQuery(), /constraint_state\.confdeltype = 'c'/);
  assert.match(queue.buildSchemaReadinessQuery(), /constraint_state\.conkey = ARRAY\[queue_order_id\.attnum\]/);
  assert.match(queue.buildSchemaReadinessQuery(), /index_state\.indrelid = target\.oid/);
  assert.match(queue.buildSchemaReadinessQuery(), /index_state\.indkey::text/);
  queue.resetSchemaReadinessForTests();
});

test('scheduled dispatch ignores hostile request hosts and uses only immutable deploy context', async () => {
  let observed;
  const result = await dispatcher.dispatchPayPalReconciliation({
    env: { INTERNAL_JOB_SECRET: 'queue-secret' },
    context: { deploy: { id: 'abcdef0123456789abcdef01' }, site: { name: 'final-banner-site' } },
    fetchImpl: async (url, options) => {
      observed = { url: String(url), options };
      return { status: 202 };
    },
  });
  assert.deepEqual(result, { queued: true });
  assert.equal(
    observed.url,
    'https://abcdef0123456789abcdef01--final-banner-site.netlify.app/.netlify/functions/reconcile-pending-paypal-background',
  );
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.headers['X-Internal-Job-Secret'], 'queue-secret');
  assert.ok(observed.options.signal instanceof AbortSignal);
});

test('background worker rejects previews before creating SQL or calling PayPal', async () => {
  const priorContext = process.env.CONTEXT;
  process.env.CONTEXT = 'production';
  let sqlFactories = 0;
  let providerCalls = 0;
  try {
    const result = await background.runWorker({
      request: new Request('https://deploy-preview-42--final-banner-site.netlify.app/worker'),
      context: { deploy: { id: 'deploy-preview-42', context: 'deploy-preview' }, site: { name: 'final-banner-site' } },
      env: { NETLIFY_DATABASE_URL: 'postgres://unused.invalid/db' },
      sqlFactory: () => { sqlFactories += 1; return async () => []; },
      captureHandler: async () => { providerCalls += 1; return { statusCode: 500, body: '{}' }; },
    });
    assert.deepEqual(result, { error: 'PRODUCTION_CONTEXT_REQUIRED', status: 403 });
    assert.equal(sqlFactories, 0);
    assert.equal(providerCalls, 0);
  } finally {
    if (priorContext === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = priorContext;
  }
});

test('the trusted event-only reconcile capability cannot be supplied in an HTTP body and never initiates capture', async () => {
  const previous = {
    database: process.env.NETLIFY_DATABASE_URL,
    feature: process.env.FEATURE_PAYPAL,
    paypalEnv: process.env.PAYPAL_ENV,
    client: process.env.PAYPAL_CLIENT_ID_SANDBOX,
    secret: process.env.PAYPAL_SECRET_SANDBOX,
  };
  process.env.NETLIFY_DATABASE_URL = 'postgres://paypal-reconcile-test.invalid/db';
  process.env.FEATURE_PAYPAL = '1';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_CLIENT_ID_SANDBOX = 'client';
  process.env.PAYPAL_SECRET_SANDBOX = 'secret';
  const order = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'pending',
    subtotal_cents: 1000,
    tax_cents: 0,
    total_cents: 1000,
    currency: 'USD',
    payment_reconciliation_status: 'required',
    paypal_order_id: 'PAYPAL-HISTORICAL',
    paypal_capture_id: null,
    stripe_payment_intent_id: null,
    payment_method: 'paypal',
    checkout_idempotency_key: null,
  };
  capture._test.setNeonFactory(() => async (query) => (
    /FROM orders/i.test(queryText(query)) ? [order] : []
  ));
  const body = JSON.stringify({
    orderID: order.paypal_order_id,
    internalOrderId: order.id,
    reconcileOnly: true,
    trustedReconciliation: true,
  });
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/v1/oauth2/token')) {
      return { ok: true, json: async () => ({ access_token: 'token' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: order.paypal_order_id,
        status: 'APPROVED',
        purchase_units: [{
          custom_id: order.id,
          invoice_id: `BOTF-${order.id}`,
          amount: { currency_code: 'USD', value: '10.00' },
          payments: { captures: [] },
        }],
      }),
    };
  };
  try {
    const hostile = await capture.handler({ httpMethod: 'POST', headers: {}, body });
    assert.equal(hostile.statusCode, 401);
    assert.equal(calls.length, 0);

    const trustedEvent = capture._internal.trustedReconciliationEvent({
      httpMethod: 'POST',
      headers: {},
      body,
    }, AbortSignal.timeout(1000));
    const trusted = await capture.handler(trustedEvent);
    assert.equal(trusted.statusCode, 202);
    assert.equal(calls.filter((url) => url.endsWith('/capture')).length, 0);
    assert.equal(calls.filter((url) => url.includes('/v2/checkout/orders/')).length, 1);
  } finally {
    global.fetch = originalFetch;
    capture._test.resetNeonFactory();
    const names = {
      NETLIFY_DATABASE_URL: previous.database,
      FEATURE_PAYPAL: previous.feature,
      PAYPAL_ENV: previous.paypalEnv,
      PAYPAL_CLIENT_ID_SANDBOX: previous.client,
      PAYPAL_SECRET_SANDBOX: previous.secret,
    };
    for (const [name, value] of Object.entries(names)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('409 and an unretired 422 remain durable retries; only successful retirement is terminal', async () => {
  const customerInfo = require('../_shared/legacy/paypal-customer-info.cjs');
  const originalRetire = customerInfo.retireDefinitivelyDeclinedPayPalOrder;
  const request = new Request('https://abcdef0123456789abcdef01--final-banner-site.netlify.app/worker');
  const context = { deploy: { id: 'abcdef0123456789abcdef01' }, site: { name: 'final-banner-site' } };
  const candidate = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    paypal_order_id: 'PAYPAL-1',
  };
  try {
    const conflict = await background.reconcileCandidate({
      request,
      context,
      candidate,
      captureHandler: async () => ({ statusCode: 409, body: JSON.stringify({ error: 'CONFLICT' }) }),
    });
    assert.equal(conflict.disposition, 'retry');

    customerInfo.retireDefinitivelyDeclinedPayPalOrder = async () => false;
    const locked = await background.reconcileCandidate({
      request,
      context,
      candidate,
      captureHandler: async () => ({
        statusCode: 422,
        body: JSON.stringify({ paymentCaptured: false, reconciliationRequired: false, paymentStatusUnknown: false }),
      }),
    });
    assert.deepEqual(locked, { disposition: 'retry', error: 'PAYPAL_DECLINE_RETIREMENT_INCOMPLETE' });

    customerInfo.retireDefinitivelyDeclinedPayPalOrder = async () => true;
    const retired = await background.reconcileCandidate({
      request,
      context,
      candidate,
      captureHandler: async () => ({
        statusCode: 422,
        body: JSON.stringify({ paymentCaptured: false, reconciliationRequired: false, paymentStatusUnknown: false }),
      }),
    });
    assert.deepEqual(retired, { disposition: 'terminal' });
  } finally {
    customerInfo.retireDefinitivelyDeclinedPayPalOrder = originalRetire;
  }
});
