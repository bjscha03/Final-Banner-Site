import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sendModule = require('../_shared/legacy/send-abandoned-cart-email.cjs');
const emailTemplate = require('../_shared/legacy/abandoned-cart-email-template.cjs');
const detector = require('../_shared/legacy/detect-abandoned-carts.cjs');
const deleteModule = require('../_shared/legacy/delete-abandoned-cart.cjs');
const discountModule = require('../_shared/legacy/generate-discount.cjs');
const suppressionModule = require('../_shared/email-suppression.cjs');
const tokenModule = require('../_shared/cart-recovery-token.cjs');
const strictRecoveryToken = require('../_shared/abandoned-cart-recovery-token.cjs');
const unsubscribeModule = require('../_shared/recovery-email-unsubscribe.cjs');
const paidRecovery = require('../_shared/abandoned-cart-order-recovery.cjs');
const stripeCheckout = require('../_shared/stripe-checkout-service.cjs');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

const cartId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  ABANDONED_CART_RECOVERY_SECRET: process.env.ABANDONED_CART_RECOVERY_SECRET,
  RECOVERY_EMAIL_TOKEN_SECRET: process.env.RECOVERY_EMAIL_TOKEN_SECRET,
  NETLIFY_DATABASE_URL: process.env.NETLIFY_DATABASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RECOVERY_SITE_URL: process.env.RECOVERY_SITE_URL,
  DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
  CONTEXT: process.env.CONTEXT,
  URL: process.env.URL,
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  SITE_URL: process.env.SITE_URL,
  RECOVERY_EMAILS_ENABLED: process.env.RECOVERY_EMAILS_ENABLED,
};

function queryText(first) {
  return Array.isArray(first) ? first.join('?') : String(first || '');
}

test.before(() => {
  process.env.AUTH_SESSION_SECRET = 'test-admin-session-secret';
  process.env.ABANDONED_CART_RECOVERY_SECRET = 'test-cart-recovery-secret';
  process.env.RECOVERY_EMAIL_TOKEN_SECRET = 'test-unsubscribe-secret';
  process.env.NETLIFY_DATABASE_URL = 'postgres://recovery-test.invalid/db';
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RECOVERY_EMAILS_ENABLED = 'true';
});

test.after(() => {
  sendModule._test.resetDependencies();
  detector._test.resetDependencies();
  unsubscribeModule._test.resetDependencies();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function deliveryFixture({ providerError = null, cartItems = null, cartOverrides = {} } = {}) {
  const state = {
    claim: false,
    sent: 0,
    failed: false,
    sends: 0,
    payload: null,
    options: null,
    queries: [],
    issuedCode: null,
    completionQuery: null,
    completionValues: [],
    deliveryMetadata: {},
    offerExpiresAt: null,
    failureQuery: null,
    failureValues: [],
  };
  const cart = {
    id: cartId,
    user_id: null,
    session_id: 'guest-session',
    email: ' Buyer@Example.com ',
    normalized_email: 'buyer@example.com',
    cart_contents: cartItems || [{ id: 'small-banner', product_type: 'banner', width_in: 48, height_in: 24, quantity: 2, material: '13oz', line_total_cents: 5000 }],
    total_value: '50.00',
    subtotal_cents: 5000,
    discount_cents: 0,
    tax_cents: 0,
    estimated_total_cents: 5000,
    discount_code: null,
    recovery_status: 'abandoned',
    recovery_emails_sent: 0,
    created_at: '2026-09-01T00:00:00.000Z',
    last_activity_at: '2026-09-01T00:30:00.000Z',
    has_artwork: false,
    customer_first_name: 'Buyer',
    customer_last_name: 'Example',
    ...cartOverrides,
  };
  const sql = async (first, ...values) => {
    const query = queryText(first);
    state.queries.push({ query, values });
    if (/SELECT id, user_id, session_id, email, normalized_email, cart_contents/i.test(query)) {
      return [{ ...cart, recovery_emails_sent: state.sent }];
    }
    if (/SELECT id[\s\S]+FROM orders/i.test(query)) return [];
    if (/\beligible AS\s*\(/i.test(query)) {
      if (state.claim || state.sent > 0) return [];
      state.claim = true;
      return [{
        ...cart,
        recovery_status: 'abandoned',
        recovery_email_claim_sequence: 1,
        recovery_delivery_metadata: state.deliveryMetadata,
      }];
    }
    if (/SELECT cart\.id[\s\S]+recovery_email_claim_sequence[\s\S]+ORDER BY candidate\.last_activity_at DESC/i.test(query)) {
      return [{ id: cartId }];
    }
    if (/AS stop_reason[\s\S]+recovery_email_claim_sequence/i.test(query)) return [{ stop_reason: null }];
    if (/WITH superseded_offers AS[\s\S]+inserted_offer AS/i.test(query)) {
      const code = values.find((value) => typeof value === 'string' && value.startsWith('RECOVER25-'));
      const expiresAt = values.find((value) => (
        typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
      ));
      state.issuedCode = code;
      state.offerExpiresAt = expiresAt;
      return [{
        code,
        expires_at: expiresAt,
        activated_at: null,
      }];
    }
    if (/UPDATE cart_recovery_deliveries[\s\S]+payloadDigest/i.test(query)) {
      const metadataValue = values.find((value) => (
        typeof value === 'string' && value.includes('"payloadDigest"')
      ));
      state.deliveryMetadata = JSON.parse(metadataValue);
      return [{ abandoned_cart_id: cartId }];
    }
    if (/WITH eligible_delivery AS MATERIALIZED[\s\S]+activated_offer AS[\s\S]+delivered AS/i.test(query)) {
      assert.equal(state.claim, true);
      state.completionQuery = query;
      state.completionValues = values;
      state.sent = 1;
      state.claim = false;
      return [{
        id: cartId,
        offer_expires_at: state.issuedCode ? state.offerExpiresAt : null,
        offer_activated_at: state.issuedCode ? new Date().toISOString() : null,
      }];
    }
    if (/WITH failed AS/i.test(query)) {
      state.failed = true;
      state.failureQuery = query;
      state.failureValues = values;
      state.claim = false;
      return [];
    }
    return [];
  };
  const resend = {
    emails: {
      send: async (payload, options) => {
        state.sends += 1;
        state.payload = payload;
        state.options = options;
        if (providerError) {
          return {
            data: null,
            error: typeof providerError === 'string'
              ? { message: providerError, statusCode: 503 }
              : providerError,
          };
        }
        return { data: { id: 'recovery-message-1' }, error: null };
      },
    },
  };
  return { state, sql, resend };
}

test('concurrent sequence claims produce one Resend call and one durable completion', async () => {
  const fixture = deliveryFixture();
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  const results = await Promise.all([
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
  ]);

  assert.equal(fixture.state.sends, 1);
  assert.equal(fixture.state.sent, 1);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.skipped).length, 1);
  assert.equal(fixture.state.options.idempotencyKey, `abandoned-cart/${cartId}/sequence/1`);
  assert.ok(fixture.state.options.signal instanceof AbortSignal);
  assert.equal(fixture.state.options.signal.aborted, false);
  assert.equal(fixture.state.payload.to, 'buyer@example.com');
  assert.match(fixture.state.payload.html, /\/checkout#recovery=/);
  assert.doesNotMatch(fixture.state.payload.html, /[?&]recovery=/);
  assert.doesNotMatch(fixture.state.payload.html, /recover_cart|[?&]cart=/);
  assert.doesNotMatch(fixture.state.payload.html, /25% OFF THIS ORDER|RECOVER25-/);
  assert.match(fixture.state.payload.headers['List-Unsubscribe'], /recovery-email-unsubscribe\?token=/);
  assert.match(fixture.state.completionQuery, /WITH eligible_delivery AS MATERIALIZED[\s\S]+activated_offer AS[\s\S]+delivered AS/);
  assert.match(fixture.state.completionQuery, /cart\.recovery_email_claim_sequence = \?/);
  const reservationQuery = fixture.state.queries.find(({ query }) => (
    /UPDATE cart_recovery_deliveries[\s\S]+payloadDigest/i.test(query)
  ))?.query || '';
  assert.match(reservationQuery, /recovery_email_suppressions/);
  assert.match(reservationQuery, /order_row\.status[\s\S]+pending[\s\S]+INTERVAL '30 minutes'/);
  assert.match(reservationQuery, /newer\.last_activity_at[\s\S]+cart\.last_activity_at/);
  assert.equal(fixture.state.queries.some(({ query }) => /inserted_offer AS/.test(query)), false);
  assert.equal(results.find((result) => result.success).discountCode, null);

  const recoveryHref = fixture.state.payload.html.match(/href="(https:\/\/bannersonthefly\.com\/checkout#recovery=[^"]+)/)?.[1];
  assert.ok(recoveryHref);
  const recoveryToken = new URLSearchParams(new URL(recoveryHref).hash.slice(1)).get('recovery');
  assert.deepEqual(strictRecoveryToken.verifyAbandonedCartRecoveryToken(recoveryToken), {
    cartId,
    sequenceNumber: 1,
    expiresAt: strictRecoveryToken.verifyAbandonedCartRecoveryToken(recoveryToken).expiresAt,
  });
});

test('deploy previews keep recovery links on the isolated deploy origin', () => {
  delete process.env.RECOVERY_SITE_URL;
  process.env.CONTEXT = 'deploy-preview';
  process.env.DEPLOY_PRIME_URL = 'https://deploy-preview-412--final-banner-site.netlify.app';
  process.env.URL = 'https://bannersonthefly.com';
  assert.equal(
    sendModule._test.canonicalSiteUrl(),
    'https://deploy-preview-412--final-banner-site.netlify.app',
  );
  assert.notEqual(sendModule._test.canonicalSiteUrl(), 'https://bannersonthefly.com');

  process.env.DEPLOY_PRIME_URL = 'https://attacker.example/checkout';
  assert.equal(sendModule._test.canonicalSiteUrl(), 'https://bannersonthefly.com');
});

test('RECOVERY_EMAILS_ENABLED=false is an emergency delivery-only kill switch', async () => {
  process.env.RECOVERY_EMAILS_ENABLED = 'false';
  let databaseCalls = 0;
  let providerCalls = 0;
  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql: async () => { databaseCalls += 1; return []; },
      resend: { emails: { send: async () => { providerCalls += 1; } } },
      cartId,
      sequenceNumber: 1,
      source: 'targeted',
    });
    assert.deepEqual(result, {
      success: false,
      skipped: true,
      reason: 'recovery_emails_disabled',
    });
    assert.equal(databaseCalls, 0);
    assert.equal(providerCalls, 0);
  } finally {
    delete process.env.RECOVERY_EMAILS_ENABLED;
  }
  assert.equal(sendModule._test.recoveryEmailsEnabled(), true);
});

test('Resend {data,error} failures release the claim for a prompt five-minute retry', async () => {
  const fixture = deliveryFixture({ providerError: 'temporary provider outage' });
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  await assert.rejects(
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
    /temporary provider outage/,
  );
  assert.equal(fixture.state.sends, 1);
  assert.equal(fixture.state.sent, 0);
  assert.equal(fixture.state.failed, true);
  assert.equal(fixture.state.claim, false);
});

test('Resend error names distinguish terminal idempotency/configuration failures from retryable contention', async () => {
  assert.deepEqual(sendModule._test.classifyProviderError({ providerName: 'invalid_idempotent_request' }), {
    name: 'invalid_idempotent_request', statusCode: 409, retryable: false,
  });
  assert.deepEqual(sendModule._test.classifyProviderError({ providerName: 'concurrent_idempotent_requests' }), {
    name: 'concurrent_idempotent_requests', statusCode: 409, retryable: true,
  });
  assert.equal(sendModule._test.classifyProviderError({ providerName: 'invalid_from_address' }).retryable, false);
  assert.equal(sendModule._test.classifyProviderError({ providerName: 'rate_limit_exceeded' }).retryable, true);

  const fixture = deliveryFixture({
    providerError: { name: 'invalid_from_address', message: 'sender domain is not verified' },
  });
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));
  await assert.rejects(
    sendModule.deliverRecoveryEmail({ sql: fixture.sql, resend: fixture.resend, cartId, sequenceNumber: 1 }),
    /sender domain is not verified/,
  );
  assert.equal(fixture.state.failureValues.includes(true), true);
  assert.match(fixture.state.failureQuery, /THEN 'skipped'[\s\S]+ELSE 'failed'/);
});

test('a qualifying 72x36 first email includes the scoped RECOVER25 offer, actual preview, brand, and one-hour activation', async () => {
  const fixture = deliveryFixture({
    cartItems: [{
      id: 'qualifying-banner-line',
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      orientation: 'landscape',
      quantity: 1,
      material: '13oz',
      grommets: 'every-2-3ft',
      pole_pockets: 'none',
      rope_feet: 0,
      line_total_cents: 10_000,
      thumbnail_url: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1/customer-preview.png',
    }],
    cartOverrides: {
      total_value: '100.00',
      subtotal_cents: 10_000,
      estimated_total_cents: 10_000,
      has_artwork: true,
    },
  });
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  const result = await sendModule.deliverRecoveryEmail({
    sql: fixture.sql,
    resend: fixture.resend,
    cartId,
    sequenceNumber: 1,
  });

  assert.equal(result.success, true);
  assert.match(result.discountCode, /^RECOVER25-[A-F0-9]{24}$/);
  assert.equal(result.discountCode, fixture.state.issuedCode);
  assert.equal(fixture.state.payload.subject, 'Your banner is saved — 25% off for the next hour');
  assert.match(fixture.state.payload.html, /25% OFF THIS ORDER/);
  assert.match(fixture.state.payload.html, new RegExp(result.discountCode));
  assert.match(fixture.state.payload.html, /You left this behind/);
  assert.match(fixture.state.payload.html, /customer-preview\.png/);
  assert.match(fixture.state.payload.html, /logo-compact\.svg/);
  assert.match(fixture.state.payload.html, /\/checkout#recovery=/);
  assert.match(fixture.state.payload.text, /PRIVATE ONE-HOUR RECOVERY OFFER/);
  assert.match(fixture.state.payload.text, /25% OFF THIS ORDER/);
  assert.match(fixture.state.payload.text, new RegExp(`Code: ${result.discountCode}`));
  assert.match(fixture.state.payload.text, /You left this behind/);
  assert.match(fixture.state.payload.text, /FINISH MY ORDER/);
  const issuance = fixture.state.queries.find(({ query }) => /inserted_offer AS/.test(query));
  assert.ok(issuance);
  assert.match(issuance.query, /discount_percentage[\s\S]+discount_scope[\s\S]+eligible_cart_item_ids/);
  assert.equal(issuance.values.includes(25), true);
  assert.equal(issuance.values.includes('abandoned_cart_large_banner_25'), true);
  assert.equal(issuance.values.includes('recovery_qualifying_banner_lines'), true);
  assert.equal(issuance.values.includes('["qualifying-banner-line"]'), true);
  assert.equal(issuance.values.includes(2025), true);
  assert.match(fixture.state.completionQuery, /WITH eligible_delivery AS MATERIALIZED[\s\S]+activated_offer AS[\s\S]+delivered AS/);
  assert.match(fixture.state.completionQuery, /activated_at = COALESCE\(activated_at, NOW\(\)\)/);
  assert.doesNotMatch(fixture.state.completionQuery, /SET\s+expires_at\s*=/);
  assert.match(fixture.state.completionQuery, /issued_at = COALESCE\(issued_at, NOW\(\)\)/);
  assert.equal(fixture.state.completionValues.includes(1), true);
  assert.equal(fixture.state.completionValues.includes(result.discountCode), true);
  assert.equal(fixture.state.completionValues.includes(cartId), true);
  assert.equal(fixture.state.completionValues.includes('abandoned_cart_large_banner_25'), true);
  assert.equal(fixture.state.queries.some(({ query }) => /'coupon_issued'/.test(query)), true);
  assert.equal(fixture.state.deliveryMetadata.offerExpiresAt, fixture.state.offerExpiresAt);
  assert.equal(fixture.state.deliveryMetadata.offerCode, result.discountCode);
  assert.equal(fixture.state.deliveryMetadata.offerMaxDiscountAmountCents, 2025);
  assert.equal(fixture.state.completionValues.includes(fixture.state.offerExpiresAt), true);
  assert.match(
    fixture.state.payload.html,
    new RegExp(`Expires ${emailTemplate.formatExpiry(fixture.state.offerExpiresAt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
});

test('offer activation is a hard gate for recording provider-accepted delivery', async () => {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const offer = {
    code: 'RECOVER25-AAAAAAAAAAAAAAAAAAAAAAAA',
    expiresAt,
    eligibleCartItemIds: ['line-1'],
    maxDiscountAmountCents: 2025,
  };
  let completionQuery = '';
  await assert.rejects(
    sendModule._test.completeClaim(
      async (first) => {
        completionQuery = queryText(first);
        return [];
      },
      cartId,
      1,
      'provider-message',
      offer,
      'subject',
    ),
    /database claim could not be completed/,
  );
  assert.match(completionQuery, /expires_at = \?::timestamptz/);
  assert.match(completionQuery, /OR EXISTS \(SELECT 1 FROM activated_offer WHERE code = \?\)/);
  assert.match(completionQuery, /eligible_cart_item_ids = \?::jsonb/);
});

test('an unactivated offer retry reuses its exact deadline and never refreshes expiry', async () => {
  const authoritativeItems = [{
    id: 'line-1', product_type: 'banner', width_in: 72, height_in: 36,
    quantity: 1, material: '13oz', grommets: 'none', line_total_cents: 8100,
  }];
  const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
  const cart = {
    id: cartId,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    discount_code: 'RECOVER25-BBBBBBBBBBBBBBBBBBBBBBBB',
  };
  const queries = [];
  const offer = await sendModule._test.getOrCreateDiscountCode(async (first) => {
    const query = queryText(first);
    queries.push(query);
    if (/SELECT code, expires_at, activated_at/i.test(query)) {
      return [{
        code: cart.discount_code,
        expires_at: expiresAt,
        activated_at: null,
      }];
    }
    return [];
  }, cart, 1, authoritativeItems);

  assert.equal(offer.expiresAt, expiresAt);
  assert.equal(queries.some((query) => /UPDATE discount_codes[\s\S]+SET expires_at/i.test(query)), false);
});

test('trusted saved promo can beat the raw recovery savings without stacking', () => {
  const items = [{
    id: 'line-1', product_type: 'banner', width_in: 72, height_in: 36,
    quantity: 1, material: '13oz', grommets: 'none', line_total_cents: 8100,
  }];
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pricing = sendModule._test.recoveryOfferPricing({ id: cartId }, items, {
    code: 'RECOVER25-CCCCCCCCCCCCCCCCCCCCCCCC',
    expiresAt,
    eligibleCartItemIds: ['line-1'],
    maxDiscountAmountCents: 2025,
  }, {
    existingPromo: { code: 'VIP50', discountPercentage: 50 },
    now: new Date('2026-09-01T15:00:00.000Z'),
  });

  assert.equal(pricing.offerSavingsCents, 2025);
  assert.equal(pricing.existingDiscountCents, 4050);
  assert.equal(pricing.offerDiscountCents, 4050);
  assert.equal(pricing.offerTotalCents, 4293);
  assert.equal(pricing.existingDiscountLabel, 'VIP50 discount');
});

test('historical carts with nullable aggregate totals fall back to saved line-item pricing', async () => {
  const fixture = deliveryFixture({
    cartOverrides: {
      total_value: null,
      subtotal_cents: null,
      discount_cents: null,
      tax_cents: null,
      estimated_total_cents: null,
    },
  });
  sendModule._test.setEnsureSchema(async () => {});
  sendModule._test.setSuppressionLookup(async () => ({ suppressed: false }));

  try {
    const result = await sendModule.deliverRecoveryEmail({
      sql: fixture.sql,
      resend: fixture.resend,
      cartId,
      sequenceNumber: 1,
    });

    assert.equal(result.success, true);
    assert.match(fixture.state.payload.html, /Subtotal[\s\S]*\$72\.00/);
    assert.match(fixture.state.payload.html, /Total[\s\S]*\$72\.50/);
    assert.doesNotMatch(fixture.state.payload.html, /Total[\s\S]*\$0\.00/);
  } finally {
    sendModule._test.resetDependencies();
  }
});

test('a smaller first-email cart receives the premium reminder without any recovery coupon', () => {
  const data = {
    cartItems: [{
      id: 'small-banner-line',
      product_type: 'banner',
      width_in: 48,
      height_in: 24,
      quantity: 2,
      material: '<script>vinyl</script>',
      line_total_cents: 5000,
    }],
    totalValue: 50,
    discountCode: 'RECOVER25-MUST-NOT-RENDER',
    discountExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    recoveryUrl: 'https://bannersonthefly.com/checkout#recovery=signed-token',
    unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/recovery-email-unsubscribe?token=signed-token',
  };
  const first = sendModule.generateEmailHTML(1, data);

  assert.equal(first.subject, 'Your banner design is saved');
  assert.match(first.html, /Your design is saved/);
  assert.match(first.html, /Fast production/);
  assert.match(first.html, /Free Next-Day Air where eligible/);
  assert.match(first.html, /Finish My Order/);
  assert.match(first.html, /checkout#recovery=signed-token/);
  assert.doesNotMatch(first.html, /25% OFF|RECOVER25-MUST-NOT-RENDER/);
  assert.doesNotMatch(first.text, /25% OFF|RECOVER25-MUST-NOT-RENDER/);
  assert.doesNotMatch(first.html, /<script>/);
  assert.match(first.html, /&lt;Script&gt;Vinyl&lt;\/Script&gt;/);
  assert.match(first.html, /Unsubscribe from cart-recovery emails/);
});

test('email two and three neither issue nor advertise a replacement offer', async () => {
  const qualifyingCart = {
    id: cartId,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    cart_contents: [{
      id: 'qualifying-banner-line',
      product_type: 'banner',
      width_in: 72,
      height_in: 36,
      quantity: 1,
      material: '13oz vinyl',
      line_total_cents: 10_000,
    }],
  };
  let sqlCalls = 0;
  const mustNotIssue = async () => {
    sqlCalls += 1;
    throw new Error('follow-up email attempted to create an offer');
  };

  assert.equal(await sendModule._test.getOrCreateDiscountCode(mustNotIssue, qualifyingCart, 2), null);
  assert.equal(await sendModule._test.getOrCreateDiscountCode(mustNotIssue, qualifyingCart, 3), null);
  assert.equal(sqlCalls, 0);

  const data = {
    cartItems: qualifyingCart.cart_contents,
    totalValue: 100,
    discountCode: 'RECOVER25-EXPIRED-FIRST-EMAIL',
    discountExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    recoveryUrl: 'https://bannersonthefly.com/checkout#recovery=signed-token',
    unsubscribeUrl: 'https://bannersonthefly.com/.netlify/functions/recovery-email-unsubscribe?token=signed-token',
  };
  const second = sendModule.generateEmailHTML(2, data);
  const third = sendModule.generateEmailHTML(3, data);
  assert.equal(second.subject, 'Your saved banner is ready when you are');
  assert.equal(third.subject, 'Still need this banner? Your design is saved');
  for (const email of [second, third]) {
    assert.doesNotMatch(email.html, /25% OFF|RECOVER25-EXPIRED-FIRST-EMAIL|10% off|15% off/);
    assert.doesNotMatch(email.text, /25% OFF|RECOVER25-EXPIRED-FIRST-EMAIL|10% off|15% off/);
    assert.match(email.html, /checkout#recovery=signed-token/);
    assert.match(email.html, /Unsubscribe from cart-recovery emails/);
  }
});

test('recovery suppressions win and cold-outreach prior_customer does not suppress', async () => {
  const queryResults = [
    [{ reason: 'unsubscribed' }],
  ];
  const suppressed = await suppressionModule.findEmailSuppression(async () => queryResults.shift() || [], 'buyer@example.com');
  assert.deepEqual(suppressed, {
    suppressed: true,
    reason: 'unsubscribed',
    source: 'recovery_email_suppressions',
  });

  const priorCustomerSql = async (first) => {
    const query = queryText(first);
    if (/FROM outbound_suppressions/i.test(query)) return [{ reason: 'prior_customer' }];
    return [];
  };
  assert.deepEqual(
    await suppressionModule.findEmailSuppression(priorCustomerSql, 'buyer@example.com'),
    { suppressed: false, reason: null, source: null },
  );

  const bounceSql = async (first) => {
    const query = queryText(first);
    if (/FROM outbound_suppressions/i.test(query)) return [{ reason: 'hard_bounce' }];
    return [];
  };
  assert.deepEqual(await suppressionModule.findEmailSuppression(bounceSql, 'buyer@example.com'), {
    suppressed: true,
    reason: 'hard_bounce',
    source: 'outbound_suppressions',
  });

  const outboundReasons = [
    'unsubscribe', 'unsubscribed', 'complaint', 'spam_complaint', 'hard_bounce', 'legal',
    'blocklist', 'manual', 'wrong_contact', 'duplicate', 'provider_suppressed',
    'consent_false', 'consent_withdrawn',
  ];
  let outboundQuery = '';
  for (const reason of outboundReasons) {
    const result = await suppressionModule.findEmailSuppression(async (first) => {
      const query = queryText(first);
      if (/FROM recovery_email_suppressions/i.test(query)) return [];
      if (/FROM outbound_suppressions/i.test(query)) {
        outboundQuery = query;
        return [{ reason }];
      }
      return [];
    }, 'buyer@example.com');
    assert.deepEqual(result, { suppressed: true, reason, source: 'outbound_suppressions' });
  }
  for (const reason of outboundReasons) assert.match(outboundQuery, new RegExp(`'${reason}'`));
});

test('unsubscribe tokens hide the email and both footer and one-click POST persist suppression', async () => {
  const token = tokenModule.createRecoveryUnsubscribeToken('Buyer@Example.com', {
    secret: 'unsubscribe-test-secret',
    nowSeconds: 1_000,
  });
  assert.equal(token.includes('buyer'), false);
  assert.deepEqual(
    tokenModule.verifyRecoveryUnsubscribeToken(token, { secret: 'unsubscribe-test-secret', nowSeconds: 1_001 }).email,
    'buyer@example.com',
  );
  assert.equal(
    tokenModule.verifyRecoveryUnsubscribeToken(`${token}x`, { secret: 'unsubscribe-test-secret', nowSeconds: 1_001 }),
    null,
  );

  process.env.RECOVERY_EMAIL_TOKEN_SECRET = 'unsubscribe-test-secret';
  const liveToken = tokenModule.createRecoveryUnsubscribeToken('Buyer@Example.com', {
    secret: 'unsubscribe-test-secret',
  });
  const queries = [];
  unsubscribeModule._test.setEnsureSchema(async () => {});
  unsubscribeModule._test.setNeonFactory(() => async (first, ...values) => {
    queries.push({ query: queryText(first), values });
    return [{ normalized_email: 'buyer@example.com' }];
  });
  const response = await unsubscribeModule.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    queryStringParameters: { token: liveToken },
    body: 'List-Unsubscribe=One-Click',
  });
  assert.equal(response.statusCode, 200);
  assert.match(queries[0].query, /INSERT INTO recovery_email_suppressions/i);
  assert.match(queries[0].query, /UPDATE abandoned_carts/i);
  assert.equal(queries[0].values.includes('buyer@example.com'), true);
  assert.equal(response.body.includes('buyer@example.com'), false);
});

test('manual recovery mutations require a verified admin session', async () => {
  const event = { httpMethod: 'POST', headers: {}, body: JSON.stringify({ cartId, sequenceNumber: 1 }) };
  assert.equal((await sendModule.handler(event)).statusCode, 401);
  assert.equal((await discountModule.handler({ ...event, body: JSON.stringify({ cartId }) })).statusCode, 401);
  assert.equal((await deleteModule.handler({ ...event, httpMethod: 'DELETE', body: JSON.stringify({ cartId }) })).statusCode, 401);
});

test('the scheduler sends immediately, anchors follow-ups to sent deliveries, and records no-email abandonment', async () => {
  const queries = [];
  const sql = async (first) => {
    queries.push(queryText(first));
    return [];
  };
  await detector._test.abandonInactiveCarts(sql);
  await detector._test.dueCandidates(sql, 1);
  await detector._test.dueCandidates(sql, 2);
  await detector._test.dueCandidates(sql, 3);
  assert.match(queries[0], /abandonment_signaled_at IS NOT NULL/);
  assert.match(queries[0], /first_recovery_due_at <= NOW\(\)/);
  assert.match(queries[0], /abandonment_signaled_at IS NOT NULL[\s\S]+OR first_recovery_due_at IS NOT NULL/);
  assert.doesNotMatch(queries[0], /AND\s+NULLIF\(BTRIM\(email\)/);
  assert.match(queries[1], /recovery_emails_sent = 0/);
  assert.match(queries[1], /cart\.abandonment_signaled_at IS NOT NULL[\s\S]+OR cart\.first_recovery_due_at IS NOT NULL/);
  assert.match(queries[1], /COALESCE\([\s\S]*?first_recovery_due_at[\s\S]*?abandonment_signaled_at[\s\S]*?\) <= NOW\(\)/);
  assert.doesNotMatch(queries[1], /cart\.abandoned_at,[\s\S]*?cart\.last_activity_at \+/);
  assert.match(queries[2], /recovery_emails_sent = 1/);
  assert.match(queries[2], /prior_delivery\.sequence_number = 1/);
  assert.match(queries[2], /prior_delivery\.sent_at <= NOW\(\) - INTERVAL '23 hours'/);
  assert.match(queries[3], /recovery_emails_sent = 2/);
  assert.match(queries[3], /prior_delivery\.sequence_number = 2/);
  assert.match(queries[3], /prior_delivery\.sent_at <= NOW\(\) - INTERVAL '48 hours'/);
  assert.doesNotMatch(queries[2], /email_clicked/);
  assert.doesNotMatch(queries[3], /email_clicked/);
  assert.deepEqual(detector._test.deliverySummary([
    { success: true }, { skipped: true }, { failed: true }, null,
  ]), { sent: 1, skipped: 1, failed: 2 });
});

test('paid-order recovery prefers the exact validated cart and never runs for test orders', async () => {
  const calls = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    calls.push({ query, values });
    if (/UPDATE abandoned_carts/i.test(query)) return [{ id: cartId }];
    return [];
  };
  const order = {
    id: orderId,
    abandoned_cart_id: cartId,
    user_id: userId,
    email: 'buyer@example.com',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  };
  const recovered = await paidRecovery.markAbandonedCartRecovered(sql, order);
  assert.deepEqual(recovered, [{ id: cartId }]);
  assert.match(calls[0].query, /cart\.id = .*::uuid/);
  assert.match(calls[0].query, /cart\.created_at <=/);
  assert.match(calls[0].query, /ORDER BY cart\.last_activity_at DESC/);
  assert.match(calls[0].query, /LIMIT 1/);
  assert.match(calls[0].query, /SET abandoned_cart_id = COALESCE/);
  assert.match(calls[0].query, /'cart_recovered'/);
  assert.equal(calls[0].values.includes(cartId), true);
  assert.equal(calls[0].values.includes(userId), true);

  calls.length = 0;
  assert.deepEqual(await paidRecovery.markAbandonedCartRecovered(sql, { ...order, is_test_order: true }), []);
  assert.equal(calls.length, 0);
});

test('paid-order recovery trusts an exact server-validated cart link when customer identity changed', async () => {
  const calls = [];
  const sql = async (first, ...values) => {
    const query = queryText(first);
    calls.push({ query, values });
    if (/UPDATE abandoned_carts/i.test(query)) return [{ id: cartId }];
    return [];
  };

  const recovered = await paidRecovery.markAbandonedCartRecovered(sql, {
    id: orderId,
    abandoned_cart_id: cartId,
    user_id: null,
    email: 'changed-at-checkout@example.net',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  });

  assert.deepEqual(recovered, [{ id: cartId }]);
  assert.equal(calls[0].values.includes(cartId), true);
  assert.match(calls[0].query, /cart\.id = .*::uuid/);
  assert.match(calls[0].query, /::uuid IS NULL[\s\S]+cart\.user_id/);
});

test('a persisted cart session is exclusive and never falls through to another user or email cart', async () => {
  let query = '';
  let values = [];
  const recovered = await paidRecovery.markAbandonedCartRecovered(async (first, ...boundValues) => {
    query = queryText(first);
    values = boundValues;
    return [];
  }, {
    id: orderId,
    abandoned_cart_id: null,
    abandoned_cart_session_id: 'intended_checkout_session',
    user_id: userId,
    email: 'buyer@example.com',
    is_test_order: false,
    created_at: '2026-09-01T12:00:00.000Z',
  });

  assert.deepEqual(recovered, []);
  assert.equal(values.includes('intended_checkout_session'), true);
  assert.match(query, /\?::text IS NOT NULL[\s\S]+cart\.session_id = \?::text/);
  assert.match(query, /last_activity_at >= \?::timestamptz - INTERVAL '30 minutes'/);
  assert.match(query, /last_activity_at <= \?::timestamptz \+ INTERVAL '10 minutes'/);
  assert.match(query, /\?::text IS NULL[\s\S]+cart\.user_id[\s\S]+LOWER\(BTRIM\(cart\.email\)\)/);
});

test('Stripe and every PayPal settlement projection retain the authoritative cart session hint', async () => {
  const stripeQueries = [];
  const sql = async (first) => {
    stripeQueries.push(queryText(first));
    return [{
      id: orderId,
      checkout_idempotency_key: 'checkout-key',
      abandoned_cart_session_id: 'intended_checkout_session',
    }];
  };
  await stripeCheckout.loadStripeOrder(sql, { paymentIntentId: 'pi_test' });
  await stripeCheckout.loadStripeOrder(sql, { orderId });
  await stripeCheckout.loadStripeOrder(sql, { checkoutKey: 'checkout-key' });
  assert.equal(stripeQueries.length, 3);
  assert.equal(stripeQueries.every((query) => /abandoned_cart_session_id/.test(query)), true);

  const paypalSource = fs.readFileSync(
    path.resolve(testDirectory, '../_shared/legacy/paypal-capture-final.cjs'),
    'utf8',
  );
  assert.equal(
    (paypalSource.match(/to_jsonb\(orders\)->>'abandoned_cart_session_id' AS abandoned_cart_session_id/g) || []).length,
    3,
  );
  assert.match(paypalSource, /RETURNING id,[\s\S]+abandoned_cart_session_id[\s\S]+if \(!persisted\)/);
  assert.match(paypalSource, /if \(!persisted\)[\s\S]+SELECT id,[\s\S]+abandoned_cart_session_id/);
});

test('completed-order checks keep exact attribution while stopping older same-identity carts', async () => {
  let query = '';
  const result = await sendModule._test.findCompletedOrder(async (first) => {
    query = queryText(first);
    return [{ id: orderId, recovery_target: false }];
  }, {
    id: cartId,
    user_id: userId,
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
    created_at: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(result.recovery_target, false);
  assert.match(query, /abandoned_cart_id/);
  assert.match(query, /status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'\)/);
  assert.match(query, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
  assert.match(query, /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/);
  assert.match(query, /abandoned_cart_id' = \?::text\s+OR \(\s*NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL/s);
  assert.match(query, /NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL[\s\S]*order_row\.user_id[\s\S]*LOWER\(BTRIM\(order_row\.email\)\)/);
  assert.match(query, /abandoned_cart_id', ''\) IS NOT NULL[\s\S]*linked_cart\.user_id[\s\S]*linked_cart\.session_id/);
  assert.match(query, /order_row\.created_at <= candidate\.last_activity_at \+ INTERVAL '96 hours'/);
  assert.ok(
    (query.match(/order_row\.created_at <= \?[\s\S]{0,80}INTERVAL '96 hours'/g) || []).length >= 3,
    'identity and explicit-other-cart inference must remain bounded',
  );
  assert.match(query, /ORDER BY candidate\.last_activity_at DESC/);
  assert.match(query, /LIMIT 1/);

  let settlementQuery = '';
  await detector._test.settleCompletedCarts(async (first) => {
    settlementQuery = queryText(first);
    return [];
  });
  assert.match(settlementQuery, /WITH cart_batch AS/);
  assert.match(settlementQuery, /FOR UPDATE SKIP LOCKED/);
  assert.match(settlementQuery, /status IN \('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded'\)/);
  assert.match(settlementQuery, /status, ''\)\)\) = 'pending'[\s\S]*paypal_capture_id/);
  assert.match(settlementQuery, /payment_method'[\s\S]*= 'paypal'[\s\S]*payment_reconciliation_status'[\s\S]*= 'complete'/);
  assert.match(settlementQuery, /abandoned_cart_id' = cart\.id::text\s+OR \(\s+NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL/s);
  assert.match(settlementQuery, /NULLIF\(to_jsonb\(order_row\)->>'abandoned_cart_id', ''\) IS NULL[\s\S]*order_row\.user_id[\s\S]*LOWER\(BTRIM\(order_row\.email\)\)/);
  assert.match(settlementQuery, /cart_id = recovery_target_id AS recovery_target/);
  assert.match(settlementQuery, /WHEN targets\.recovery_target AND targets\.order_status <> 'refunded' THEN 'recovered'/);
  assert.match(settlementQuery, /WHERE settled\.recovery_target/);
  assert.match(settlementQuery, /SET abandoned_cart_id = COALESCE/);
  assert.match(settlementQuery, /'cart_recovered'/);
  assert.match(settlementQuery, /batch_order\.created_at <= batch_cart\.last_activity_at \+ INTERVAL '96 hours'/);
  assert.ok(
    (settlementQuery.match(/order_row\.created_at <= cart\.last_activity_at \+ INTERVAL '96 hours'/g) || []).length >= 3,
    'scheduled identity and explicit-other-cart inference must remain bounded',
  );
});

test('a refunded completed order stops delivery without recording positive recovery', async () => {
  let query = '';
  let values = [];
  await sendModule._test.markRecovered(async (first, ...boundValues) => {
    query = queryText(first);
    values = boundValues;
    return [];
  }, cartId, orderId, 2, true, 'refunded');

  assert.equal(values.includes('expired'), true);
  assert.equal(values.includes('completed_order_refunded'), true);
  assert.equal(values.includes(false), true);
  assert.match(query, /recovery_status = \?/);
  assert.match(query, /WHERE \?\s+AND NOT EXISTS/);
});
