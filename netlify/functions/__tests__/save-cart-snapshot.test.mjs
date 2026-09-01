import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import serverAuth from '../_shared/server-auth.cjs';
import snapshotSource from '../_shared/legacy/save-cart-snapshot.cjs?raw';

const require = createRequire(import.meta.url);
const {
  createAbandonedCartRecoveryToken,
} = require('../_shared/abandoned-cart-recovery-token.cjs');
const {
  calculateLineSubtotalCents,
  cartItemHasArtwork,
  highestStage,
  handleSnapshotRequest,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeStage,
  normalizeSnapshotRevision,
  sanitizeCartItems,
  sanitizeSnapshotMetadata,
  isLocalCaptureRequest,
  requestIsSameOrigin,
  requiresBrowserSource,
  snapshotPayloadIsNewer,
  upsertForSession,
  upsertForUser,
  verifiedRecoveryCartId,
  verifiedSnapshotUserId,
} = require('../_shared/legacy/save-cart-snapshot.cjs');

const RECOVERY_CART_ID = 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60';
const RECOVERY_SECRET = 'snapshot-cross-device-recovery-secret';

const snapshotEvent = (overrides = {}) => ({
  httpMethod: 'POST',
  headers: { host: 'localhost:8888' },
  body: JSON.stringify({
    sessionId: 'session_snapshot_handler_123',
    cartItems: [{ id: 'line-1', line_total_cents: 2_500 }],
    stage: 'cart',
    subtotalCents: 2_500,
    snapshotRevision: 100,
    ...overrides,
  }),
});

const handlerDependencies = (transactionImpl) => {
  const sql = (strings, ...values) => ({ query: strings.join('?'), values });
  sql.transaction = transactionImpl;
  return {
    sql,
    ensureAbandonedCartSchema: async () => {},
    consumeCaptureQuota: async () => ({ allowed: true, scope: null, retryAfterSeconds: 0 }),
  };
};

describe('save-cart-snapshot boundary helpers', () => {
  it('normalizes contact fields before persistence', () => {
    expect(normalizeEmail(' Buyer@Example.COM ')).toBe('buyer@example.com');
    expect(normalizeEmail('buyer@')).toBeNull();
    expect(normalizePhone('+1 (215) 555-0199')).toBe('+12155550199');
    expect(normalizePhone('12')).toBeNull();
    expect(normalizeName('  Ada   Marie  ')).toBe('Ada Marie');
  });

  it('models the monotonic funnel order', () => {
    expect(normalizeStage('unknown')).toBe('cart');
    expect(highestStage('cart', 'contact')).toBe('contact');
    expect(highestStage('payment_started', 'checkout')).toBe('payment_started');
  });

  it('keeps rich checkout totals when a late sparse cart save wins the network race', () => {
    const discountMerges = snapshotSource.match(
      /discount_cents = CASE WHEN \([\s\S]*?EXCLUDED\.snapshot_revision > abandoned_carts\.snapshot_revision[\s\S]*?THEN COALESCE\(EXCLUDED\.discount_cents, abandoned_carts\.discount_cents\)/g,
    ) || [];
    const taxMerges = snapshotSource.match(
      /tax_cents = CASE WHEN \([\s\S]*?EXCLUDED\.snapshot_revision > abandoned_carts\.snapshot_revision[\s\S]*?THEN COALESCE\(EXCLUDED\.tax_cents, abandoned_carts\.tax_cents\)/g,
    ) || [];
    const estimateMerges = snapshotSource.match(
      /estimated_total_cents = CASE WHEN \([\s\S]*?THEN COALESCE\(EXCLUDED\.estimated_total_cents, abandoned_carts\.estimated_total_cents\)/g,
    ) || [];
    const subtotalMerges = snapshotSource.match(
      /subtotal_cents = CASE[\s\S]*?WHEN EXCLUDED\.estimated_total_cents IS NULL[\s\S]*?AND abandoned_carts\.estimated_total_cents IS NOT NULL[\s\S]*?THEN abandoned_carts\.subtotal_cents[\s\S]*?ELSE EXCLUDED\.subtotal_cents[\s\S]*?END/g,
    ) || [];

    expect(discountMerges).toHaveLength(2);
    expect(taxMerges).toHaveLength(2);
    expect(estimateMerges).toHaveLength(2);
    expect(subtotalMerges).toHaveLength(2);
    expect(snapshotSource).not.toMatch(/discount_cents = EXCLUDED\.discount_cents/);
    expect(snapshotSource).not.toMatch(/subtotal_cents = EXCLUDED\.subtotal_cents/);
    expect(snapshotSource).toMatch(
      /WHEN EXCLUDED\.estimated_total_cents IS NULL[\s\S]*?THEN abandoned_carts\.total_value/,
    );
    expect(snapshotSource).toMatch(/guest_cart\.snapshot_revision > user_cart\.snapshot_revision/);
    expect(snapshotSource).toMatch(/THEN COALESCE\(guest_cart\.discount_cents, user_cart\.discount_cents\)/);
    // PostgreSQL COALESCE treats 0 as a known value, so a rich checkout's
    // explicit zero clears a removed discount instead of restoring the old one.
    const mergeKnownCents = (incoming, existing) => incoming ?? existing;
    expect(mergeKnownCents(null, 1_000)).toBe(1_000);
    expect(mergeKnownCents(0, 1_000)).toBe(0);
    expect(normalizeSnapshotRevision(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(normalizeSnapshotRevision(0)).toBeNull();
    expect(snapshotPayloadIsNewer(200, 100)).toBe(true);
    expect(snapshotPayloadIsNewer(100, 200)).toBe(false);
    expect(snapshotPayloadIsNewer(null, 200)).toBe(false);
    expect(snapshotPayloadIsNewer(null, null)).toBe(true);
  });

  it('atomically retires an owner-validated abandoned attempt before a return-cart upsert', async () => {
    const existingCartId = 'a62c61fa-8ee5-4baa-9cc7-21d5be2b4d60';
    const userId = '1f692f32-9f8d-4a26-9a39-31c60f036331';
    const sessionId = 'session_returning_buyer_123';
    const baseValues = {
      existingCartId,
      email: 'buyer@example.com',
      phone: null,
      firstName: null,
      lastName: null,
      cartJson: '[]',
      totalValue: '25.00',
      subtotalCents: 2_500,
      discountCents: null,
      taxCents: null,
      estimatedTotalCents: null,
      hasArtwork: false,
      stage: 'cart',
      utm: { source: null, medium: null, campaign: null },
    };
    const batches = [];
    const sql = (strings, ...values) => ({ query: strings.join('?'), values });
    sql.transaction = async (queries) => {
      batches.push(queries);
      return queries.map((_, index) => (
        index === queries.length - 1
          ? [{ id: 'new-active-cart', recovery_status: 'active', checkout_stage: 'cart' }]
          : []
      ));
    };

    const guestSaved = await upsertForSession(sql, {
      ...baseValues,
      userId: null,
      sessionId,
    });
    expect(guestSaved[0]).toMatchObject({ id: 'new-active-cart', recovery_status: 'active' });
    expect(batches[0]).toHaveLength(3);
    expect(batches[0][0].query).toMatch(/pg_advisory_xact_lock/);
    expect(batches[0][1].query).toMatch(
      /id = \?::uuid[\s\S]*?recovery_status = 'abandoned'[\s\S]*?session_id = \?/,
    );
    expect(batches[0][1].query).toMatch(/SET recovery_status = 'expired'/);
    expect(batches[0][1].query).not.toMatch(/SET[\s\S]*?abandoned_at\s*=/);
    expect(batches[0][2].query).toMatch(
      /INSERT INTO abandoned_carts[\s\S]*?'active'[\s\S]*?ON CONFLICT \(session_id\)/,
    );

    batches.length = 0;
    await upsertForUser(sql, {
      ...baseValues,
      userId,
      sessionId: null,
    });
    expect(batches[0]).toHaveLength(3);
    expect(batches[0][1].query).toMatch(/user_id = \?::uuid/);
    expect(batches[0][1].values).toContain(existingCartId);
    expect(batches[0][1].values).toContain(userId);
    expect(batches[0][1].values).not.toContain('buyer@example.com');
  });

  it('keeps the newer handler payload when independent saves finish in reverse order', async () => {
    const durable = { revision: null, email: null, itemId: null, hasArtwork: null };
    const batches = [];
    let expectedRevision = 200;
    const dependencies = handlerDependencies(async (queries) => {
      batches.push(queries);
      const upserts = queries.filter(({ query }) => /INSERT INTO abandoned_carts/.test(query));
      expect(upserts).toHaveLength(1);
      const upsert = upserts[0];
      expect(upsert.query).toMatch(/EXCLUDED\.snapshot_revision > abandoned_carts\.snapshot_revision/);
      expect(upsert.values).toContain(expectedRevision);
      const email = upsert.values.find((value) => typeof value === 'string' && value.includes('@'));
      const cartJson = upsert.values.find((value) => (
        typeof value === 'string' && value.startsWith('[{"id"')
      ));
      if (snapshotPayloadIsNewer(expectedRevision, durable.revision)) {
        durable.revision = expectedRevision;
        durable.email = email;
        durable.itemId = JSON.parse(cartJson)[0].id;
        durable.hasArtwork = upsert.values.includes(true);
      }
      return queries.map((query) => (/INSERT INTO abandoned_carts/.test(query.query)
        ? [{ id: RECOVERY_CART_ID, recovery_status: 'active', checkout_stage: 'contact' }]
        : []));
    });

    const newest = await handleSnapshotRequest(snapshotEvent({
      snapshotRevision: 200,
      email: 'latest-contact@example.com',
      stage: 'contact',
      cartItems: [{ id: 'latest-line', line_total_cents: 3_000, file_key: 'latest.pdf' }],
    }), dependencies);
    expect(newest.statusCode).toBe(200);

    // The earlier request completes after the latest contact/pagehide capture.
    expectedRevision = 100;
    const stale = await handleSnapshotRequest(snapshotEvent({
      snapshotRevision: 100,
      email: 'stale-contact@example.com',
      stage: 'cart',
      cartItems: [{ id: 'stale-line', line_total_cents: 2_500 }],
    }), dependencies);
    expect(stale.statusCode).toBe(200);
    expect(batches).toHaveLength(2);
    expect(durable).toEqual({
      revision: 200,
      email: 'latest-contact@example.com',
      itemId: 'latest-line',
      hasArtwork: true,
    });
  });

  it('stamps an incoming cart stage when a legacy row still has an unknown stage', async () => {
    const durable = { stage: null, stageUpdatedAt: null, hasArtwork: null };
    const dependencies = handlerDependencies(async (queries) => {
      const upsert = queries.find(({ query }) => /INSERT INTO abandoned_carts/.test(query));
      expect(upsert).toBeTruthy();
      expect(upsert.query).toMatch(
        /checkout_stage = CASE\s+WHEN abandoned_carts\.checkout_stage IS NULL[\s\S]*?THEN EXCLUDED\.checkout_stage/,
      );
      expect(upsert.query).toMatch(
        /checkout_stage_updated_at = CASE\s+WHEN abandoned_carts\.checkout_stage IS NULL[\s\S]*?THEN NOW\(\)/,
      );

      // This models the equal-rank legacy case that PostgreSQL must accept:
      // NULL -> cart also stamps the provenance timestamp before artwork is known.
      durable.stage = 'cart';
      durable.stageUpdatedAt = 'stamped';
      durable.hasArtwork = upsert.values.includes(true);
      return queries.map(({ query }) => (/INSERT INTO abandoned_carts/.test(query)
        ? [{ id: RECOVERY_CART_ID, recovery_status: 'active', checkout_stage: durable.stage }]
        : []));
    });

    const result = await handleSnapshotRequest(snapshotEvent({
      stage: 'cart',
      snapshotRevision: 250,
      cartItems: [{ id: 'legacy-row-line', line_total_cents: 2_500, file_key: 'art.pdf' }],
    }), dependencies);

    expect(result.statusCode).toBe(200);
    expect(durable).toEqual({ stage: 'cart', stageUpdatedAt: 'stamped', hasArtwork: true });
    expect(snapshotSource).toMatch(/user_cart\.checkout_stage IS NULL/);
    expect(snapshotSource).toMatch(/cart\.checkout_stage IS NULL/);
  });

  it('handler atomically rebinds only an exact token-authorized recovery cart', async () => {
    const previous = process.env.ABANDONED_CART_RECOVERY_SECRET;
    process.env.ABANDONED_CART_RECOVERY_SECRET = RECOVERY_SECRET;
    try {
      const token = createAbandonedCartRecoveryToken({
        cartId: RECOVERY_CART_ID,
        sequenceNumber: 1,
        expiresInSeconds: 3_600,
        secret: RECOVERY_SECRET,
      });
      const batches = [];
      const dependencies = handlerDependencies(async (queries) => {
        batches.push(queries);
        return queries.map(({ query }) => (/RETURNING cart\.id/.test(query)
          ? [{ id: RECOVERY_CART_ID, recovery_status: 'active', checkout_stage: 'checkout' }]
          : []));
      });

      const rebound = await handleSnapshotRequest(snapshotEvent({
        sessionId: 'new_device_session_987654',
        snapshotRevision: 300,
        stage: 'checkout',
        recoveryCartId: RECOVERY_CART_ID,
        recoveryToken: token,
      }), dependencies);
      expect(rebound.statusCode).toBe(200);
      expect(JSON.parse(rebound.body)).toMatchObject({
        success: true,
        cartId: RECOVERY_CART_ID,
        status: 'active',
        rebound: true,
      });
      expect(batches).toHaveLength(1);
      expect(batches[0].filter(({ query }) => /UPDATE abandoned_carts AS cart/.test(query))).toHaveLength(1);
      expect(batches[0].map(({ query }) => query).join('\n')).toMatch(
        /recovery_status IN \('active', 'abandoned'\)[\s\S]*?recovery_status = 'expired'[\s\S]*?recovery_status = 'active'/,
      );
      expect(batches[0].map(({ query }) => query).join('\n')).toMatch(/FOR UPDATE/);
      expect(batches[0].flatMap(({ values }) => values)).toContain(RECOVERY_CART_ID);
      expect(verifiedRecoveryCartId(RECOVERY_CART_ID, token)).toBe(RECOVERY_CART_ID);
      expect(verifiedRecoveryCartId(
        'b73d720b-9ff6-4cbb-8aa8-32e71c147e71',
        token,
      )).toBeNull();

      const tampered = await handleSnapshotRequest(snapshotEvent({
        sessionId: 'attacker_session_987654',
        snapshotRevision: 400,
        recoveryCartId: RECOVERY_CART_ID,
        recoveryToken: `${token}tampered`,
      }), dependencies);
      expect(tampered.statusCode).toBe(403);
      expect(JSON.parse(tampered.body)).toMatchObject({ code: 'RECOVERY_CART_AUTHORITY_INVALID' });
      expect(batches).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.ABANDONED_CART_RECOVERY_SECRET;
      else process.env.ABANDONED_CART_RECOVERY_SECRET = previous;
    }
  });

  it('bounds and sanitizes untrusted cart contents', () => {
    const cartItems = sanitizeCartItems(Array.from({ length: 55 }, (_, index) => ({
      ...(index === 0 ? {
        __bof_abandoned_cart_snapshot_v1: {
          version: 1,
          sourceItemCount: 55,
          storedItemCount: 40,
          complete: false,
        },
      } : {}),
      id: `item-${index}`,
      width_in: 48,
      height_in: 24,
      material: '13oz',
      quantity: 1,
      line_total_cents: 3_600,
      file_key: `uploads/${index}.pdf`,
      file_url: `data:application/pdf;base64,${'x'.repeat(40_000)}`,
      canvas_snapshot: 'x'.repeat(40_000),
    })));

    expect(cartItems).toHaveLength(40);
    expect(JSON.stringify(cartItems).length).toBeLessThan(350_000);
    expect(cartItems[0].file_url).toBeNull();
    expect(cartItems[0]).not.toHaveProperty('canvas_snapshot');
    expect(cartItems[0].has_artwork).toBe(true);
    expect(cartItems[0].__bof_abandoned_cart_snapshot_v1).toEqual({
      version: 1,
      sourceItemCount: 55,
      storedItemCount: 40,
      complete: false,
    });
    expect(cartItemHasArtwork(cartItems[0])).toBe(true);
    expect(calculateLineSubtotalCents(cartItems)).toBe(144_000);

    const withoutArtwork = sanitizeCartItems([{
      id: 'plain-banner',
      line_total_cents: 2_500,
    }]);
    expect(withoutArtwork[0]).toHaveProperty('has_artwork', false);

    const summaryFallback = sanitizeCartItems([{
      __bof_abandoned_cart_snapshot_v1: {
        version: 1,
        sourceItemCount: 1,
        storedItemCount: 1,
        complete: true,
      },
      id: 'summary-fallback',
      ...Object.fromEntries(Array.from(
        { length: 10 },
        (_, index) => [`large_field_${index}`, 'x'.repeat(5_000)],
      )),
    }]);
    expect(summaryFallback[0].__bof_abandoned_cart_snapshot_v1).toEqual({
      version: 1,
      sourceItemCount: 1,
      storedItemCount: 1,
      complete: true,
    });
    expect(summaryFallback[0]).not.toHaveProperty('large_field_0');
    expect(sanitizeSnapshotMetadata({
      __bof_abandoned_cart_snapshot_v1: {
        version: 2,
        sourceItemCount: 1,
        storedItemCount: 1,
        complete: true,
      },
    })).toBeNull();
  });

  it('rejects cross-origin capture and verifies a claimed signed-in owner', () => {
    expect(requestIsSameOrigin({
      headers: {
        host: 'bannersonthefly.com',
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
    })).toBe(false);
    expect(requestIsSameOrigin({
      headers: { host: 'bannersonthefly.com', origin: 'https://bannersonthefly.com' },
    })).toBe(true);
    expect(requestIsSameOrigin({
      headers: { host: 'bannersonthefly.com' },
    }, { requireSource: true })).toBe(false);
    expect(requestIsSameOrigin({
      headers: {
        host: 'bannersonthefly.com',
        referer: 'https://bannersonthefly.com/checkout',
      },
    }, { requireSource: true })).toBe(true);
    expect(requestIsSameOrigin({
      headers: {
        host: 'bannersonthefly.com',
        origin: 'http://bannersonthefly.com',
      },
    }, { requireSource: true, requireHttps: true })).toBe(false);

    expect(requiresBrowserSource({
      headers: { host: 'bannersonthefly.com' },
    }, { CONTEXT: 'production' })).toBe(true);
    expect(requiresBrowserSource({
      headers: { host: 'localhost:8888' },
    }, { CONTEXT: 'production' })).toBe(false);
    expect(isLocalCaptureRequest({
      headers: { host: '127.0.0.1:8888' },
    }, {})).toBe(true);

    const previousSecret = process.env.AUTH_SESSION_SECRET;
    process.env.AUTH_SESSION_SECRET = 'snapshot-owner-test-secret';
    try {
      const userId = '11111111-1111-4111-8111-111111111111';
      const token = serverAuth.createSessionToken({ id: userId, email: 'buyer@example.com', is_admin: false });
      const event = { headers: { authorization: `Bearer ${token}` } };
      expect(verifiedSnapshotUserId(event, userId)).toBe(userId);
      expect(verifiedSnapshotUserId(event, '22222222-2222-4222-8222-222222222222')).toBeNull();
      expect(verifiedSnapshotUserId({ headers: {} }, userId)).toBeNull();
    } finally {
      if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
      else process.env.AUTH_SESSION_SECRET = previousSecret;
    }
  });

  it('fails closed for production contact capture without a trusted edge IP', async () => {
    const previousContext = process.env.CONTEXT;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousRateLimitSecret = process.env.ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET;
    process.env.CONTEXT = 'production';
    process.env.NODE_ENV = 'production';
    process.env.ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET = 'snapshot-production-rate-limit-secret';
    try {
      let quotaCalls = 0;
      const dependencies = handlerDependencies(async (queries) => queries.map(({ query }) => (
        /INSERT INTO abandoned_carts/.test(query)
          ? [{ id: RECOVERY_CART_ID, recovery_status: 'active', checkout_stage: 'contact' }]
          : []
      )));
      dependencies.consumeCaptureQuota = async () => {
        quotaCalls += 1;
        return { allowed: true, scope: null, retryAfterSeconds: 0 };
      };
      const productionEvent = {
        ...snapshotEvent({ email: 'buyer@example.com', stage: 'contact' }),
        headers: {
          host: 'bannersonthefly.com',
          origin: 'https://bannersonthefly.com',
          'x-forwarded-proto': 'https',
          // A client-controlled fallback must not satisfy production IP quota.
          'x-forwarded-for': '198.51.100.8',
        },
      };

      const unavailable = await handleSnapshotRequest(productionEvent, dependencies);
      expect(unavailable.statusCode).toBe(503);
      expect(quotaCalls).toBe(0);

      const trusted = await handleSnapshotRequest({
        ...productionEvent,
        headers: {
          ...productionEvent.headers,
          'x-nf-client-connection-ip': '203.0.113.19',
        },
      }, dependencies);
      expect(trusted.statusCode).toBe(200);
      expect(quotaCalls).toBe(1);
    } finally {
      if (previousContext === undefined) delete process.env.CONTEXT;
      else process.env.CONTEXT = previousContext;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousRateLimitSecret === undefined) {
        delete process.env.ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET;
      } else {
        process.env.ABANDONED_CART_CAPTURE_RATE_LIMIT_SECRET = previousRateLimitSecret;
      }
    }
  });

  it('keeps database and schema failures out of the public 500 payload', () => {
    expect(snapshotSource).toMatch(/code: 'SNAPSHOT_SAVE_FAILED'/);
    expect(snapshotSource).not.toMatch(/message:\s*error\?\.message/);
  });
});
