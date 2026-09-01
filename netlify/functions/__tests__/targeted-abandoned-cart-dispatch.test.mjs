import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { _test as backgroundTest } from '../detect-abandoned-carts-background.mjs';

const require = createRequire(import.meta.url);
const detector = require('../_shared/legacy/detect-abandoned-carts.cjs');

const cartId = '11111111-1111-4111-8111-111111111111';
const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');

test.afterEach(() => {
  detector._test.resetDependencies();
});

test('a targeted pagehide cart bypasses a full global batch and a held worker lease', async () => {
  const olderBacklog = Array.from({ length: detector._test.DELIVERY_BATCH_SIZE }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
  const queries = [];
  const delivered = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    queries.push({ query, values });
    if (/INSERT INTO recovery_job_leases/i.test(query)) return [];
    if (/LEFT JOIN cart_recovery_deliveries AS delivery/i.test(query)) return olderBacklog;
    if (/WITH target AS MATERIALIZED/i.test(query)) {
      return [{ id: cartId, newly_abandoned: true }];
    }
    if (/INSERT INTO cart_recovery_logs/i.test(query)) {
      return [{ abandoned_cart_id: cartId }];
    }
    return [];
  };
  detector._test.setEnsureSchema(async () => {});
  detector._test.setDelivery(async (options) => {
    delivered.push(options);
    return { success: true, emailId: 'targeted-email-1', sequenceNumber: 1 };
  });

  const cappedGlobalBatch = await detector._test.dueCandidates(sql, 1);
  assert.equal(cappedGlobalBatch.length, detector._test.DELIVERY_BATCH_SIZE);
  assert.equal(cappedGlobalBatch.some((cart) => cart.id === cartId), false);

  const held = await detector._test.runLeasedRecoveryWorker({
    sql,
    resend: {},
    ownerToken: 'already-held-global-worker',
    deadlineAtMs: 100_000,
    now: () => 0,
  });
  assert.deepEqual(held, { success: true, skipped: true, reason: 'worker_lease_held' });

  const targeted = await detector._test.runTargetedRecovery({ sql, resend: {}, cartId });
  assert.equal(targeted.success, true);
  assert.equal(targeted.targeted, true);
  assert.equal(targeted.newlyAbandoned, true);
  assert.equal(targeted.email1.emailId, 'targeted-email-1');
  assert.deepEqual(delivered.map(({ cartId: id, sequenceNumber, source }) => ({
    cartId: id,
    sequenceNumber,
    source,
  })), [{ cartId, sequenceNumber: 1, source: 'scheduled' }]);

  const targetQuery = queries.find(({ query }) => /WITH target AS MATERIALIZED/i.test(query));
  assert.ok(targetQuery);
  assert.equal(targetQuery.values.includes(cartId), true);
  assert.match(targetQuery.query, /cart\.id = \?::uuid/);
  assert.match(targetQuery.query, /abandonment_signaled_at IS NOT NULL/);
  assert.match(targetQuery.query, /first_recovery_due_at, cart\.abandonment_signaled_at\) <= NOW\(\)/);
  assert.match(targetQuery.query, /checkout_stage IS DISTINCT FROM 'payment_started'/);
  assert.doesNotMatch(targetQuery.query, /LIMIT 50/);
  assert.equal(
    queries.filter(({ query }) => /INSERT INTO recovery_job_leases/i.test(query)).length,
    1,
    'the targeted path must not acquire the global worker lease',
  );
});

test('payment-started carts receive a thirty-minute handoff grace instead of an immediate signal', async () => {
  let abandonQuery = '';
  let abandonValues = [];
  await detector._test.abandonInactiveCarts(async (first, ...values) => {
    abandonQuery = queryText(first);
    abandonValues = values;
    return [];
  });

  assert.match(
    abandonQuery,
    /checkout_stage IS DISTINCT FROM 'payment_started'[\s\S]+abandonment_signaled_at IS NOT NULL/,
  );
  assert.match(
    abandonQuery,
    /checkout_stage = 'payment_started'[\s\S]+last_activity_at <= NOW\(\) - \(\? \* INTERVAL '1 minute'\)/,
  );
  assert.match(
    abandonQuery,
    /CASE WHEN cart\.checkout_stage = 'payment_started'[\s\S]+ELSE \?[\s\S]+INTERVAL '1 minute'/,
  );
  assert.equal(detector._test.PAYMENT_HANDOFF_GRACE_MINUTES, 30);
  assert.equal(abandonValues.includes(30), true);
});

test('the signed background endpoint routes pagehide jobs by cart and keeps scheduled scans global', async () => {
  const calls = [];
  const handler = backgroundTest.createHandler({
    env: { INTERNAL_JOB_SECRET: 'targeted-background-secret' },
    runTargeted: async ({ cartId: requestedCartId }) => {
      calls.push({ type: 'targeted', cartId: requestedCartId });
      return { success: true, targeted: true, cartId: requestedCartId };
    },
    runGlobal: async () => {
      calls.push({ type: 'global' });
      return { success: true, scanned: true };
    },
  });
  const request = (body) => new Request(
    'https://site.netlify.app/.netlify/functions/detect-abandoned-carts-background',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-job-secret': 'targeted-background-secret',
      },
      body: JSON.stringify(body),
    },
  );

  const immediateResponse = await handler(request({ trigger: 'pagehide', cartId }));
  assert.equal(immediateResponse.status, 200);
  assert.deepEqual(calls[0], { type: 'targeted', cartId });

  const scheduledResponse = await handler(request({ trigger: 'scheduled' }));
  assert.equal(scheduledResponse.status, 200);
  assert.deepEqual(calls[1], { type: 'global' });

  const invalidResponse = await handler(request({ trigger: 'pagehide', cartId: 'not-a-cart' }));
  assert.equal(invalidResponse.status, 400);
  assert.equal(calls.length, 2);
});
