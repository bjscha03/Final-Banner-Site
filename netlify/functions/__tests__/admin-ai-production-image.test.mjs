import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sql: vi.fn(), requireAdmin: vi.fn(), plan: vi.fn(), render: vi.fn(), upload: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => mocks.sql }));
vi.mock('../_shared/server-auth.cjs', () => ({ default: { requireAdmin: mocks.requireAdmin } }));
vi.mock('../_shared/ai-production-image.cjs', () => ({ default: { productionImagePlan: mocks.plan, renderAiProductionImage: mocks.render, VERSION: 'v1', DPI: 200 } }));
vi.mock('cloudinary', () => ({ default: { v2: { config() {}, uploader: { upload_stream: mocks.upload } } } }));
import { handler } from '../admin-ai-production-image.mjs';
const orderId = '1ee94925-f191-44d3-a302-90cc7e0c9010', itemId = '1e5d1afb-acc5-4943-a814-9c67e4983cfc';
const event = { httpMethod: 'POST', body: JSON.stringify({ orderId, itemId }) };
beforeEach(() => { vi.resetAllMocks(); process.env.DATABASE_URL = 'postgres://test.invalid/db'; mocks.requireAdmin.mockReturnValue({ ok: true }); });
it('requires an authenticated administrator before reading any artwork', async () => {
  mocks.requireAdmin.mockReturnValue({ ok: false, response: { statusCode: 401 } });
  expect((await handler(event)).statusCode).toBe(401); expect(mocks.sql).not.toHaveBeenCalled();
});
it('requires both the order and item to match, without trusting client artwork URLs', async () => {
  mocks.sql.mockResolvedValue([]);
  expect((await handler(event)).statusCode).toBe(404);
  expect(mocks.sql.mock.calls[0].slice(1)).toEqual([itemId, orderId]);
  expect(mocks.render).not.toHaveBeenCalled();
});
it('reuses a verified cached image for the same composition', async () => {
  mocks.sql.mockResolvedValue([{ artwork_manifest: { productionImage: { hash: 'same', version: 'v1', url: 'https://cdn.test/print.jpg' } } }]);
  mocks.plan.mockReturnValue({ hash: 'same' });
  const old = global.fetch; global.fetch = vi.fn(async () => ({ ok: true }));
  try { expect(JSON.parse((await handler(event)).body).downloadUrl).toBe('https://cdn.test/print.jpg'); expect(mocks.render).not.toHaveBeenCalled(); }
  finally { global.fetch = old; }
});
it('stores a derivative without replacing the original and returns JSON instead of a large binary payload', async () => {
  const item = { id: itemId, width_in: 96, height_in: 36, canvas_state_json: 'saved', artwork_manifest: { originalUrl: 'https://cdn.test/original.jpg', productionImage: { hash: 'old-150-hash', version: 'ai-jpeg-full-size-150-v1', dpi: 150, url: 'https://cdn.test/old-150.jpg' } } };
  mocks.sql.mockResolvedValueOnce([item]).mockResolvedValue([]);
  mocks.plan.mockReturnValue({ hash: 'new-hash' });
  mocks.render.mockResolvedValue({ buffer: Buffer.alloc(5 * 1024 * 1024), metadata: { hash: 'new-hash', dpi: 200 } });
  mocks.upload.mockImplementation((options, done) => ({ end: () => done(null, { secure_url: 'https://cdn.test/print.jpg' }) }));
  const result = await handler(event);
  expect(result.statusCode).toBe(200); expect(result.body.length).toBeLessThan(1000);
  expect(JSON.parse(result.body).dpi).toBe(200);
  expect(mocks.upload.mock.calls[0][0].public_id).toContain('96x36in-200dpi.jpg');
  expect(mocks.sql.mock.calls[1][0].join('')).toContain("'{productionImage}'");
  expect(item.artwork_manifest.originalUrl).toBe('https://cdn.test/original.jpg');
});
