import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import offer from '../_shared/blog-reader-offer.cjs';
import validation from '../_shared/discount-validation.cjs';

let db;
const sql = async (strings, ...values) => {
  if (typeof strings === 'string') return (await db.query(strings, values[0] || [])).rows;
  const query = strings.reduce((acc, part, i) => acc + (i ? `$${i}` : '') + part, '');
  if (query.includes('CREATE EXTENSION')) return [];
  return (await db.query(query, values)).rows;
};
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE discount_codes (
    id UUID DEFAULT gen_random_uuid(), code TEXT UNIQUE, email TEXT, discount_percentage INTEGER,
    discount_amount_cents INTEGER, single_use BOOLEAN, used BOOLEAN, expires_at TIMESTAMPTZ,
    status TEXT, issued_at TIMESTAMPTZ, campaign TEXT, max_uses_per_customer INTEGER,
    max_total_uses INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    used_by_user_id UUID, used_by_email TEXT[], cart_id UUID, order_id UUID
  );
  CREATE TABLE orders (id UUID, email TEXT, created_at TIMESTAMPTZ, status TEXT, is_test_order BOOLEAN, checkout_idempotency_key TEXT);
  CREATE TABLE abandoned_carts (id UUID, recovery_status TEXT);
  CREATE TABLE recovery_email_suppressions (normalized_email TEXT, reason TEXT, active BOOLEAN);
  CREATE TABLE outbound_suppressions (normalized_value TEXT, reason TEXT, active BOOLEAN, scope TEXT);
  CREATE TABLE trade_show_email_unsubscribes (normalized_email TEXT, reason TEXT);
  CREATE TABLE email_captures (email TEXT, consent BOOLEAN, captured_at TIMESTAMPTZ, created_at TIMESTAMPTZ);`);
  await offer.ensureSchema(sql);
});
after(async () => { await db.close(); });

test('one email creates one reusable 25% coupon, without extending its expiry or changing consent', async () => {
  const first = await offer.getOrCreateLead(sql, { email: 'reader@bof-offer-fixture.com', slug: 'banner-ideas', consent: true });
  const repeated = await offer.getOrCreateLead(sql, { email: 'reader@bof-offer-fixture.com', slug: 'different-post', consent: false });
  assert.equal(first.discount_code, repeated.discount_code);
  assert.equal(first.expires_at.toISOString(), repeated.expires_at.toISOString());
  assert.equal(repeated.source_slug, 'banner-ideas');
  assert.equal(repeated.marketing_consent, true);
  const coupons = await db.query('SELECT * FROM discount_codes');
  assert.equal(coupons.rows.length, 1);
  assert.equal(coupons.rows[0].discount_percentage, 25);
  assert.equal(coupons.rows[0].single_use, true);
  assert.equal(coupons.rows[0].max_total_uses, 1);
  const good = await validation.validateDiscountForCheckout({ sql, code: first.discount_code, email: 'reader@bof-offer-fixture.com' });
  assert.equal(good.valid, true);
  assert.equal(good.discount.discountPercentage, 25);
  assert.equal((await validation.validateDiscountForCheckout({ sql, code: first.discount_code, email: 'other@bof-offer-fixture.com' })).valid, false);
  await db.query('UPDATE discount_codes SET used = TRUE WHERE code = $1', [first.discount_code]);
  assert.equal((await validation.validateDiscountForCheckout({ sql, code: first.discount_code, email: 'reader@bof-offer-fixture.com' })).valid, false);
});

test('rate limit is bounded and shared across requests for an IP', async () => {
  for (let i = 0; i < 10; i++) assert.equal(await offer.rateLimit(sql, '192.0.2.1', 'test-secret', new Date()), true);
  assert.equal(await offer.rateLimit(sql, '192.0.2.1', 'test-secret', new Date()), false);
  assert.equal(await offer.rateLimit(sql, '192.0.2.2', 'test-secret', new Date()), true);
});

const env = { DATABASE_URL: 'test', RESEND_API_KEY: 'test-key', AUTH_SESSION_SECRET: 'test-secret' };
const request = { email: 'delivery@bof-offer-fixture.com', marketingConsent: false, slug: 'banner-ideas', website: '' };
const runtime = { ip: '192.0.2.50', production: true };
let sendCount = 0;
let sentPayload;
let sentKey;
const service = offer.createService({ neon: () => sql, send: async (key, payload, providerKey) => {
  sendCount++; sentPayload = payload; sentKey = providerKey; return { data: { id: 'provider-confirmed' } };
} });

test('preview, invalid input, honeypot and missing configuration cannot send or create leads', async () => {
  assert.equal((await service(request, env, { ...runtime, production: false })).status, 503);
  assert.equal((await service({ ...request, email: 'not-an-email' }, env, runtime)).status, 400);
  assert.equal((await service({ ...request, website: 'spam' }, env, runtime)).status, 400);
  assert.equal((await service(request, {}, runtime)).status, 503);
  assert.equal(sendCount, 0);
});

test('code-only signup delivers once with unsubscribe headers and no false marketing consent', async () => {
  const response = await service(request, env, runtime);
  assert.equal(response.status, 200);
  assert.match(response.body.code, /^READ25-[A-F0-9]{8}$/);
  assert.equal(response.body.emailSent, true);
  assert.equal(sendCount, 1);
  assert.match(sentPayload.text, /does not subscribe you/);
  assert.match(sentPayload.headers['List-Unsubscribe'], /marketing-email-unsubscribe/);
  assert.equal(sentPayload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(sentKey, /^blog-reader25\/[a-f0-9]{64}$/);
  const duplicate = await service(request, env, runtime);
  assert.equal(duplicate.body.code, response.body.code);
  assert.equal(sendCount, 1);
});

test('email failures stay retryable and never report a delivered code', async () => {
  const payloads = [];
  const failing = offer.createService({ neon: () => sql, send: async (key, payload, providerKey) => { payloads.push({ payload, providerKey }); return { error: { message: 'outage' } }; } });
  const req = { ...request, email: 'retry@bof-offer-fixture.com', marketingConsent: true };
  assert.equal((await failing(req, env, runtime)).status, 503);
  const retry = offer.createService({ neon: () => sql, send: async (key, payload, providerKey) => { payloads.push({ payload, providerKey }); return { data: { id: 'recovered' } }; } });
  assert.equal((await retry(req, env, runtime)).status, 200);
  assert.deepEqual(payloads[0], payloads[1]);
});

test('suppressed recipients are not mailed and lead export excludes opt-outs, buyers and code-only requests', async () => {
  await db.exec(`INSERT INTO marketing_email_suppressions (normalized_email, reason, source, active) VALUES ('blocked@bof-offer-fixture.com', 'unsubscribe', 'footer_link', TRUE)`);
  assert.equal((await service({ ...request, email: 'blocked@bof-offer-fixture.com' }, env, runtime)).status, 409);
  for (const email of ['buyer@bof-offer-fixture.com', 'optout@bof-offer-fixture.com', 'eligible@bof-offer-fixture.com']) {
    assert.equal((await service({ ...request, email, marketingConsent: true }, env, runtime)).status, 200);
  }
  await db.exec(`INSERT INTO orders (email, created_at, status, is_test_order) VALUES ('buyer@bof-offer-fixture.com', NOW(), 'paid', FALSE);
    INSERT INTO marketing_email_suppressions (normalized_email, reason, source, active) VALUES ('optout@bof-offer-fixture.com', 'unsubscribe', 'footer_link', TRUE)`);
  const list = await offer.listLeads(sql);
  const byEmail = Object.fromEntries(list.leads.map(l => [l.email, l]));
  assert.equal(byEmail['buyer@bof-offer-fixture.com'].eligible, false);
  assert.equal(byEmail['buyer@bof-offer-fixture.com'].purchased, true);
  assert.equal(byEmail['optout@bof-offer-fixture.com'].eligible, false);
  assert.equal(byEmail['delivery@bof-offer-fixture.com'].eligible, false);
  assert.equal(byEmail['eligible@bof-offer-fixture.com'].eligible, true);
  await db.exec('DROP TABLE recovery_email_suppressions');
  const unavailable = await offer.listLeads(sql);
  assert.equal(unavailable.verificationAvailable, false);
  assert.equal(unavailable.leads.some(l => l.eligible), false);
});

test('email template escapes configurable content and includes truthful terms', () => {
  const rendered = offer.emailContent({ discount_code: 'READ25-ABCDEF01', expires_at: '2026-10-16T12:00:00Z', marketing_consent: true }, 'https://example.com/unsubscribe', '<unsafe>');
  assert.ok(!rendered.html.includes('<unsafe>'));
  assert.ok(rendered.html.includes('&lt;unsafe&gt;'));
  assert.match(rendered.text, /One use\. Expires/);
  assert.match(rendered.text, /Cannot be combined/);
});

test('signed provider feedback suppresses only the matching blog send and is replay safe', async () => {
  await offer.recordDeliveryEvent(sql, { type: 'email.complained' }, 'wrong-message', 'eligible@bof-offer-fixture.com');
  assert.equal((await db.query("SELECT * FROM marketing_email_suppressions WHERE normalized_email = 'eligible@bof-offer-fixture.com'")).rows.length, 0);
  await offer.recordDeliveryEvent(sql, { type: 'email.complained' }, 'provider-confirmed', 'eligible@bof-offer-fixture.com');
  await offer.recordDeliveryEvent(sql, { type: 'email.complained' }, 'provider-confirmed', 'eligible@bof-offer-fixture.com');
  const rows = (await db.query("SELECT * FROM marketing_email_suppressions WHERE normalized_email = 'eligible@bof-offer-fixture.com'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'spam_complaint');
  assert.equal(rows[0].active, true);
});
