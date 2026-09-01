import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { _test as dispatcherTest } from '../detect-abandoned-carts.mjs';
import { _test as backgroundTest } from '../detect-abandoned-carts-background.mjs';

const require = createRequire(import.meta.url);
const sendModule = require('../_shared/legacy/send-abandoned-cart-email.cjs');
const detector = require('../_shared/legacy/detect-abandoned-carts.cjs');
const unsubscribeModule = require('../_shared/recovery-email-unsubscribe.cjs');
const webhookModule = require('../_shared/legacy/resend-webhook.cjs');
const tokenModule = require('../_shared/cart-recovery-token.cjs');

const cartId = '11111111-1111-4111-8111-111111111111';
const originalEnv = {
  ABANDONED_CART_RECOVERY_SECRET: process.env.ABANDONED_CART_RECOVERY_SECRET,
  RECOVERY_EMAIL_TOKEN_SECRET: process.env.RECOVERY_EMAIL_TOKEN_SECRET,
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
};

const queryText = (first) => Array.isArray(first) ? first.join('?') : String(first || '');

test.before(() => {
  process.env.ABANDONED_CART_RECOVERY_SECRET = 'race-test-recovery-secret';
  process.env.RECOVERY_EMAIL_TOKEN_SECRET = 'race-test-unsubscribe-secret';
  process.env.NETLIFY_DATABASE_URL = 'postgres://race-test.invalid/db';
});

test.after(() => {
  sendModule._test.resetDependencies();
  detector._test.resetDependencies();
  unsubscribeModule._test.resetDependencies();
  webhookModule._test.resetDependencies();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('a click racing the final provider check stops sequence two and manual delivery', async () => {
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'guest-click-race',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [{ width_in: 48, height_in: 24, quantity: 1, line_total_cents: 2500 }],
    total_value: '25.00',
    estimated_total_cents: 2500,
    discount_code: 'CART10-EXISTING',
    recovery_status: 'abandoned',
    recovery_emails_sent: 1,
    last_recovery_email_at: '2026-08-30T00:00:00.000Z',
    created_at: '2026-08-29T00:00:00.000Z',
  };
  let providerCalls = 0;
  let stopped = false;
  let claimQuery = '';
  let claimValues = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [cart];
    if (/SELECT id[\s\S]+FROM orders/i.test(query)) return [];
    if (/\beligible AS\s*\(/i.test(query)) {
      claimQuery = query;
      claimValues = values;
      return [{ ...cart, recovery_email_claim_sequence: 2 }];
    }
    if (/SELECT code FROM discount_codes/i.test(query)) return [{ code: cart.discount_code }];
    if (/FROM cart_recovery_logs/i.test(query) && /event_type = 'email_clicked'/i.test(query)) return [{ exists: 1 }];
    if (/WITH stopped AS/i.test(query)) {
      stopped = true;
      return [];
    }
    return [];
  };
  const resend = {
    emails: {
      send: async () => {
        providerCalls += 1;
        return { data: { id: 'must-not-send' }, error: null };
      },
    },
  };

  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend,
      cartId,
      sequenceNumber: 2,
      source: 'admin:test',
    });

    assert.deepEqual(result, { success: false, skipped: true, reason: 'email_clicked' });
    assert.equal(providerCalls, 0);
    assert.equal(stopped, true);
    assert.match(claimQuery, /NOT EXISTS[\s\S]+email_clicked/);
    assert.match(claimQuery, /last_recovery_email_at[\s\S]+INTERVAL '1 hour'/);
    assert.equal(claimValues.includes(23), true);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('scheduler enforces inter-send gaps and attempts a cart at most once per run', async () => {
  const queries = [];
  const sql = async (first) => {
    queries.push(queryText(first));
    return [];
  };
  await detector._test.dueCandidates(sql, 2);
  await detector._test.dueCandidates(sql, 3);

  assert.match(queries[0], /last_recovery_email_at IS NOT NULL/);
  assert.match(queries[0], /last_recovery_email_at <= NOW\(\) - INTERVAL '23 hours'/);
  assert.match(queries[1], /last_recovery_email_at IS NOT NULL/);
  assert.match(queries[1], /last_recovery_email_at <= NOW\(\) - INTERVAL '48 hours'/);

  const attempted = new Set();
  assert.deepEqual(
    detector._test.takeUnattemptedCandidates([{ id: 'cart-a' }, { id: 'cart-b' }], attempted),
    [{ id: 'cart-a' }, { id: 'cart-b' }],
  );
  assert.deepEqual(
    detector._test.takeUnattemptedCandidates([{ id: 'cart-a' }, { id: 'cart-c' }], attempted),
    [{ id: 'cart-c' }],
  );
});

test('fifty failed older deliveries cannot starve a newer never-attempted cart', async () => {
  for (const sequenceNumber of [1, 2, 3]) {
    let dueQuery = '';
    let dueValues = [];
    await detector._test.dueCandidates(async (first, ...values) => {
      dueQuery = queryText(first);
      dueValues = values;
      return [];
    }, sequenceNumber);
    assert.match(dueQuery, /LEFT JOIN cart_recovery_deliveries AS delivery/);
    assert.match(dueQuery, new RegExp(`delivery\\.sequence_number = ${sequenceNumber}`));
    assert.match(dueQuery, /delivery\.id IS NULL/);
    assert.match(dueQuery, /delivery\.status = 'failed'[\s\S]+delivery\.updated_at <= NOW\(\) - \(\? \* INTERVAL '1 hour'\)/);
    assert.match(dueQuery, /ORDER BY \(delivery\.id IS NULL\) DESC/);
    assert.match(dueQuery, /ELSE delivery\.updated_at END ASC/);
    assert.equal(dueValues.includes(detector._test.DELIVERY_RETRY_BACKOFF_HOURS), true);
    assert.equal(dueValues.includes(detector._test.DELIVERY_BATCH_SIZE), true);
  }

  const poisonFailures = Array.from({ length: 50 }, (_, index) => ({
    id: `failed-${index}`,
    deliveryId: `delivery-${index}`,
    dueAt: index,
  }));
  const newerFreshCart = { id: 'newer-fresh-cart', deliveryId: null, dueAt: 10_000 };
  const selected = [...poisonFailures, newerFreshCart]
    .sort((left, right) => Number(right.deliveryId === null) - Number(left.deliveryId === null)
      || left.dueAt - right.dueAt)
    .slice(0, detector._test.DELIVERY_BATCH_SIZE);
  assert.equal(selected[0].id, newerFreshCart.id);
  assert.equal(selected.some((candidate) => candidate.id === newerFreshCart.id), true);

  let claimQuery = '';
  let claimValues = [];
  await sendModule._test.claimSequence(async (first, ...values) => {
    claimQuery = queryText(first);
    claimValues = values;
    return [];
  }, cartId, 1, 'scheduled');
  assert.match(claimQuery, /status = 'failed'[\s\S]+NOT \?[\s\S]+updated_at <=[\s\S]+INTERVAL '1 hour'/);
  assert.equal(claimValues.includes(true), true);
});

test('five-day and month-old active carts are batch-expired and can never enter sequence one', async () => {
  const calls = [];
  const sql = async (first, ...values) => {
    calls.push({ query: queryText(first), values });
    return [];
  };

  await detector._test.expireStaleActiveCarts(sql);
  await detector._test.abandonInactiveCarts(sql);
  await detector._test.dueCandidates(sql, 1);
  await detector._test.expireAbandonedCarts(sql);

  const [expireActive, abandonRecent, sequenceOne, expireAbandoned] = calls;
  assert.match(expireActive.query, /recovery_status = 'active'/);
  assert.match(expireActive.query, /last_activity_at <= NOW\(\) - INTERVAL '96 hours'/);
  assert.match(expireActive.query, /SET recovery_status = 'expired'/);
  assert.match(expireActive.query, /LIMIT \?/);
  assert.equal(expireActive.values.includes(detector._test.CART_STATE_BATCH_SIZE), true);

  assert.match(abandonRecent.query, /last_activity_at > NOW\(\) - INTERVAL '96 hours'/);
  assert.match(abandonRecent.query, /last_activity_at \+ INTERVAL '1 hour'/);
  assert.doesNotMatch(abandonRecent.query, /COALESCE\(cart\.abandoned_at, NOW\(\)\)/);
  assert.match(abandonRecent.query, /LIMIT \?/);
  assert.equal(abandonRecent.values.includes(detector._test.CART_STATE_BATCH_SIZE), true);

  assert.match(sequenceOne.query, /recovery_status = 'abandoned'/);
  assert.match(sequenceOne.query, /COALESCE\(cart\.abandoned_at, cart\.last_activity_at\) > NOW\(\) - INTERVAL '96 hours'/);
  assert.match(expireAbandoned.query, /LIMIT \?/);

  const now = Date.parse('2026-09-01T00:00:00.000Z');
  const recoveryWindowMs = 96 * 60 * 60 * 1000;
  assert.equal(Date.parse('2026-08-27T00:00:00.000Z') <= now - recoveryWindowMs, true); // five days old
  assert.equal(Date.parse('2026-08-01T00:00:00.000Z') <= now - recoveryWindowMs, true); // one month old
});

test('unsubscribe GET only confirms while bounded explicit POST performs the mutation', async () => {
  const token = tokenModule.createRecoveryUnsubscribeToken('Buyer@Example.com', {
    secret: 'race-test-unsubscribe-secret',
  });
  let databaseConnections = 0;
  const queries = [];
  unsubscribeModule._test.setEnsureSchema(async () => {});
  unsubscribeModule._test.setNeonFactory(() => {
    databaseConnections += 1;
    return async (first, ...values) => {
      queries.push({ query: queryText(first), values });
      return [{ normalized_email: 'buyer@example.com' }];
    };
  });

  try {
    const confirmation = await unsubscribeModule.handler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { token },
    });
    assert.equal(confirmation.statusCode, 200);
    assert.match(confirmation.body, /<form method="post"/i);
    assert.match(confirmation.body, /Confirm unsubscribe/i);
    assert.equal(confirmation.body.includes('buyer@example.com'), false);
    assert.equal(databaseConnections, 0);
    assert.equal(queries.length, 0);

    const posted = await unsubscribeModule.handler({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      queryStringParameters: {},
      body: new URLSearchParams({ token, confirm: 'unsubscribe' }).toString(),
    });
    assert.equal(posted.statusCode, 200);
    assert.equal(databaseConnections, 1);
    assert.match(queries[0].query, /INSERT INTO recovery_email_suppressions/i);
    assert.equal(queries[0].values.includes('footer_confirmation'), true);

    const oversized = await unsubscribeModule.handler({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      queryStringParameters: {},
      body: 'x'.repeat(unsubscribeModule._test.MAX_BODY_LENGTH + 1),
    });
    assert.equal(oversized.statusCode, 413);
    assert.equal(databaseConnections, 1);

    const oversizedToken = await unsubscribeModule.handler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { token: `u1.${'x'.repeat(unsubscribeModule._test.MAX_TOKEN_LENGTH)}` },
    });
    assert.equal(oversizedToken.statusCode, 400);
    assert.equal(databaseConnections, 1);
  } finally {
    unsubscribeModule._test.resetDependencies();
  }
});

test('delivered webhook repairs an accepted send after DB completion failure and prevents retry', async () => {
  const state = {
    claim: false,
    deliveryStatus: null,
    recoveryEmailsSent: 0,
    providerCalls: 0,
  };
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'guest-webhook-reconcile',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [{ width_in: 48, height_in: 24, quantity: 1, line_total_cents: 2500 }],
    total_value: '25.00',
    estimated_total_cents: 2500,
    discount_code: null,
    recovery_status: 'abandoned',
    created_at: '2026-08-29T00:00:00.000Z',
    last_activity_at: '2026-08-29T01:00:00.000Z',
  };
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) {
      return [{ ...cart, recovery_emails_sent: state.recoveryEmailsSent }];
    }
    if (/SELECT id, normalized_email, email/i.test(query) && /FROM abandoned_carts/i.test(query)) return [cart];
    if (/SELECT id[\s\S]+FROM orders/i.test(query)) return [];
    if (/\beligible AS\s*\(/i.test(query)) {
      if (state.recoveryEmailsSent !== 0 || state.deliveryStatus === 'sent') return [];
      state.claim = true;
      state.deliveryStatus = 'claimed';
      return [{ ...cart, recovery_emails_sent: 0, recovery_email_claim_sequence: 1 }];
    }
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [{ id: cartId }];
    }
    if (/AS stop_reason[\s\S]+recovery_email_claim_sequence/i.test(query)) return [{ stop_reason: null }];
    if (/WITH delivered AS/i.test(query)) throw new Error('simulated completion database outage');
    if (/WITH failed AS/i.test(query)) {
      state.claim = false;
      state.deliveryStatus = 'failed';
      return [];
    }
    if (/INSERT INTO cart_recovery_logs/i.test(query)) return [];
    if (/WITH reconciled_delivery AS/i.test(query)) {
      state.claim = false;
      state.deliveryStatus = 'sent';
      state.recoveryEmailsSent = 1;
      return [{ id: cartId }];
    }
    return [];
  };
  const resend = {
    emails: {
      send: async () => {
        state.providerCalls += 1;
        return { data: { id: 'provider-message-accepted' }, error: null };
      },
    },
  };

  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  webhookModule._test.setEnsureSchema(async () => {});
  try {
    await assert.rejects(
      sendModule.deliverRecoveryEmail({ sql, resend, cartId, sequenceNumber: 1 }),
      /simulated completion database outage/,
    );
    assert.equal(state.providerCalls, 1);
    assert.equal(state.deliveryStatus, 'failed');

    const webhookResult = await webhookModule._test.recordRecoveryEvent(
      sql,
      {
        type: 'email.delivered',
        created_at: '2026-09-01T00:05:00.000Z',
        data: {
          tags: [
            { name: 'type', value: 'abandoned_cart' },
            { name: 'sequence', value: '1' },
            { name: 'cart_id', value: cartId },
          ],
        },
      },
      { headers: { 'svix-id': 'provider-event-delivered-1' } },
      'provider-message-accepted',
      'buyer@example.com',
    );
    assert.equal(webhookResult.deliveryReconciled, true);
    assert.equal(state.deliveryStatus, 'sent');
    assert.equal(state.recoveryEmailsSent, 1);

    const retry = await sendModule.deliverRecoveryEmail({ sql, resend, cartId, sequenceNumber: 1 });
    assert.equal(retry.skipped, true);
    assert.equal(state.providerCalls, 1);
  } finally {
    sendModule._test.resetDependencies();
    webhookModule._test.resetDependencies();
  }
});

test('manual delivery rejects an active cart and the atomic claim cannot fabricate abandonment', async () => {
  const activeCart = {
    id: cartId,
    user_id: null,
    session_id: 'active-manual-session',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    recovery_status: 'active',
    recovery_emails_sent: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    last_activity_at: '2026-09-01T00:05:00.000Z',
  };
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [activeCart];
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
      source: 'admin:test',
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'not_abandoned' });
    assert.equal(providerCalls, 0);

    let claimQuery = '';
    await sendModule._test.claimSequence(async (first) => {
      claimQuery = queryText(first);
      return [];
    }, cartId, 1, 'admin:test');
    assert.match(claimQuery, /WHERE cart\.recovery_status = 'abandoned'/);
    assert.match(claimQuery, /AND cart\.recovery_status = 'abandoned'/);
    assert.doesNotMatch(claimQuery, /SET recovery_status = 'abandoned'/);
    assert.doesNotMatch(claimQuery, /abandoned_at = COALESCE/);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('a returned owner cart racing a claim expires the old cart before provider delivery', async () => {
  const oldCart = {
    id: cartId,
    user_id: '33333333-3333-4333-8333-333333333333',
    session_id: 'return-owner-session',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    discount_code: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-08-31T00:00:00.000Z',
    last_activity_at: '2026-08-31T01:00:00.000Z',
  };
  let claimQuery = '';
  let stopped = false;
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [oldCart];
    if (/\beligible AS\s*\(/i.test(query)) {
      claimQuery = query;
      return [{ ...oldCart, recovery_email_claim_sequence: 1 }];
    }
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [{ id: cartId }];
    }
    if (/^\s*SELECT 1[\s\S]+FROM abandoned_carts AS cart[\s\S]+newer_active\.recovery_status = 'active'/i.test(query)) {
      return [{ exists: 1 }];
    }
    if (/failure_reason = 'newer_active_owner_cart'/i.test(query)) {
      stopped = true;
      return [];
    }
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
      source: 'admin:test',
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'newer_active_owner_cart' });
    assert.equal(providerCalls, 0);
    assert.equal(stopped, true);
    assert.match(claimQuery, /newer_active\.recovery_status = 'active'/);
    assert.match(claimQuery, /newer_active\.user_id = cart\.user_id/);
    assert.match(claimQuery, /newer_active\.session_id = cart\.session_id/);
    assert.match(claimQuery, /newer_active\.last_activity_at, newer_active\.created_at, newer_active\.id/);

    let dueQuery = '';
    await detector._test.dueCandidates(async (first) => {
      dueQuery = queryText(first);
      return [];
    }, 1);
    assert.match(dueQuery, /newer_active\.recovery_status = 'active'/);
    assert.match(dueQuery, /newer_active\.user_id = cart\.user_id/);
    assert.match(dueQuery, /newer_active\.session_id = cart\.session_id/);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('normalized-recipient dedupe expires stale rows and cannot be bypassed by a manual race', async () => {
  let consolidationQuery = '';
  const consolidationValues = [];
  await detector._test.supersedeDuplicateRecipientCarts(async (first, ...values) => {
    consolidationQuery = queryText(first);
    consolidationValues.push(...values);
    return [];
  });
  assert.match(consolidationQuery, /PARTITION BY groups\.recipient/);
  assert.match(consolidationQuery, /ORDER BY cart\.last_activity_at DESC, cart\.created_at DESC, cart\.id DESC/);
  assert.match(consolidationQuery, /MAX\(COALESCE\(cart\.recovery_emails_sent, 0\)\)/);
  assert.match(consolidationQuery, /ranked\.recipient_rank > 1/);
  assert.match(consolidationQuery, /SET recovery_status = 'expired'/);
  assert.doesNotMatch(consolidationQuery, /DELETE FROM abandoned_carts/);
  assert.equal(consolidationValues.includes(detector._test.RECIPIENT_GROUP_BATCH_SIZE), true);

  const oldCart = {
    id: cartId,
    user_id: null,
    session_id: 'old-recipient-session',
    email: ' Buyer@Example.com ',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    discount_code: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-08-31T00:00:00.000Z',
    last_activity_at: '2026-08-31T01:00:00.000Z',
  };
  let claimQuery = '';
  let stopped = false;
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [oldCart];
    if (/\beligible AS\s*\(/i.test(query)) {
      claimQuery = query;
      return [{ ...oldCart, recovery_email_claim_sequence: 1 }];
    }
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [];
    }
    if (/failure_reason = 'superseded_recipient_cart'/i.test(query)) {
      stopped = true;
      return [];
    }
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
      source: 'admin:test',
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'superseded_recipient_cart' });
    assert.equal(providerCalls, 0);
    assert.equal(stopped, true);
    assert.match(claimQuery, /pg_advisory_xact_lock\(hashtext\(target\.recipient\)\)/);
    assert.match(claimQuery, /cart\.id = \([\s\S]+ORDER BY candidate\.last_activity_at DESC/);
    assert.match(claimQuery, /other_claim\.recovery_email_claim_sequence IS NOT NULL/);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('an exact purchase on returned cart B expires same-identity cart A without stealing attribution', async () => {
  const oldCart = {
    id: cartId,
    user_id: '33333333-3333-4333-8333-333333333333',
    session_id: 'shared-return-session',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    recovery_status: 'abandoned',
    recovery_emails_sent: 1,
    created_at: '2026-08-30T00:00:00.000Z',
    last_activity_at: '2026-08-30T01:00:00.000Z',
  };
  let completedQuery = '';
  let settlementValues = [];
  let providerCalls = 0;
  const sql = async (first, ...values) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [oldCart];
    if (/SELECT order_row\.id,[\s\S]*END AS status/i.test(query)) {
      completedQuery = query;
      return [{
        id: '22222222-2222-4222-8222-222222222222',
        status: 'paid',
        recovery_target: false,
      }];
    }
    if (/WITH recovered AS/i.test(query)) {
      settlementValues = values;
      return [];
    }
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 2,
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'completed_order' });
    assert.equal(providerCalls, 0);
    assert.equal(settlementValues.includes('expired'), true);
    assert.equal(settlementValues.includes('completed_order_other_cart'), true);
    assert.equal(settlementValues.includes(false), true);
    assert.match(completedQuery, /NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL/);
    assert.match(completedQuery, /abandoned_cart_id', ''\) IS NOT NULL[\s\S]+linked_cart\.session_id/);
    assert.match(completedQuery, /ORDER BY recovery_target DESC NULLS LAST/);
    assert.match(completedQuery, /\(order_row\.status = 'refunded'\) ASC/);
    assert.match(
      completedQuery,
      /abandoned_cart_id', ''\) IS NOT NULL\s+AND order_row\.created_at >=/,
    );

    let detectorQuery = '';
    await detector._test.settleCompletedCarts(async (first) => {
      detectorQuery = queryText(first);
      return [];
    });
    assert.match(detectorQuery, /cart_id = recovery_target_id AS recovery_target/);
    assert.match(detectorQuery, /\(cart_id = recovery_target_id\) DESC NULLS LAST/);
    assert.match(detectorQuery, /\(order_status = 'refunded'\) ASC/);
    assert.match(detectorQuery, /WHEN targets\.recovery_target[\s\S]+THEN 'recovered'[\s\S]+ELSE 'expired'/);
    assert.match(detectorQuery, /WHERE settled\.recovery_target/);
    assert.match(detectorQuery, /ELSE 'completed_order_other_cart'/);
    assert.match(
      detectorQuery,
      /abandoned_cart_id', ''\) IS NOT NULL\s+AND cart\.created_at <= order_row\.created_at/,
    );
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('a payment persisted before its snapshot is reconciled by exact session within ten minutes', async () => {
  const delayedCart = {
    id: cartId,
    user_id: null,
    session_id: 'late-payment-session',
    email: null,
    normalized_email: null,
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    recovery_status: 'active',
    recovery_emails_sent: 0,
    created_at: '2026-09-01T00:05:00.000Z',
    last_activity_at: '2026-09-01T00:05:00.000Z',
  };
  let completedQuery = '';
  let recoveredQuery = '';
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [delayedCart];
    if (/SELECT order_row\.id,[\s\S]*END AS status/i.test(query)) {
      completedQuery = query;
      return [{
        id: '22222222-2222-4222-8222-222222222222',
        status: 'paid',
        recovery_target: true,
      }];
    }
    if (/WITH recovered AS/i.test(query)) {
      recoveredQuery = query;
      return [];
    }
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'completed_order' });
    assert.equal(providerCalls, 0);
    assert.match(completedQuery, /order_row\.abandoned_cart_session_id/);
    assert.match(completedQuery, /created_at \+ INTERVAL '10 minutes'/);
    assert.match(completedQuery, /last_activity_at >= order_row\.created_at - INTERVAL '30 minutes'/);
    assert.match(completedQuery, /last_activity_at <= order_row\.created_at \+ INTERVAL '10 minutes'/);
    assert.match(completedQuery, /candidate\.session_id = NULLIF/);
    assert.doesNotMatch(recoveredQuery, /recovery_emails_sent\s*=/);

    let detectorQuery = '';
    const values = [];
    await detector._test.settleCompletedCarts(async (first, ...boundValues) => {
      detectorQuery = queryText(first);
      values.push(...boundValues);
      return [];
    });
    assert.match(detectorQuery, /cart\.session_id = NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\), ''\)/);
    assert.match(detectorQuery, /cart\.created_at <= order_row\.created_at \+ INTERVAL '10 minutes'/);
    assert.match(detectorQuery, /cart\.last_activity_at >= order_row\.created_at - INTERVAL '30 minutes'/);
    assert.match(detectorQuery, /cart\.last_activity_at <= order_row\.created_at \+ INTERVAL '10 minutes'/);
    assert.match(detectorQuery, /FOR UPDATE SKIP LOCKED/);
    assert.equal(values.includes(detector._test.CART_STATE_BATCH_SIZE), true);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('canonically paid pending PayPal evidence stops recovery before provider delivery', async () => {
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'captured-paypal-session',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    last_activity_at: '2026-09-01T00:05:00.000Z',
  };
  let completedQuery = '';
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [cart];
    if (/SELECT order_row\.id,[\s\S]*END AS status/i.test(query)) {
      completedQuery = query;
      // The SQL CASE canonicalizes both pending + PayPal capture ID and pending
      // + completed PayPal reconciliation evidence to this effective status.
      return [{
        id: '22222222-2222-4222-8222-222222222222',
        status: 'paid',
        recovery_target: true,
      }];
    }
    if (/WITH recovered AS/i.test(query)) return [];
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'completed_order' });
    assert.equal(providerCalls, 0);
    assert.match(completedQuery, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
    assert.match(
      completedQuery,
      /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/,
    );
    assert.match(completedQuery, /THEN 'paid'[\s\S]*END AS status/);

    let settlementQuery = '';
    await detector._test.settleCompletedCarts(async (first) => {
      settlementQuery = queryText(first);
      return [];
    });
    assert.match(settlementQuery, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
    assert.match(
      settlementQuery,
      /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/,
    );
    assert.match(settlementQuery, /THEN 'paid'[\s\S]*END AS order_status/);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('a stale same-session cart cannot attach to a much later payment', async () => {
  let senderQuery = '';
  await sendModule._test.findCompletedOrder(async (first) => {
    senderQuery = queryText(first);
    return [];
  }, {
    id: cartId,
    user_id: null,
    session_id: 'long-lived-browser-session',
    email: null,
    normalized_email: null,
    created_at: '2026-06-01T00:00:00.000Z',
    last_activity_at: '2026-06-01T00:05:00.000Z',
  });
  assert.match(senderQuery, /candidate\.last_activity_at >= order_row\.created_at - INTERVAL '30 minutes'/);
  assert.match(senderQuery, /candidate\.last_activity_at <= order_row\.created_at \+ INTERVAL '10 minutes'/);

  let detectorQuery = '';
  await detector._test.settleCompletedCarts(async (first) => {
    detectorQuery = queryText(first);
    return [];
  });
  assert.match(detectorQuery, /candidate\.last_activity_at >= order_row\.created_at - INTERVAL '30 minutes'/);
  assert.match(detectorQuery, /candidate\.last_activity_at <= order_row\.created_at \+ INTERVAL '10 minutes'/);

  const orderTime = Date.parse('2026-09-01T00:00:00.000Z');
  const staleActivity = Date.parse('2026-06-01T00:05:00.000Z');
  const lateSnapshotActivity = Date.parse('2026-09-01T00:05:00.000Z');
  assert.equal(staleActivity >= orderTime - (30 * 60 * 1000), false);
  assert.equal(lateSnapshotActivity <= orderTime + (10 * 60 * 1000), true);
});

test('a month-old identity-only cart cannot be inferred as recovered by a later purchase', async () => {
  let senderQuery = '';
  await sendModule._test.findCompletedOrder(async (first) => {
    senderQuery = queryText(first);
    return [];
  }, {
    id: cartId,
    user_id: '33333333-3333-4333-8333-333333333333',
    session_id: null,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    created_at: '2026-08-01T00:00:00.000Z',
    last_activity_at: '2026-08-01T00:00:00.000Z',
  });
  let detectorQuery = '';
  await detector._test.settleCompletedCarts(async (first) => {
    detectorQuery = queryText(first);
    return [];
  });

  // Orders with an exact cart id remain authoritative, and exact session
  // matching keeps its narrow late-snapshot grace. Historical email/user
  // inference and explicit-other-cart duplicate closure are both finite.
  assert.match(senderQuery, /order_row\.created_at <= candidate\.last_activity_at \+ INTERVAL '96 hours'/);
  assert.equal(
    (senderQuery.match(/order_row\.created_at <= \?::timestamptz \+ INTERVAL '96 hours'/g) || []).length,
    4,
  );
  assert.match(detectorQuery, /batch_order\.abandoned_cart_id = batch_cart\.id/);
  assert.match(detectorQuery, /cart\.session_id = NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\), ''\)/);
  assert.match(
    detectorQuery,
    /batch_order\.created_at <= batch_cart\.last_activity_at \+ INTERVAL '96 hours'/,
  );
  assert.match(
    detectorQuery,
    /order_row\.created_at <= candidate\.last_activity_at \+ INTERVAL '96 hours'/,
  );
  assert.equal(
    (detectorQuery.match(/order_row\.created_at <= cart\.last_activity_at \+ INTERVAL '96 hours'/g) || []).length,
    4,
  );

  const orderTime = Date.parse('2026-09-01T00:00:00.000Z');
  const monthOldActivity = Date.parse('2026-08-01T00:00:00.000Z');
  const recoveryWindowMs = 96 * 60 * 60 * 1000;
  assert.equal(orderTime <= monthOldActivity + recoveryWindowMs, false);
});

test('a delayed session-hinted payment cannot expire or recover a concurrent same-email cart', async () => {
  const intendedSession = 'delayed-intended-session';
  const unrelatedCart = {
    id: cartId,
    user_id: null,
    session_id: 'concurrent-other-session',
    email: 'shared-buyer@example.com',
    normalized_email: 'shared-buyer@example.com',
    created_at: '2026-09-01T00:01:00.000Z',
    last_activity_at: '2026-09-01T00:01:00.000Z',
  };
  assert.notEqual(unrelatedCart.session_id, intendedSession);

  let senderQuery = '';
  await sendModule._test.findCompletedOrder(async (first) => {
    senderQuery = queryText(first);
    return [];
  }, unrelatedCart);
  assert.match(
    senderQuery,
    /NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\), ''\) IS NULL\s+AND\s+order_row\.created_at >=/,
  );
  assert.doesNotMatch(
    senderQuery,
    /OR \(\s*order_row\.created_at >=[^)]*\)\s+OR \(\s*\?::text IS NOT NULL\s+AND NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\)/,
  );

  let detectorQuery = '';
  await detector._test.settleCompletedCarts(async (first) => {
    detectorQuery = queryText(first);
    return [];
  });
  assert.match(
    detectorQuery,
    /NULLIF\(BTRIM\(batch_order\.abandoned_cart_session_id\), ''\) IS NULL\s+AND\s+batch_cart\.created_at <= batch_order\.created_at/,
  );
  assert.match(
    detectorQuery,
    /NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\), ''\) IS NULL\s+AND\s+cart\.created_at <= order_row\.created_at/,
  );
  assert.match(
    detectorQuery,
    /NULLIF\(BTRIM\(order_row\.abandoned_cart_session_id\), ''\) IS NULL\s+AND\s+cart\.last_activity_at <= order_row\.created_at/,
  );
});

test('signed same-row reactivation is caught by the final pre-provider guard', async () => {
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'cross-device-recovery-session',
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [],
    total_value: '25.00',
    estimated_total_cents: 2500,
    discount_code: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-08-31T00:00:00.000Z',
    last_activity_at: '2026-08-31T01:00:00.000Z',
  };
  let stopped = false;
  let providerCalls = 0;
  const sql = async (first) => {
    const query = queryText(first);
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) return [cart];
    if (/\beligible AS\s*\(/i.test(query)) return [{ ...cart, recovery_email_claim_sequence: 1 }];
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [{ id: cartId }];
    }
    if (/AS stop_reason[\s\S]+recovery_email_claim_sequence/i.test(query)) {
      return [{ stop_reason: 'cart_reactivated' }];
    }
    if (/failure_reason = \?/i.test(query) && /WITH stopped AS/i.test(query)) {
      stopped = true;
      return [];
    }
    return [];
  };

  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql,
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
      source: 'admin:test',
    });
    assert.deepEqual(result, { success: false, skipped: true, reason: 'cart_reactivated' });
    assert.equal(providerCalls, 0);
    assert.equal(stopped, true);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('the background scan fetches every capped queue, expires stale carts first, and sends round-robin', async () => {
  const events = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    if (/COALESCE\(abandoned_at, last_activity_at\) <= NOW\(\) - INTERVAL '96 hours'/i.test(query)) {
      events.push('expire-abandoned');
      return [];
    }
    if (/SELECT cart\.id FROM abandoned_carts AS cart/i.test(query)) {
      const sequence = /recovery_emails_sent = 0/.test(query) ? 1
        : /recovery_emails_sent = 1/.test(query) ? 2 : 3;
      events.push(`query-${sequence}`);
      assert.equal(values.includes(detector._test.DELIVERY_BATCH_SIZE), true);
      return [{ id: `cart-${sequence}` }];
    }
    return [];
  };
  detector._test.setDelivery(async ({ sequenceNumber }) => {
    events.push(`send-${sequenceNumber}`);
    return { success: true };
  });
  try {
    const summary = await detector._test.runRecoveryScan({
      sql,
      resend: {},
      deadlineAtMs: 100_000,
      now: () => 0,
    });
    assert.ok(events.indexOf('expire-abandoned') < events.indexOf('query-1'));
    assert.ok(events.indexOf('query-3') < events.indexOf('send-1'));
    assert.deepEqual(events.filter((event) => event.startsWith('send-')), ['send-1', 'send-2', 'send-3']);
    assert.deepEqual([summary.email1.sent, summary.email2.sent, summary.email3.sent], [1, 1, 1]);
  } finally {
    detector._test.resetDependencies();
  }
});

test('round-robin work gives later sequences a share before deadline pressure stops new claims', async () => {
  const attempted = [];
  let clockReads = 0;
  detector._test.setDelivery(async ({ sequenceNumber }) => {
    attempted.push(sequenceNumber);
    return { success: true };
  });
  try {
    const summaries = await detector._test.deliverFairDue({}, {}, [
      { sequenceNumber: 1, candidates: Array.from({ length: 8 }, (_, index) => ({ id: `one-${index}` })) },
      { sequenceNumber: 2, candidates: [{ id: 'two-0' }] },
      { sequenceNumber: 3, candidates: [{ id: 'three-0' }] },
    ], {
      deadlineAtMs: 31_000,
      now: () => {
        clockReads += 1;
        return clockReads <= 3 ? 0 : 31_000;
      },
    });
    assert.deepEqual(attempted.slice(0, 3), [1, 2, 3]);
    assert.equal(summaries.get(2).sent, 1);
    assert.equal(summaries.get(3).sent, 1);
    assert.ok(summaries.get(1).skipped > 0);
  } finally {
    detector._test.resetDependencies();
  }
});

test('durable worker leases reject overlap and are owner-released even after a fatal scan', async () => {
  let released = false;
  let scanStarted = false;
  const sql = async (first) => {
    const query = queryText(first);
    if (/INSERT INTO recovery_job_leases/i.test(query)) return [{ job_name: detector._test.WORKER_JOB_NAME }];
    if (/UPDATE recovery_job_leases/i.test(query)) {
      released = true;
      return [{ job_name: detector._test.WORKER_JOB_NAME }];
    }
    scanStarted = true;
    throw new Error('fatal maintenance failure');
  };
  detector._test.setEnsureSchema(async () => {});
  try {
    await assert.rejects(detector._test.runLeasedRecoveryWorker({
      sql,
      resend: {},
      ownerToken: 'lease-owner-a',
      deadlineAtMs: 100_000,
      now: () => 0,
    }), /fatal maintenance failure/);
    assert.equal(scanStarted, true);
    assert.equal(released, true);

    let overlapQueries = 0;
    const held = await detector._test.runLeasedRecoveryWorker({
      sql: async (first) => {
        overlapQueries += 1;
        const query = queryText(first);
        if (/INSERT INTO recovery_job_leases/i.test(query)) return [];
        throw new Error('overlapping worker must not scan');
      },
      resend: {},
      ownerToken: 'lease-owner-b',
      deadlineAtMs: 100_000,
      now: () => 0,
    });
    assert.deepEqual(held, { success: true, skipped: true, reason: 'worker_lease_held' });
    assert.equal(overlapQueries, 1);
  } finally {
    detector._test.resetDependencies();
  }
});

test('scheduled dispatch uses only deploy-controlled origin and the background endpoint fails closed', async () => {
  let dispatch = null;
  const result = await dispatcherTest.dispatchRecoveryWorker({
    env: {
      DEPLOY_URL: 'https://mutable-and-ignored.example',
      DEPLOY_PRIME_URL: 'https://also-ignored.example',
      URL: 'https://production.example',
      INTERNAL_JOB_SECRET: 'internal-recovery-secret',
    },
    context: {
      deploy: { id: '66d20f2c1a2b3c4d5e6f7890' },
      site: { name: 'banners-on-the-fly' },
    },
    fetchImpl: async (url, options) => {
      dispatch = { url, options };
      return { status: 202 };
    },
  });
  assert.deepEqual(result, { queued: true });
  assert.equal(
    dispatch.url,
    `https://66d20f2c1a2b3c4d5e6f7890--banners-on-the-fly.netlify.app${dispatcherTest.BACKGROUND_PATH}`,
  );
  assert.equal(dispatch.options.headers['X-Internal-Job-Secret'], 'internal-recovery-secret');
  assert.equal(dispatch.options.redirect, 'error');
  assert.ok(dispatch.options.signal instanceof AbortSignal);
  await assert.rejects(dispatcherTest.dispatchRecoveryWorker({
    env: { DEPLOY_PRIME_URL: 'https://site.netlify.app', INTERNAL_JOB_SECRET: 'secret' },
    context: { deploy: { id: 'valid-deploy' }, site: { name: 'valid-site' } },
    fetchImpl: async () => ({ status: 200 }),
  }), /RECOVERY_BACKGROUND_DISPATCH_200/);
  assert.equal(dispatcherTest.immutableDeployOrigin({
    deploy: { id: 'valid-deploy' }, site: { name: 'valid-site' },
  }), 'https://valid-deploy--valid-site.netlify.app');
  assert.equal(dispatcherTest.immutableDeployOrigin({
    deploy: { id: 'bad.deploy' }, site: { name: 'valid-site' },
  }), null);
  await assert.rejects(dispatcherTest.dispatchRecoveryWorker({
    env: { URL: 'https://mutable-must-not-fallback.example', INTERNAL_JOB_SECRET: 'secret' },
    context: {},
    fetchImpl: async () => ({ status: 202 }),
  }), /RECOVERY_DISPATCH_CONFIGURATION_MISSING/);

  const validRequest = new Request('https://site.netlify.app/.netlify/functions/detect-abandoned-carts-background', {
    method: 'POST',
    headers: { 'x-internal-job-secret': 'internal-recovery-secret' },
  });
  assert.equal(backgroundTest.authorizedInternalRequest(validRequest, {
    INTERNAL_JOB_SECRET: 'internal-recovery-secret',
  }), true);
  assert.equal(backgroundTest.authorizedInternalRequest(validRequest, {
    INTERNAL_JOB_SECRET: 'different-secret',
  }), false);
  assert.equal(backgroundTest.authorizedInternalRequest(validRequest, {}), false);
});
