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

  it('uses the dedicated secret, allows only the auth fallback, and otherwise fails closed', () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = 'dedicated';
    process.env.AUTH_SESSION_SECRET = 'auth-fallback';
    process.env.CLOUDINARY_API_SECRET = 'cloudinary-fallback';
    expect(resolveRecoverySecret()).toBe('dedicated');

    delete process.env.ABANDONED_CART_RECOVERY_SECRET;
    expect(resolveRecoverySecret()).toBe('auth-fallback');
    delete process.env.AUTH_SESSION_SECRET;
    expect(resolveRecoverySecret()).toBeNull();
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
  it('returns only bounded cart fields and the active RECOVER25 code bound to signed email one', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const queries = [];
    const rawCartItem = {
      id: 'cart-line-1',
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      orientation: 'landscape',
      quantity: 2,
      material: 'vinyl-13oz',
      grommets: 'every-2-feet',
      pole_pockets: 'none',
      rope_feet: 0,
      area_sqft: 18,
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
      design_draft_contact: 'draft-contact@example.com',
      artwork_width: 2400,
      artwork_height: 1200,
      normalized_placement: {
        x_pct: 12.5,
        y_pct: -4.25,
        scale_x: 1.2,
        scale_y: 0.8,
        fit_mode: 'fit',
      },
      constrain_proportions: false,
      canvas_state_json: JSON.stringify({
        version: 3,
        constrainProportions: false,
        normalizedPlacement: { x_pct: 12.5, y_pct: -4.25 },
      }),
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
      if (query.includes('SELECT cart_contents, checkout_state, recovery_status')) {
        return [{ cart_contents: [rawCartItem], checkout_state: null, recovery_status: 'abandoned' }];
      }
      if (query.includes('SELECT delivery_discount.code')) return [{ code: 'RECOVER25-EXACT' }];
      if (query.includes('SELECT dc.code')) return [{ code: 'LEGACY-FALLBACK' }];
      return [{ id: 'recovery-click-log-id' }];
    };
    const handler = createRecoverAbandonedCartHandler({ createSql, now: () => NOW });
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
    expect(response.headers['Cache-Control']).toContain('no-store');
    expect(body).toMatchObject({
      success: true,
      complete: true,
      cartId: CART_ID,
      recoveryToken: token,
      sourceItemCount: 1,
      storedItemCount: 1,
      discountCode: 'RECOVER25-EXACT',
    });
    expect(verifyAbandonedCartRecoveryToken(body.recoveryToken, { now: NOW, secret: SECRET })).toMatchObject({
      cartId: body.cartId,
      sequenceNumber: 1,
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 'cart-line-1',
      quantity: 2,
      line_total_cents: 6400,
      orientation: 'landscape',
      artwork_width: 2400,
      artwork_height: 1200,
      design_draft_contact: 'draft-contact@example.com',
      constrain_proportions: false,
      normalized_placement: { x_pct: 12.5, y_pct: -4.25, scale_x: 1.2, scale_y: 0.8 },
    });
    expect(JSON.parse(body.items[0].canvas_state_json)).toMatchObject({ constrainProportions: false });
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
    expect(discountQuery.query).toContain('delivery_discount.used = FALSE');
    expect(discountQuery.query).toContain('delivery_discount.expires_at > NOW()');
    expect(discountQuery.values).toContain(CART_ID);
    expect(discountQuery.values).toContain(1);
    expect(queries.some(({ query }) => query.includes('SELECT dc.code'))).toBe(false);
    const clickQuery = queries.find(({ query }) => query.includes('inserted_click'));
    expect(clickQuery.query).toContain('pg_advisory_xact_lock');
    expect(clickQuery.query).toContain('NOT EXISTS');
    expect(clickQuery.query).toContain("'recovery_link_clicked'");
    expect(clickQuery.query).not.toContain('cart_recovered');
  });

  it('restores a verified cart even when non-authoritative click telemetry fails', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const validItem = {
      id: 'cart-line-telemetry',
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      pole_pockets: 'none',
      rope_feet: 0,
      line_total_cents: 3200,
    };
    const createSql = () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT cart_contents, checkout_state, recovery_status')) {
        return [{ cart_contents: [validItem], checkout_state: null, recovery_status: 'abandoned' }];
      }
      if (query.includes('SELECT delivery_discount.code')) return [];
      if (query.includes('SELECT dc.code')) return [];
      if (query.includes("'recovery_link_clicked'")) {
        const error = new Error('analytics temporarily unavailable');
        error.code = '23514';
        throw error;
      }
      if (query.includes("recovery_status IN ('active', 'abandoned')")) return [{ id: CART_ID }];
      return [];
    };
    const handler = createRecoverAbandonedCartHandler({ createSql, now: () => NOW });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID,
      sequenceNumber: 1,
      expiresInSeconds: 3600,
      now: NOW,
      secret: SECRET,
    });
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
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

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        success: true,
        complete: true,
        cartId: CART_ID,
        discountCode: null,
      });
    } finally {
      console.warn = originalWarn;
    }
  });

  it('returns only the server-selected winner between a saved promo and recovery offer', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const validItem = {
      id: 'cart-line-discount',
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      pole_pockets: 'none',
      rope_feet: 0,
      line_total_cents: 10_000,
    };
    const sql = async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT cart_contents, checkout_state, recovery_status')) {
        return [{
          cart_contents: [validItem],
          checkout_state: { version: 1, discountCode: 'SAVE30' },
          recovery_status: 'abandoned',
          user_id: '22222222-2222-4222-8222-222222222222',
          email: 'Buyer@Example.com',
          normalized_email: 'buyer@example.com',
        }];
      }
      if (query.includes('SELECT delivery_discount.code')) return [{ code: 'RECOVER25-EXACT' }];
      if (query.includes('inserted_click')) return [{ id: 'click-id' }];
      if (query.includes("recovery_status IN ('active', 'abandoned')")) return [{ id: CART_ID }];
      return [];
    };
    let selectorInput = null;
    const handler = createRecoverAbandonedCartHandler({
      createSql: () => sql,
      now: () => NOW,
      selectWinningDiscount: async (input) => {
        selectorInput = input;
        return { code: 'SAVE30', source: 'saved' };
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

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).discountCode).toBe('SAVE30');
    expect(selectorInput).toMatchObject({
      checkoutState: { version: 1, discountCode: 'SAVE30' },
      recoveryCode: 'RECOVER25-EXACT',
      cartId: CART_ID,
      email: 'buyer@example.com',
      userId: '22222222-2222-4222-8222-222222222222',
    });
    expect(selectorInput.items).toHaveLength(1);
  });

  it('accepts recovery only by same-origin POST and never reads bearer tokens from GET URLs', async () => {
    const handler = createRecoverAbandonedCartHandler({
      createSql: () => {
        throw new Error('database must not be called');
      },
      now: () => NOW,
    });
    const getResponse = await handler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { token: 'must-not-be-read-from-query' },
    });
    expect(getResponse.statusCode).toBe(405);
    expect(getResponse.headers.Allow).toBe('POST');

    const response = await handler({
      httpMethod: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'banners.example',
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ token: 'not-read' }),
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
        if (query.includes('SELECT cart_contents, checkout_state, recovery_status')) {
          return [{ cart_contents: cartContents, checkout_state: null, recovery_status: 'abandoned' }];
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

  it('returns a field-level-complete design without stripping its editable state', () => {
    const canvasStateJson = JSON.stringify({
      version: 3,
      orientation: 'landscape',
      constrainProportions: false,
      objects: [{ id: 'customer-artwork', type: 'image', xIn: 2.5, yIn: -1 }],
    });
    const cartContents = [{
      __bof_abandoned_cart_snapshot_v1: {
        version: 1,
        sourceItemCount: 1,
        storedItemCount: 1,
        complete: true,
        fidelity: 'full',
        requiredFieldsComplete: true,
        incompleteReasons: [],
      },
      id: 'exact-line',
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      orientation: 'landscape',
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      pole_pockets: 'top-bottom',
      pole_pocket_size: '4',
      unit_price_cents: 10_000,
      rope_cost_cents: 0,
      pole_pocket_cost_cents: 1_000,
      line_total_cents: 11_000,
      has_artwork: true,
      file_url: 'https://res.cloudinary.com/example/image/upload/original.png',
      artwork_width: 3000,
      artwork_height: 1500,
      design_draft_contact: 'buyer@example.com',
      normalized_placement: {
        x_pct: 15,
        y_pct: -5,
        scale_x: 1.25,
        scale_y: 0.75,
        fit_mode: 'fit',
      },
      constrain_proportions: false,
      canvas_state_json: canvasStateJson,
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/example/image/upload/original.png',
        publicId: 'orders/original',
      },
      placement_preview: {
        sourceUrl: 'https://res.cloudinary.com/example/image/upload/original.png',
        previewUrl: 'https://res.cloudinary.com/example/image/upload/exact-preview.jpg',
        positionPct: { x: 15, y: -5 },
        scaleX: 1.25,
        scaleY: 0.75,
      },
    }];

    const prepared = prepareCartRecovery(cartContents);

    expect(prepared).toMatchObject({
      completeness: 'complete',
      sourceItemCount: 1,
      storedItemCount: 1,
      items: [{
        id: 'exact-line',
        orientation: 'landscape',
        pole_pocket_size: '4',
        artwork_width: 3000,
        artwork_height: 1500,
        design_draft_contact: 'buyer@example.com',
        constrain_proportions: false,
        normalized_placement: { x_pct: 15, y_pct: -5, scale_x: 1.25, scale_y: 0.75 },
        canvas_state_json: canvasStateJson,
      }],
    });
  });

  it('rejects a compact lifecycle snapshot instead of calling it exact', () => {
    const cartContents = [{
      __bof_abandoned_cart_snapshot_v1: {
        version: 1,
        sourceItemCount: 1,
        storedItemCount: 1,
        complete: false,
        fidelity: 'compact',
        requiredFieldsComplete: false,
        incompleteReasons: ['compact_lifecycle_capture'],
      },
      id: 'compact-line',
      width_in: 24,
      height_in: 12,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      pole_pockets: 'none',
      line_total_cents: 2_000,
    }];

    expect(prepareCartRecovery(cartContents)).toMatchObject({
      completeness: 'incomplete',
      reason: 'compact_snapshot_not_exact',
    });
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
      if (query.includes('SELECT cart_contents, checkout_state, recovery_status')) {
        return [{ cart_contents: cartContents, checkout_state: null, recovery_status: 'abandoned' }];
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

  it('keeps valid links working while checkout_state rolls out', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    let additiveColumnFailed = false;
    const cart = {
      cart_contents: [{
        id: 'line-1', product_type: 'banner', width_in: 72, height_in: 36,
        quantity: 1, material: '13oz', grommets: 'none', pole_pockets: 'none',
        line_total_cents: 8_100,
      }],
      checkout_state: null,
      recovery_status: 'abandoned',
      user_id: null,
      email: 'buyer@example.com',
      normalized_email: 'buyer@example.com',
    };
    const createSql = () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT cart_contents, checkout_state')) {
        additiveColumnFailed = true;
        const error = new Error('column does not exist');
        error.code = '42703';
        throw error;
      }
      if (query.includes('SELECT cart_contents, NULL::jsonb AS checkout_state')) return [cart];
      if (query.includes('SELECT id') && query.includes("recovery_status IN ('active', 'abandoned')")) return [{ id: CART_ID }];
      if (query.includes('SELECT delivery_discount.code')) return [];
      return [{ id: 'event' }];
    };
    const handler = createRecoverAbandonedCartHandler({
      createSql,
      now: () => NOW,
      selectWinningDiscount: async () => null,
    });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID, sequenceNumber: 1, expiresInSeconds: 3600, now: NOW, secret: SECRET,
    });
    const response = await handler({
      httpMethod: 'POST',
      headers: { origin: 'https://banners.example', host: 'banners.example', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ token }),
    });
    expect(additiveColumnFailed).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).checkoutState).toBeNull();
  });

  it('does not disclose a cart that closes while recovery is being prepared', async () => {
    process.env.ABANDONED_CART_RECOVERY_SECRET = SECRET;
    process.env.NETLIFY_DATABASE_URL = 'postgres://test.invalid/database';
    const createSql = () => async (strings) => {
      const query = strings.join(' ');
      if (query.includes('SELECT cart_contents, checkout_state')) {
        return [{
          cart_contents: [{
            id: 'line-1', product_type: 'banner', width_in: 72, height_in: 36,
            quantity: 1, material: '13oz', grommets: 'none', pole_pockets: 'none',
            line_total_cents: 8_100,
          }],
          checkout_state: null,
          recovery_status: 'abandoned',
          user_id: null,
          email: 'buyer@example.com',
          normalized_email: 'buyer@example.com',
        }];
      }
      if (query.includes('SELECT delivery_discount.code')) return [];
      if (query.includes('SELECT id') && query.includes("recovery_status IN ('active', 'abandoned')")) return [];
      return [{ id: 'event' }];
    };
    const handler = createRecoverAbandonedCartHandler({
      createSql,
      now: () => NOW,
      selectWinningDiscount: async () => null,
    });
    const token = createAbandonedCartRecoveryToken({
      cartId: CART_ID, sequenceNumber: 1, expiresInSeconds: 3600, now: NOW, secret: SECRET,
    });
    const response = await handler({
      httpMethod: 'POST',
      headers: { origin: 'https://banners.example', host: 'banners.example', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ token }),
    });
    expect(response.statusCode).toBe(410);
    expect(JSON.parse(response.body)).toEqual({ error: 'RECOVERY_CART_CLOSED' });
  });
});
