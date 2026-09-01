import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RecoveryTokenError,
  createAbandonedCartRecoveryToken,
  resolveRecoverySecret,
  verifyAbandonedCartRecoveryToken,
} = require('../_shared/abandoned-cart-recovery-token.cjs');
const {
  createRecoverAbandonedCartHandler,
  prepareCartRecovery,
  requestIsSameOrigin,
  sanitizeCartItems,
} = require('../_shared/legacy/recover-abandoned-cart.cjs');

const CART_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-recovery-secret-with-enough-entropy';
const NOW = Date.parse('2026-09-01T12:00:00.000Z');

const previousEnvironment = {};

beforeEach(() => {
  for (const key of [
    'ABANDONED_CART_RECOVERY_SECRET',
    'AUTH_SESSION_SECRET',
    'CLOUDINARY_API_SECRET',
    'NETLIFY_DATABASE_URL',
    'DATABASE_URL',
    'VITE_DATABASE_URL',
  ]) {
    previousEnvironment[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('abandoned-cart recovery token', () => {
  it('binds a cart UUID, sequence, and short expiry to an HMAC-SHA256 signature', () => {
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 2,
      expiresInSeconds: 3600,
      now: NOW,
      secret: SECRET,
    });

    expect(token.split('.')).toHaveLength(2);
    expect(verifyAbandonedCartRecoveryToken(token, { now: NOW + 1000, secret: SECRET })).toEqual({
      cartId: CART_ID,
      sequenceNumber: 2,
      expiresAt: Math.floor(NOW / 1000) + 3600,
    });
  });

  it('rejects tampering and expiry', () => {
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 3,
      expiresInSeconds: 60,
      now: NOW,
      secret: SECRET,
    });
    const [payload, signature] = token.split('.');
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('a') ? 'b' : 'a'}`;

    expect(() => verifyAbandonedCartRecoveryToken(`${tamperedPayload}.${signature}`, {
      now: NOW,
      secret: SECRET,
    })).toThrowError(RecoveryTokenError);
    try {
      verifyAbandonedCartRecoveryToken(token, { now: NOW + 61_000, secret: SECRET });
      throw new Error('Expected expiry rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'RECOVERY_TOKEN_EXPIRED' });
    }
  });

  it('uses the dedicated secret first and fails closed when no fallback is configured', () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = 'dedicated';
    process.env.AUTH_SESSION_SECRET = 'auth-fallback';
    process.env.CLOUDINARY_API_SECRET = 'cloudinary-fallback';
    expect(resolveRecoverySecret()).toBe('dedicated');

    delete process.env.ABANDONED_CART_RECOVERY_SECRET;
    expect(resolveRecoverySecret()).toBe('auth-fallback');
    delete process.env.AUTH_SESSION_SECRET;
    expect(resolveRecoverySecret()).toBe('cloudinary-fallback');
    delete process.env.CLOUDINARY_API_SECRET;
    try {
      createAbandonedCartRecoveryToken({ cartId: CART_ID, sequenceNumber: 1, now: NOW });
      throw new Error('Expected secret failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'RECOVERY_SECRET_UNAVAILABLE' });
    }
  });
});

describe('recover-abandoned-cart endpoint', () => {
  it('returns only bounded cart fields and a discount proven against the exact email sequence', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const queries = [];
    const rawCartItem = {
      id: 'cart-line-1',
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      quantity: 2,
      material: 'vinyl-13oz',
      grommets: 'every-2-feet',
      pole_pockets: 'none',
      rope_feet: 0,
      area_sqft: 8,
      unit_price_cents: 3200,
      rope_cost_cents: 0,
      pole_pocket_cost_cents: 0,
      line_total_cents: 6400,
      file_url: 'https://res.cloudinary.com/example/image/upload/banner.png',
      created_at: '2026-09-01T10:00:00.000Z',
      email: 'secret-buyer@example.com',
      phone: '+1-555-555-1234',
      user_id: 'private-user-id',
      session_id: 'private-session-id',
      design_draft_contact: 'secret-buyer@example.com',
      overlay_image: {
        name: 'logo.png',
        url: 'javascript:alert(1)',
        email: 'nested-secret@example.com',
        position: { x: 10, y: 20 },
      },
    };

    const createSql = () => async (strings, ...values) => {
      const query = strings.join(' ');
      queries.push({ query, values });
      if (query.includes('SELECT cart_contents, recovery_status')) {
        return [{ cart_contents: [rawCartItem], recovery_status: 'abandoned' }];
      }
      if (query.includes('SELECT delivery_discount.code')) return [{ code: 'CART10-EXACT' }];
      if (query.includes('SELECT dc.code')) return [{ code: 'LEGACY-FALLBACK' }];
      return [{ id: 'recovery-click-log-id' }];
    };
    const handler = createRecoverAbandonedCartHandler({ createSql, now: () => NOW });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 2,
      expiresInSeconds: 3600,
      now: NOW,
      secret: SECRET,
    });

    const response = await handler({
      httpMethod: 'POST',
      headers: {
        origin: 'https://banners.example',
        host: 'banners.example',
        'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ token }),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['Cache-Control']).toContain('no-store');
    expect(body).toMatchObject({
      success: true,
      complete: true,
      cartId: CART_ID,
      recoveryToken: token,
      sourceItemCount: 1,
      storedItemCount: 1,
      discountCode: 'CART10-EXACT',
    });
    expect(verifyAbandonedCartRecoveryToken(body.recoveryToken, { now: NOW, secret: SECRET })).toMatchObject({
      cartId: body.cartId,
      sequenceNumber: 2,
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'cart-line-1', quantity: 2, line_total_cents: 6400 });
    expect(body.items[0]).not.toHaveProperty('email');
    expect(body.items[0]).not.toHaveProperty('phone');
    expect(body.items[0]).not.toHaveProperty('user_id');
    expect(body.items[0]).not.toHaveProperty('session_id');
    expect(body.items[0].overlay_image).not.toHaveProperty('email');
    expect(body.items[0].overlay_image).not.toHaveProperty('url');
    expect(response.body).not.toContain('secret-buyer@example.com');
    expect(response.body).not.toContain('nested-secret@example.com');
    expect(response.body).not.toContain('private-session-id');

    const discountQuery = queries.find(({ query }) => query.includes('SELECT delivery_discount.code'));
    expect(discountQuery.query).toContain("delivery.status = 'sent'");
    expect(discountQuery.values).toContain(CART_ID);
    expect(discountQuery.values).toContain(2);
    expect(queries.some(({ query }) => query.includes('SELECT dc.code'))).toBe(false);
    const clickQuery = queries.find(({ query }) => query.includes('inserted_click'));
    expect(clickQuery.query).toContain('pg_advisory_xact_lock');
    expect(clickQuery.query).toContain('NOT EXISTS');
    expect(clickQuery.query).toContain("'email_clicked'");
    expect(clickQuery.query).not.toContain('cart_recovered');
  });

  it('rejects cross-origin requests before reading a bearer token', async () => {
    const handler = createRecoverAbandonedCartHandler({
      createSql: () => {
        throw new Error('database must not be called');
      },
      now: () => NOW,
    });
    const response = await handler({
      httpMethod: 'GET',
      headers: {
        origin: 'https://attacker.example',
        host: 'banners.example',
        'sec-fetch-site': 'cross-site',
      },
      queryStringParameters: { token: 'not-read' },
    });
    expect(response.statusCode).toBe(403);
    expect(requestIsSameOrigin({
      headers: { origin: 'https://banners.example', host: 'banners.example' },
    })).toBe(true);
  });

  it('reports oversized or malformed stored carts instead of silently returning a slice', () => {
    const valid = {
      id: 'line',
      width_in: 24,
      height_in: 12,
      quantity: 1,
      material: 'vinyl',
      grommets: 'none',
      pole_pockets: 'none',
      line_total_cents: 2000,
      customerEmail: 'buyer@example.com',
    };
    const prepared = prepareCartRecovery([
      { ...valid, quantity: 0 },
      ...Array.from({ length: 40 }, (_, index) => ({ ...valid, id: `line-${index}` })),
    ]);
    expect(prepared).toMatchObject({
      completeness: 'incomplete',
      reason: 'stored_item_count_oversized',
      sourceItemCount: 41,
      storedItemCount: 41,
    });
    expect(prepared.items).toHaveLength(39);
    expect(JSON.stringify(prepared.items)).not.toContain('buyer@example.com');
  });

  it('recovers all 30 lines within the aligned response budget after dropping artwork payloads', async () => {
    const cartContents = Array.from({ length: 30 }, (_, index) => ({
      id: `line-${index}`,
      product_type: 'banner',
      width_in: 24,
      height_in: 12,
      quantity: 1,
      material: 'vinyl',
      grommets: 'none',
      pole_pockets: 'none',
      line_total_cents: 2_000 + index,
      yard_sign_sidedness: 'oversized-option-'.repeat(1_000),
      file_key: `uploads/${index}.pdf`,
      placement_preview: {
        previewUrl: `https://cdn.example/${index}.png`,
        scene: 'x'.repeat(20_000),
      },
    }));
    cartContents[0].__bof_abandoned_cart_snapshot_v1 = {
      version: 1,
      sourceItemCount: 30,
      storedItemCount: 30,
      complete: true,
    };

    const prepared = prepareCartRecovery(cartContents);

    expect(prepared).toMatchObject({
      completeness: 'complete',
      sourceItemCount: 30,
      storedItemCount: 30,
    });
    expect(prepared.items).toHaveLength(30);
    expect(prepared.items.map((entry) => entry.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `line-${index}`),
    );
    expect(Buffer.byteLength(JSON.stringify(prepared.items), 'utf8')).toBeLessThanOrEqual(48_000);
    expect(JSON.stringify(prepared.items)).not.toContain('x'.repeat(1_000));
    expect(Buffer.byteLength(prepared.items[0].yard_sign_sidedness, 'utf8')).toBeLessThanOrEqual(48);

    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const handler = createRecoverAbandonedCartHandler({
      now: () => NOW,
      createSql: () => async (strings) => {
        const query = strings.join(' ');
        if (query.includes('SELECT cart_contents, recovery_status')) {
          return [{ cart_contents: cartContents, recovery_status: 'abandoned' }];
        }
        return [{ id: 'recovery-click-log-id' }];
      },
    });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 1,
      expiresInSeconds: 3600,
      now: NOW,
      secret: SECRET,
    });
    const response = await handler({
      httpMethod: 'POST',
      headers: {
        origin: 'https://banners.example',
        host: 'banners.example',
        'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ token }),
    });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      success: true,
      complete: true,
      sourceItemCount: 30,
      storedItemCount: 30,
    });
    expect(body.items).toHaveLength(30);
  });

  it('marks exact-limit historical snapshots as unknown and metadata-proven truncation as incomplete', () => {
    const valid = (index) => ({
      id: `line-${index}`,
      width_in: 24,
      height_in: 12,
      quantity: 1,
      material: 'vinyl',
      grommets: 'none',
      pole_pockets: 'none',
      line_total_cents: 2_000,
    });
    const historical = Array.from({ length: 40 }, (_, index) => valid(index));
    expect(prepareCartRecovery(historical)).toMatchObject({
      completeness: 'unknown',
      reason: 'historical_snapshot_at_limit',
    });

    const knownTruncated = historical.map((entry) => ({ ...entry }));
    knownTruncated[0].__bof_abandoned_cart_snapshot_v1 = {
      version: 1,
      sourceItemCount: 41,
      storedItemCount: 40,
      complete: false,
    };
    expect(prepareCartRecovery(knownTruncated)).toMatchObject({
      completeness: 'incomplete',
      reason: 'snapshot_was_truncated',
      sourceItemCount: 41,
      storedItemCount: 40,
    });

    const historicalNearSizeLimit = Array.from({ length: 6 }, (_, index) => ({
      ...valid(index),
      design_draft_preference: 'x'.repeat(7_000),
    }));
    expect(prepareCartRecovery(historicalNearSizeLimit)).toMatchObject({
      completeness: 'unknown',
      reason: 'historical_snapshot_near_size_limit',
      sourceItemCount: 6,
      storedItemCount: 6,
    });
  });

  it('returns explicit non-restoring responses for incomplete and unverifiable carts', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const valid = (index) => ({
      id: `line-${index}`,
      width_in: 24,
      height_in: 12,
      quantity: 1,
      material: 'vinyl',
      grommets: 'none',
      pole_pockets: 'none',
      line_total_cents: 2_000,
    });
    let cartContents = Array.from({ length: 40 }, (_, index) => valid(index));
    const databaseCalls = [];
    const createSql = () => async (strings) => {
      const query = strings.join(' ');
      databaseCalls.push(query);
      if (query.includes('SELECT cart_contents, recovery_status')) {
        return [{ cart_contents: cartContents, recovery_status: 'abandoned' }];
      }
      return [{ id: 'must-not-write-click' }];
    };
    const handler = createRecoverAbandonedCartHandler({ createSql, now: () => NOW });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 1,
      expiresInSeconds: 3600,
      now: NOW,
      secret: SECRET,
    });
    const event = {
      httpMethod: 'POST',
      headers: {
        origin: 'https://banners.example',
        host: 'banners.example',
        'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ token }),
    };

    const unknownResponse = await handler(event);
    expect(unknownResponse.statusCode).toBe(409);
    expect(JSON.parse(unknownResponse.body)).toMatchObject({
      success: false,
      complete: null,
      error: 'RECOVERY_CART_COMPLETENESS_UNKNOWN',
      storedItemCount: 40,
    });

    cartContents = cartContents.map((entry) => ({ ...entry }));
    cartContents[0].__bof_abandoned_cart_snapshot_v1 = {
      version: 1,
      sourceItemCount: 44,
      storedItemCount: 40,
      complete: false,
    };
    const incompleteResponse = await handler(event);
    expect(incompleteResponse.statusCode).toBe(409);
    expect(JSON.parse(incompleteResponse.body)).toMatchObject({
      success: false,
      complete: false,
      error: 'RECOVERY_CART_INCOMPLETE',
      sourceItemCount: 44,
      storedItemCount: 40,
    });
    expect(databaseCalls.some((query) => query.includes('inserted_click'))).toBe(false);
  });

  it('recovers non-banner products that omit banner-only option fields', () => {
    const [yardSign, carMagnet] = sanitizeCartItems([
      {
        id: 'yard-sign-line',
        product_type: 'yard_sign',
        width_in: 24,
        height_in: 18,
        quantity: 10,
        line_total_cents: 12000,
      },
      {
        id: 'car-magnet-line',
        product_type: 'car_magnet',
        width_in: 24,
        height_in: 12,
        quantity: 1,
        line_total_cents: 2900,
      },
    ]);
    expect(yardSign).toMatchObject({
      product_type: 'yard_sign',
      material: 'corrugated',
      grommets: 'none',
      pole_pockets: 'none',
    });
    expect(carMagnet).toMatchObject({
      product_type: 'car_magnet',
      material: 'magnetic',
      grommets: 'none',
      pole_pockets: 'none',
    });
  });
});
