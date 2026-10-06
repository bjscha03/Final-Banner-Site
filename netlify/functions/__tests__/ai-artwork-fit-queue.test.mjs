import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handlerPath = require.resolve('../_shared/ai-designer/handler.cjs');
const localRequire = createRequire(handlerPath);

function fixture() {
  const jobs = new Map(), counts = new Map();
  const customerLimit = vi.fn(async () => null);
  const rateLimit = vi.fn((_event, _session, action, limit) => {
    const count = counts.get(action) || 0;
    if (count >= limit) return { statusCode: 429, headers: { 'Retry-After': '25' }, body: JSON.stringify({ error: 'RATE_LIMITED' }) };
    counts.set(action, count + 1); return null;
  });
  const overrides = {
    './config.cjs': { ...localRequire('./config.cjs'), isEnabled: () => true },
    './customer-limits.cjs': { customerLimit },
    './security.cjs': { ...localRequire('./security.cjs'), authorize: () => ({ session: { sub: 'test-customer' } }), rateLimit,
      idempotencyKey: (_event, body) => body.idempotencyKey, runIdempotent: (_key, task) => task() },
    './storage.cjs': { ...localRequire('./storage.cjs'), isTemporaryStorageConfigured: () => true,
      createJob: async ({ jobId, beforeCreate }) => {
        if (!jobs.has(jobId)) { await beforeCreate(); jobs.set(jobId, { record: { status: 'queued' }, reference: jobId }); }
        return jobs.get(jobId);
      } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(handlerPath, 'utf8'), { module, exports: module.exports,
    require: id => overrides[id] || localRequire(id), Buffer, process: { env: { OPENAI_API_KEY: 'nonfunctional-test-placeholder' } }, console });
  return { jobs, customerLimit, rateLimit, enqueue: key => module.exports.fitHandler({ httpMethod: 'POST', body: JSON.stringify({ sourceImage: 'data:image/png;base64,AAAA', widthIn: 120, heightIn: 36, idempotencyKey: key }) }) };
}

it('allows a normal fourth layout but bounds new layouts at eight per window', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) expect((await f.enqueue(`layout-${i}`)).statusCode).toBe(202);
  expect((await f.enqueue('layout-9')).statusCode).toBe(429);
  expect(f.customerLimit).toHaveBeenCalledTimes(8);
  expect(f.jobs.size).toBe(8);
});

it('recovers a previously accepted job after the new-generation allowance is exhausted', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) await f.enqueue(`layout-${i}`);
  const recovered = await f.enqueue('layout-0');
  expect(recovered.statusCode).toBe(202);
  expect(JSON.parse(recovered.body).jobRef).toBe('layout-0');
  expect(f.customerLimit).toHaveBeenCalledTimes(8);
  expect(f.rateLimit.mock.calls.filter(call => call[2] === 'fit')).toHaveLength(8);
});

it('retains the durable customer limit and its retry delay for a new layout', async () => {
  const f = fixture(); f.customerLimit.mockResolvedValue({ allowed: false, retryAfter: 47 });
  const rejected = await f.enqueue('new-layout');
  expect(rejected.statusCode).toBe(429); expect(rejected.headers['Retry-After']).toBe('47'); expect(f.jobs.size).toBe(0);
});

it('fails closed if durable limits are unavailable', async () => {
  const f = fixture(); f.customerLimit.mockRejectedValue(new Error('database unavailable'));
  expect((await f.enqueue('new-layout')).statusCode).toBe(503); expect(f.jobs.size).toBe(0);
});
