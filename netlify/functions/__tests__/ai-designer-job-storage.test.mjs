import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const cloudinary = require('cloudinary').v2;
const storage = require('../_shared/ai-designer/storage.cjs');
const secret = 'test-job-storage-secret';
const session = { sub: 'test-customer' };
const publicId = `uploads/ai-designer-jobs/${'a'.repeat(64)}`;
function reference() {
  const payload = Buffer.from(JSON.stringify({ kind: 'ai-designer-job', publicId, action: 'edit', sub: crypto.createHash('sha256').update(session.sub).digest('hex'), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud'); vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
  vi.stubEnv('CLOUDINARY_API_SECRET', secret); vi.stubEnv('AUTH_SESSION_SECRET', secret);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('uncached AI job state', () => {
  it('reads immediate same-second state changes from the origin, without a CDN or Admin API lookup', async () => {
    const resource = vi.spyOn(cloudinary.api, 'resource');
    const url = vi.spyOn(cloudinary, 'url');
    let status = 'queued';
    const fetch = vi.fn(async input => {
      const parsed = new URL(input);
      expect(parsed.hostname).toBe('api.cloudinary.com');
      expect(parsed.pathname).toBe('/v1_1/test-cloud/raw/download');
      expect(parsed.searchParams.get('public_id')).toBe(publicId);
      expect(parsed.searchParams.get('type')).toBe('authenticated');
      expect(parsed.searchParams.get('signature')).toBeTruthy();
      return new Response(JSON.stringify({ status }));
    });
    vi.stubGlobal('fetch', fetch);
    const ref = reference();
    expect((await storage.readJob(ref, session)).status).toBe('queued');
    status = 'processing';
    expect((await storage.readJobInternal(ref)).status).toBe('processing');
    status = 'completed';
    expect((await storage.readJob(ref, session)).status).toBe('completed');
    expect(resource).not.toHaveBeenCalled(); expect(url).not.toHaveBeenCalled();
    expect(fetch.mock.calls).toHaveLength(3);
  });
  it('treats a missing job as absent but does not hide an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await storage.readJobInternal(reference())).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(storage.readJobInternal(reference())).rejects.toThrow('could not be retrieved');
  });
  it('rejects another customer before making any storage request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(storage.readJob(reference(), { sub: 'another-customer' })).rejects.toThrow('invalid or expired');
    expect(fetch).not.toHaveBeenCalled();
  });
});
