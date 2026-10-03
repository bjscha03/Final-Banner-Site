import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const cloudinary = require('cloudinary').v2;
const storage = require('../_shared/ai-designer/storage.cjs');
const { runIdempotent } = require('../_shared/ai-designer/security.cjs');
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
  it('retries a rejected queue read immediately with the same identity, then reuses success', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce({ jobRef: 'same-job' });
    const key = crypto.randomUUID();
    await expect(runIdempotent(key, task)).rejects.toThrow('storage unavailable');
    expect(await runIdempotent(key, task)).toEqual({ jobRef: 'same-job' });
    expect(await runIdempotent(key, task)).toEqual({ jobRef: 'same-job' });
    expect(task).toHaveBeenCalledTimes(2);
  });
  it('shares one accepted queue request between simultaneous retries', async () => {
    const task = vi.fn(async () => ({ jobRef: 'same-job' }));
    const key = crypto.randomUUID();
    const results = await Promise.all([runIdempotent(key, task), runIdempotent(key, task)]);
    expect(results).toEqual([{ jobRef: 'same-job' }, { jobRef: 'same-job' }]);
    expect(task).toHaveBeenCalledOnce();
  });
  it('never overwrites an existing paid job when checking storage temporarily fails', async () => {
    const upload = vi.spyOn(cloudinary.uploader, 'upload_stream');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(storage.createJob({ session, action: 'edit', request: { instruction: 'Change text' }, jobId: 'a'.repeat(64) })).rejects.toThrow('could not be retrieved');
    expect(upload).not.toHaveBeenCalled();
  });
  it('returns the completed result for an existing request without uploading or regenerating', async () => {
    const upload = vi.spyOn(cloudinary.uploader, 'upload_stream');
    const record = { status: 'completed', result: { concept: { versionId: 'edited-version' } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(record))));
    const result = await storage.createJob({ session, action: 'edit', request: {}, jobId: 'a'.repeat(64) });
    expect(result.created).toBe(false); expect(result.record).toEqual(record);
    expect(upload).not.toHaveBeenCalled();
  });
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
