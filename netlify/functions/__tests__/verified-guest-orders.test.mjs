import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID, pbkdf2Sync } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import history from '../_shared/verified-guest-orders.cjs';
import bof from '../_shared/bof-service.cjs';
import serverAuth from '../_shared/server-auth.cjs';

let db;
const sql = async (strings, ...values) => {
  if (typeof strings === 'string') return (await db.query(strings, values[0] || [])).rows;
  const query = strings.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ''), '');
  return (await db.query(query, values)).rows;
};
const quiet = { log() {}, warn() {}, error() {} };
function handler(name, providerProfile) {
  const extension = name.endsWith('-callback') ? 'ts' : 'cjs';
  const url = new URL(`../_shared/legacy/${name}.${extension}`, import.meta.url);
  const realRequire = createRequire(url);
  const module = { exports: {} };
  const require = (name) => {
    if (name === '@neondatabase/serverless') return { neon: () => sql };
    if (name === 'resend') return { Resend: class { emails = { send: async () => ({ data: { id: 'isolated-test-email-not-sent' } }) }; } };
    return realRequire(name);
  };
  const code = extension === 'ts' ? transformSync(readFileSync(url, 'utf8'), { loader: 'ts', format: 'cjs' }).code : readFileSync(url, 'utf8');
  const fetch = async (url) => ({ ok: true, json: async () => String(url).includes('userinfo') ? providerProfile : { access_token: 'isolated-provider-test-token' } });
  vm.runInNewContext(`(function(require,module,exports,process,console){${code}\n})`, { Date, URLSearchParams, fetch, setTimeout, clearTimeout }, { filename: url.pathname })(require, module, module.exports, process, quiet);
  return module.exports.handler;
}
const request = (body) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) });
const parse = (response) => JSON.parse(response.body);
async function person(email, verified = true, password = null) {
  const id = randomUUID();
  const passwordHash = password ? `test-salt:${pbkdf2Sync(password, 'test-salt', 10000, 64, 'sha512').toString('hex')}` : null;
  await sql`INSERT INTO profiles(id,email,email_verified,password_hash) VALUES(${id}::uuid,${email},${verified},${passwordHash})`;
  return { id, email };
}
async function order(email, owner = null, status = 'paid') {
  const id = randomUUID();
  await sql`INSERT INTO orders(id,email,user_id,status) VALUES(${id}::uuid,${email},${owner}::uuid,${status})`;
  return id;
}
const owner = async (id) => (await sql`SELECT user_id FROM orders WHERE id=${id}::uuid`)[0].user_id;

beforeAll(async () => {
  process.env.DATABASE_URL = 'isolated-test-only';
  process.env.RESEND_API_KEY = 'isolated-test-no-send';
  process.env.AUTH_SESSION_SECRET = 'isolated-test-signing-secret';
  db = new PGlite();
  await db.exec(`
    CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,full_name text,username text,google_id text,is_admin boolean DEFAULT false,
      password_hash text,email_verified boolean DEFAULT false,email_verified_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz);
    CREATE TABLE orders(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),email text,status text,is_test_order boolean DEFAULT false);
    CREATE TABLE email_verifications(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),token text,expires_at timestamptz,verified boolean DEFAULT false,verified_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE credit_purchases(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),credits_purchased integer,created_at timestamptz DEFAULT now());
    CREATE TABLE bof_members(user_id uuid PRIMARY KEY REFERENCES profiles(id),code text UNIQUE);`);
}, 30000);
afterAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_SESSION_SECRET;
  await db?.close();
});

describe('Verified guest order ownership', () => {
  it('links every historical guest order after verification, including normalized email variants, and remains idempotent', async () => {
    const user = await person('Historical@customer.com ');
    const ids = [];
    for (let i = 0; i < 25; i++) ids.push(await order(i % 2 ? ' historical@CUSTOMER.com ' : 'historical@customer.com', null, i % 3 ? 'paid' : 'refunded'));
    expect(await history.linkVerifiedGuestOrders(sql, user)).toBe(25);
    expect(await history.linkVerifiedGuestOrders(sql, user)).toBe(0);
    const owned = await sql`SELECT id FROM orders WHERE user_id=${user.id}::uuid`;
    expect(new Set(owned.map((row) => row.id))).toEqual(new Set(ids));
  });

  it('never links an unverified identity, mismatched email, another buyer, or already-owned orders', async () => {
    const user = await person('privacy@customer.com', false);
    const other = await person('other@customer.com');
    const guest = await order(user.email);
    const existing = await order(user.email, other.id);
    const unrelated = await order(other.email);
    expect(await history.linkVerifiedGuestOrders(sql, user)).toBe(0);
    await sql`UPDATE profiles SET email_verified=true WHERE id=${user.id}::uuid`;
    expect(await history.linkVerifiedGuestOrders(sql, { id: user.id, email: other.email })).toBe(0);
    expect(await history.linkVerifiedGuestOrders(sql, user)).toBe(1);
    expect(await owner(guest)).toBe(user.id);
    expect(await owner(existing)).toBe(other.id);
    expect(await owner(unrelated)).toBeNull();
  });

  it('attaches guest history during the normal email verification endpoint, before the customer signs in', async () => {
    const user = await person('verify@customer.com', false);
    const oldOrder = await order(' VERIFY@customer.com ');
    await sql`INSERT INTO email_verifications(id,user_id,token,expires_at) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'verify-valid',now()+interval '1 day')`;
    const verify = handler('verify-email');
    expect(parse(await verify(request({ token: 'verify-valid' }))).ok).toBe(true);
    expect(await owner(oldOrder)).toBe(user.id);
    expect(parse(await verify(request({ token: 'verify-valid' }))).ok).toBe(true);
  });

  it('cannot claim history with an expired verification token', async () => {
    const user = await person('expired-verification@customer.com', false);
    const oldOrder = await order(user.email);
    await sql`INSERT INTO email_verifications(id,user_id,token,expires_at) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'verify-expired',now()-interval '1 day')`;
    expect((await handler('verify-email')(request({ token: 'verify-expired' }))).statusCode).toBe(400);
    expect(await owner(oldOrder)).toBeNull();
  });

  it('links newly placed guest orders on the next authenticated sign-in and rejects invalid credentials first', async () => {
    const user = await person('SignIn@customer.com ', true, 'Correct-password1');
    const oldOrder = await order('signin@customer.com');
    const signIn = handler('sign-in');
    expect((await signIn(request({ email: user.email, password: 'Wrong-password' }))).statusCode).toBe(401);
    expect(await owner(oldOrder)).toBeNull();
    const response = await signIn(request({ email: 'signin@customer.com', password: 'Correct-password1' }));
    expect(parse(response).user.id).toBe(user.id);
    expect(await owner(oldOrder)).toBe(user.id);
  });

  it('links past guest orders when a verified existing customer joins BOF Cash and preserves their referral code', async () => {
    const user = await person('join@customer.com');
    const oldOrder = await order(user.email);
    const first = await bof.join(sql, user);
    const second = await bof.join(sql, user);
    expect(first.code).toBe(second.code);
    expect(await owner(oldOrder)).toBe(user.id);
  });

  it('public signup never grants admin access from the email or request body and waits for verification before linking', async () => {
    const email = 'myadminbusiness@customer.com';
    const oldOrder = await order(email);
    const result = await handler('sign-up')(request({ email, password: 'Valid-password1', is_admin: true, fullName: 'Customer' }));
    expect(parse(result).ok).toBe(true);
    const rows = await sql`SELECT is_admin,email_verified FROM profiles WHERE email=${email}`;
    expect(rows[0]).toEqual({ is_admin: false, email_verified: false });
    expect(await owner(oldOrder)).toBeNull();
  });

  it('does not create a second account for a historical case-variant email', async () => {
    const user = await person('Duplicate@customer.com ');
    const result = await handler('sign-up')(request({ email: 'duplicate@customer.com', password: 'Valid-password1' }));
    expect(result.statusCode).toBe(400);
    const rows = await sql`SELECT id FROM profiles WHERE lower(btrim(email))='duplicate@customer.com'`;
    expect(rows.map((row) => row.id)).toEqual([user.id]);
  });

  it('fails closed on an ambiguous historical password identity instead of choosing an arbitrary profile', async () => {
    await person('Ambiguous@customer.com', true, 'Valid-password1');
    await person('ambiguous@customer.com', true, 'Valid-password1');
    const oldOrder = await order('ambiguous@customer.com');
    const result = await handler('sign-in')(request({ email: 'ambiguous@customer.com', password: 'Valid-password1' }));
    expect(result.statusCode).toBe(401);
    expect(await owner(oldOrder)).toBeNull();
  });

  it('only returns AI credit purchase history to its signed-in owner or a verified administrator', async () => {
    const user = await person('credit-owner@customer.com');
    const other = await person('credit-other@customer.com');
    await sql`INSERT INTO credit_purchases(id,user_id,credits_purchased) VALUES(${randomUUID()}::uuid,${user.id}::uuid,10)`;
    const getHistory = handler('get-credit-purchases');
    const event = { httpMethod: 'GET', headers: {}, queryStringParameters: { user_id: user.id } };
    expect((await getHistory(event)).statusCode).toBe(401);
    expect((await getHistory({ ...event, headers: { authorization: `Bearer ${serverAuth.createSessionToken({ ...other, is_admin: false })}` } })).statusCode).toBe(401);
    const owned = await getHistory({ ...event, headers: { authorization: `Bearer ${serverAuth.createSessionToken({ ...user, is_admin: false })}` } });
    expect(parse(owned)).toHaveLength(1);
    expect(owned.headers['Cache-Control']).toBe('private, no-store');
    const admin = await getHistory({ ...event, headers: { authorization: `Bearer ${serverAuth.createSessionToken({ ...other, is_admin: true })}` } });
    expect(parse(admin)).toHaveLength(1);
    const preview = await getHistory({ ...event, headers: { host: 'deploy-preview-553--bannersonthefly.netlify.app', cookie: 'botf_preview_admin=1' } });
    expect(preview.statusCode).toBe(401);
  });

  for (const provider of ['google', 'linkedin']) {
    it(`${provider} reuses a verified provider identity, attaches guest history, and stores a usable signed BOF session`, async () => {
      const envPrefix = provider.toUpperCase();
      process.env[`${envPrefix}_CLIENT_ID`] = 'isolated-client';
      process.env[`${envPrefix}_CLIENT_SECRET`] = 'isolated-secret';
      process.env[`${envPrefix}_REDIRECT_URI`] = `https://bannersonthefly.com/${provider}-callback`;
      try {
        const user = await person(`${provider.toUpperCase()}@customer.com `, false);
        await sql`UPDATE profiles SET full_name='</script><script>injected()</script>' WHERE id=${user.id}::uuid`;
        const oldOrder = await order(`${provider}@customer.com`);
        const result = await handler(`${provider}-callback`, {
          id: 'provider-user-id', email: `${provider}@customer.com`, verified_email: true, email_verified: true, name: 'Member',
        })({ httpMethod: 'GET', headers: {}, queryStringParameters: { code: 'isolated-code', state: 'test-state' } });
        expect(result.statusCode).toBe(200);
        expect(result.headers['Cache-Control']).toBe('private, no-store');
        expect(await owner(oldOrder)).toBe(user.id);
        expect((await sql`SELECT email_verified FROM profiles WHERE id=${user.id}::uuid`)[0].email_verified).toBe(true);
        expect(result.body).not.toContain('</script><script>injected()');

        const local = new Map();
        const session = new Map([[`${provider}_oauth_state`, 'test-state']]);
        const storage = (map) => ({ getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
        const document = { cookie: '' };
        vm.runInNewContext(result.body.match(/<script>([\s\S]*?)<\/script>/)[1], {
          localStorage: storage(local), sessionStorage: storage(session), document, URL, Event,
          console: quiet, setTimeout: (callback) => callback(),
          window: { location: { origin: 'https://bannersonthefly.com', replace() {} }, dispatchEvent() {} },
          alert: (message) => { throw new Error(message); },
        });
        const token = local.get('banners_server_session');
        expect(serverAuth.verifySessionToken(token)).toMatchObject({ sub: user.id, admin: false });
        expect(session.get('banners_server_session')).toBe(token);
        expect(document.cookie).toContain(encodeURIComponent(token));
      } finally {
        delete process.env[`${envPrefix}_CLIENT_ID`];
        delete process.env[`${envPrefix}_CLIENT_SECRET`];
        delete process.env[`${envPrefix}_REDIRECT_URI`];
      }
    });

    it(`${provider} refuses an unverified provider email before attaching orders or creating an account`, async () => {
      const envPrefix = provider.toUpperCase();
      process.env[`${envPrefix}_CLIENT_ID`] = 'isolated-client';
      process.env[`${envPrefix}_CLIENT_SECRET`] = 'isolated-secret';
      process.env[`${envPrefix}_REDIRECT_URI`] = `https://bannersonthefly.com/${provider}-callback`;
      try {
        const email = `${provider}-unverified@customer.com`;
        const oldOrder = await order(email);
        const result = await handler(`${provider}-callback`, { id: 'provider-user-id', email, verified_email: false, email_verified: false })({ httpMethod: 'GET', headers: {}, queryStringParameters: { code: 'isolated-code', state: 'test-state' } });
        expect(result.statusCode).toBe(302);
        expect(await owner(oldOrder)).toBeNull();
        expect(await sql`SELECT id FROM profiles WHERE email=${email}`).toHaveLength(0);
      } finally {
        delete process.env[`${envPrefix}_CLIENT_ID`];
        delete process.env[`${envPrefix}_CLIENT_SECRET`];
        delete process.env[`${envPrefix}_REDIRECT_URI`];
      }
    });
  }
});
