import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './tests/test-database.mjs';
import {handler} from './api.mjs';
import {createProspect} from './store.mjs';
import {offerText, TEAM_CODE_LIMIT, teamCodeRateKey} from './team-offer.mjs';
import promo from '../../netlify/functions/_shared/daniel-team-promotion.cjs';
import discountValidation from '../../netlify/functions/_shared/discount-validation.cjs';

const SECRET = 'test-only-team-offer-key-at-least-32-characters';
const env = {
  DANIEL_ALLOWED_HOST: 'preview.test',
  DANIEL_AGENT_MODE: 'preview',
  DANIEL_ADMIN_PASSWORD: 'test-password-only',
  DANIEL_SESSION_SECRET: 'test-encryption-key-longer-than-32-characters',
  DANIEL_PROMO_SIGNING_SECRET: SECRET,
};
let db, sql, n = 0;
test.beforeEach(async () => {
  const fixture = await createTestDatabase();
  db = fixture.db;
  sql = fixture.sql;
});
test.afterEach(async () => { if (db) await db.close(); });

function req(path, method = 'GET', data = {}, cookie = '', origin = 'https://preview.test') {
  const headers = {'content-type': 'application/json', cookie};
  if (origin) headers.origin = origin;
  return new Request('https://preview.test' + path, {
    method,
    headers,
    ...(method === 'POST' ? {body: JSON.stringify(data)} : {}),
  });
}
async function signIn() {
  const response = await handler(req('/api/daniel/login', 'POST', {password: 'test-password-only'}), {}, {sql, env});
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
async function mint(cookie, company, context = {}) {
  return handler(req('/api/daniel/team-code', 'POST', {company}, cookie), context, {sql, env});
}
async function addAccount(name) {
  n += 1;
  return createProspect(sql, {
    name,
    segment: 'restaurant franchisee',
    website: 'https://example.com',
    source_url: 'https://example.com/contact',
    contact_name: 'Test Buyer',
    email: 'buyer' + n + '@example.test',
  }, 'test');
}
function secretFree(value) {
  return !JSON.stringify(value).includes(SECRET) && !JSON.stringify(value).includes('DANIEL_PROMO_SIGNING_SECRET');
}

test('unauthenticated and cross-origin team code requests are rejected', async () => {
  const anonymous = await mint('');
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error, 'Sign in required');
  const crossOrigin = await handler(req('/api/daniel/team-code', 'POST', {company: 'Maloof Entertainment'}, '', ''), {}, {sql, env});
  assert.equal(crossOrigin.status, 403);
  const cookie = await signIn();
  await handler(req('/api/daniel/logout', 'POST', {}, cookie), {}, {sql, env});
  assert.equal((await mint(cookie, 'Maloof Entertainment')).status, 401);
});

test('minted team codes match createTeamCode and validate through getTeamPromotion and checkout', async () => {
  const cookie = await signIn();
  const company = 'Maloof Entertainment';
  const expected = promo.createTeamCode(company, env);
  const first = await mint(cookie, '  ' + company + '  ');
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.code, expected);
  assert.equal(body.company, company);
  assert.equal(body.percent, 25);
  assert.equal(body.unlimited, true);
  assert.equal(body.expires_at, null);
  assert.equal(body.offer, offerText(expected));
  assert.equal(body.accounts_matched, 0);
  const promotion = promo.getTeamPromotion(body.code, env);
  assert.equal(promotion.discountPercentage, 25);
  assert.equal(promotion.code, expected);
  assert.equal(promo.getTeamPromotion(body.code.toLowerCase(), env).code, expected);
  const again = await (await mint(cookie, company)).json();
  assert.equal(again.code, expected);
  const accented = 'Café São Paulo';
  const accentedBody = await (await mint(cookie, accented)).json();
  assert.equal(accentedBody.code, promo.createTeamCode(accented, env));
  assert.equal(promo.getTeamPromotion(accentedBody.code, env).discountPercentage, 25);
  assert.equal(secretFree(body) && secretFree(again) && secretFree(accentedBody), true);
  const previous = process.env.DANIEL_PROMO_SIGNING_SECRET;
  process.env.DANIEL_PROMO_SIGNING_SECRET = SECRET;
  try {
    const checkout = await discountValidation.validateDiscountForCheckout({
      sql: async () => { throw Error('Unlimited codes must not consume stored coupons'); },
      code: body.code,
      email: 'buyer@example.com',
      now: new Date('2200-01-01'),
    });
    assert.equal(checkout.valid, true);
    assert.equal(checkout.discount.discountPercentage, 25);
    assert.equal(checkout.discount.code, expected);
  } finally {
    if (previous === undefined) delete process.env.DANIEL_PROMO_SIGNING_SECRET;
    else process.env.DANIEL_PROMO_SIGNING_SECRET = previous;
  }
});

test('a matching account stores the offer once and an existing offer is kept', async () => {
  const cookie = await signIn();
  const open = await addAccount('Maloof Entertainment');
  const kept = await addAccount('Maloof Entertainment');
  const existing = {code: 'KEEP-THIS-CODE', percent: 10, note: 'do not replace'};
  await sql`UPDATE daniel_sales.accounts SET team_offer=${JSON.stringify(existing)}::jsonb WHERE id=${kept.id}`;
  const response = await mint(cookie, 'maloof entertainment');
  assert.equal(response.status, 200);
  const body = await response.json();
  const expected = promo.createTeamCode('Maloof Entertainment', env);
  assert.equal(body.code, expected);
  assert.equal(promo.getTeamPromotion(body.code, env).discountPercentage, 25);
  assert.equal(body.accounts_matched, 2);
  assert.equal(body.accounts_recorded, 1);
  assert.equal(body.accounts_preserved, 1);
  const [saved] = await sql`SELECT team_offer FROM daniel_sales.accounts WHERE id=${open.id}`;
  assert.equal(saved.team_offer.code, expected);
  assert.equal(saved.team_offer.percent, 25);
  assert.equal(saved.team_offer.unlimited, true);
  assert.equal(saved.team_offer.expires_at, null);
  assert.equal(saved.team_offer.approved_by, 'owner-2026-10-21');
  assert.equal(promo.getTeamPromotion(saved.team_offer.code, env).code, expected);
  const [unchanged] = await sql`SELECT team_offer FROM daniel_sales.accounts WHERE id=${kept.id}`;
  assert.equal(unchanged.team_offer.code, 'KEEP-THIS-CODE');
  assert.equal(unchanged.team_offer.percent, 10);
  assert.equal(unchanged.team_offer.note, 'do not replace');
  const second = await (await mint(cookie, 'Maloof Entertainment')).json();
  assert.equal(second.code, expected);
  assert.equal(second.accounts_recorded, 0);
  assert.equal(second.accounts_preserved, 2);
  const [event] = await sql`SELECT metadata_json FROM daniel_sales.audit_events WHERE event_type='team_code_minted' ORDER BY id DESC LIMIT 1`;
  assert.equal(event.metadata_json.code, expected);
  assert.equal(secretFree(event.metadata_json), true);
});

test('team code minting is rate limited and refuses a missing signing secret', async () => {
  const cookie = await signIn();
  assert.equal((await mint(cookie, '!!!')).status, 400);
  const missing = await handler(req('/api/daniel/team-code', 'POST', {company: 'Maloof Entertainment'}, cookie), {}, {sql, env: {...env, DANIEL_PROMO_SIGNING_SECRET: ''}});
  assert.equal(missing.status, 503);
  const missingBody = await missing.json();
  assert.equal(missingBody.error, 'Team offer signing is not configured');
  assert.equal(secretFree(missingBody), true);
  const shortSecret = 'too-short-signing-key-value';
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' '));
  try {
    const short = await handler(req('/api/daniel/team-code', 'POST', {company: 'Maloof Entertainment'}, cookie), {}, {sql, env: {...env, DANIEL_PROMO_SIGNING_SECRET: shortSecret}});
    assert.equal(short.status, 503);
    const text = JSON.stringify(await short.json());
    assert.equal(text.includes(shortSecret), false);
    assert.equal(text.includes(SECRET), false);
  } finally {
    console.error = original;
  }
  assert.equal(logged.some(line => line.includes(shortSecret) || line.includes(SECRET)), false);
  await sql`INSERT INTO daniel_sales.login_attempts(ip_hash,attempts) VALUES(${teamCodeRateKey('198.51.100.20')},${TEAM_CODE_LIMIT})`;
  const limited = await mint(cookie, 'Maloof Entertainment', {ip: '198.51.100.20'});
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /15 minutes/);
});
