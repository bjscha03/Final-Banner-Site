import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCustomerSession, readCustomerSession } = require('../_shared/ai-designer/customer-session.cjs');
const { authorize } = require('../_shared/ai-designer/security.cjs');
const { consumeQuota } = require('../_shared/ai-designer/customer-limits.cjs');
const { requireAdmin, verifySessionToken } = require('../_shared/server-auth.cjs');
const { statusHandler, generateHandler, editHandler, workerHandler } = require('../_shared/ai-designer/handler.cjs');
const { temporaryArtworkUrl } = require('../_shared/ai-designer/storage.cjs');
const original = { ...process.env };
const event = (cookie = '') => ({ httpMethod: 'POST', headers: { origin: 'https://bannersonthefly.com', host: 'bannersonthefly.com', cookie }, netlify: { deployContext: 'production', clientIp: '192.0.2.1' }, body: '{}' });
beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'customer-scope-test-secret';
  delete process.env.OPENAI_API_KEY;
  delete process.env.CONTEXT;
  delete process.env.DEPLOY_PRIME_URL;
});
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original); });

describe('public AI sessions', () => {
  it('starts a secure guest session and reuses its identity on refresh', async () => {
    const first = await statusHandler(event());
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).authorized).toBe(true);
    const cookie = first.headers['Set-Cookie'];
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    const again = await statusHandler(event(cookie));
    expect(JSON.parse(again.body).sessionKey).toBe(JSON.parse(first.body).sessionKey);
    expect(again.headers['Set-Cookie']).toBeUndefined();
  });
  it('never grants admin access or creates a reusable admin bearer token', () => {
    const { cookie } = createCustomerSession();
    const token = cookie.split(';')[0].split('=')[1];
    expect(verifySessionToken(token)).toBeNull();
    expect(requireAdmin(event(cookie)).ok).toBe(false);
    expect(requireAdmin({ ...event(cookie), headers: { ...event(cookie).headers, authorization: `Bearer ${token}` } }).ok).toBe(false);
  });
  it('rejects tampered, expired, and missing sessions', () => {
    const now = Date.now();
    const { cookie } = createCustomerSession(now);
    expect(readCustomerSession(event(cookie), now + 8 * 86400_000)).toBeNull();
    expect(readCustomerSession(event(cookie.replace('banners_ai_customer=', 'banners_ai_customer=x')))).toBeNull();
    expect(authorize(event()).response.statusCode).toBe(401);
  });
  it('cannot mint a session cross-origin or spoof protected-preview admin access in production', () => {
    const foreign = event(); foreign.headers.origin = 'https://attacker.example';
    expect(authorize(foreign, { issueCustomer: true }).response.statusCode).toBe(403);
    const spoof = event('botf_preview_admin=1'); spoof.headers['x-forwarded-host'] = 'deploy-preview-1--bannersonthefly.netlify.app';
    expect(authorize(spoof).response.statusCode).toBe(401);
  });
  it('lets guests reach configured-provider checks without lifting authentication on direct API calls', async () => {
    const { cookie } = createCustomerSession();
    expect(JSON.parse((await generateHandler(event(cookie))).body).error).toBe('AI_NOT_CONFIGURED');
    expect(JSON.parse((await editHandler(event(cookie))).body).error).toBe('AI_NOT_CONFIGURED');
    expect((await generateHandler(event())).statusCode).toBe(401);
  });
  it('rejects another customer’s signed artwork and background job before network work', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test'; process.env.CLOUDINARY_API_KEY = 'test'; process.env.CLOUDINARY_API_SECRET = 'test';
    const owner = createCustomerSession(); const other = createCustomerSession();
    const signed = payload => { const text = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${text}.${crypto.createHmac('sha256', process.env.AUTH_SESSION_SECRET).update(text).digest('base64url')}`; };
    const payload = { publicId: 'test/artwork', sub: crypto.createHash('sha256').update(owner.session.sub).digest('hex'), exp: Math.floor(Date.now() / 1000) + 600 };
    expect(() => temporaryArtworkUrl(signed(payload), other.session)).toThrow(/invalid or expired/);
    const request = event(other.cookie); request.body = JSON.stringify({ jobRef: signed({ ...payload, kind: 'ai-designer-job', action: 'generate' }) });
    const response = await workerHandler(request);
    expect(response.statusCode).toBe(400);
  });
});

describe('distributed customer request limits', () => {
  it('allows a consumed database slot and rejects an exhausted quota', async () => {
    expect((await consumeQuota(async () => [{ hit_count: 1 }], 'key', 4, 60_000)).allowed).toBe(true);
    expect(await consumeQuota(async () => [], 'key', 4, 60_000)).toEqual({ allowed: false, retryAfter: 60 });
  });
  it('does not turn database errors into unlimited public generation', async () => {
    await expect(consumeQuota(async () => { throw new Error('offline'); }, 'key', 4, 60_000)).rejects.toThrow('offline');
  });
});
