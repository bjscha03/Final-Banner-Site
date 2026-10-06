// @vitest-environment jsdom
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AIJobFailedError, AIRequestRateLimitError, forgetPendingJob, resumeBackgroundJob, runBackgroundJob, type PendingAIJob } from './backgroundJob';
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: (headers: unknown) => headers, authenticatedJsonBody: JSON.stringify }));

const startPath = '/.netlify/functions/ai-designer-brief';
const complete = { status: 'completed', brief: { structured: true } };
const response = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
let pending: PendingAIJob;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal('crypto', { randomUUID: webcrypto.randomUUID.bind(webcrypto), subtle: { digest: async (_algorithm, bytes) => createHash('sha256').update(bytes).digest() } });
  sessionStorage.clear();
  pending = { startPath, jobRef: 'existing-job', payloadFingerprint: 'existing', idempotencyKey: 'existing-request', dispatched: true, createdAt: Date.now(), pollAfterMs: 1000 };
});
afterEach(() => { forgetPendingJob(pending); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('retries dropped connections, malformed JSON and rate limits by polling the same job only', async () => {
  const fetch = vi.fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response('<html>Unavailable</html>'))
    .mockResolvedValueOnce(response({}, 429, { 'Retry-After': '12' }))
    .mockResolvedValueOnce(response(complete));
  vi.stubGlobal('fetch', fetch);
  const onStage = vi.fn();
  const result = resumeBackgroundJob(pending, new AbortController().signal, 'Waiting', onStage);
  await vi.advanceTimersByTimeAsync(19_100);
  expect(await result).toEqual(complete);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls.every(([url, init]) => url.endsWith('/ai-designer-job') && JSON.parse(init.body).jobRef === 'existing-job')).toBe(true);
  expect(onStage).toHaveBeenCalledWith('Reconnecting to your design. Your latest preview is safe.');
});

it.each([400, 401, 403])('does not retry a permanent status %s or weaken authentication', async status => {
  const fetch = vi.fn(async () => response({ message: 'Session or job unavailable' }, status)); vi.stubGlobal('fetch', fetch);
  const result = resumeBackgroundJob(pending, new AbortController().signal, 'Waiting', vi.fn());
  const check = expect(result).rejects.toBeInstanceOf(AIJobFailedError);
  await vi.advanceTimersByTimeAsync(1000); await check;
  expect(fetch).toHaveBeenCalledOnce();
});

it('bounds repeated status failures and leaves the saved job available for recovery', async () => {
  sessionStorage.setItem('banners_ai_designer_pending_job', JSON.stringify(pending));
  const fetch = vi.fn(async () => response({}, 503)); vi.stubGlobal('fetch', fetch);
  const result = resumeBackgroundJob(pending, new AbortController().signal, 'Waiting', vi.fn());
  const check = expect(result).rejects.toThrow('Check again to retrieve this same design');
  await vi.advanceTimersByTimeAsync(95_000); await check;
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(JSON.parse(sessionStorage.getItem('banners_ai_designer_pending_job')!).jobRef).toBe('existing-job');
});

it('keeps polling an incomplete completed response instead of losing its job reference', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ status: 'completed' })).mockResolvedValueOnce(response(complete)); vi.stubGlobal('fetch', fetch);
  const result = resumeBackgroundJob(pending, new AbortController().signal, 'Waiting', vi.fn());
  await vi.advanceTimersByTimeAsync(3100);
  expect(await result).toEqual(complete); expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not let unavailable browser storage hide a completed result', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Storage unavailable'); });
  const fetch = vi.fn(async url => url.endsWith('/ai-designer-brief') ? response({ jobRef: 'existing-job', pollAfterMs: 1000 }) : url.endsWith('/ai-designer-worker-background') ? new Response('', { status: 202 }) : response(complete));
  vi.stubGlobal('fetch', fetch);
  const result = runBackgroundJob(startPath, { brief: 'storage-test' }, new AbortController().signal, 'Waiting', vi.fn(), undefined, job => { pending = job; });
  await new Promise<void>(resolve => setImmediate(resolve));
  await vi.advanceTimersByTimeAsync(1100);
  expect(await result).toEqual(complete); expect(fetch).toHaveBeenCalledTimes(3);
});

it('reuses request identity if the queue response is lost', async () => {
  const keys: string[] = [];
  const fetch = vi.fn(async (url, init) => {
    if (url.endsWith('/ai-designer-brief')) {
      keys.push(JSON.parse(init.body).idempotencyKey);
      if (keys.length === 1) throw new TypeError('Connection lost after acceptance');
      return response({ jobRef: 'existing-job', pollAfterMs: 1000 });
    }
    return url.endsWith('/ai-designer-worker-background') ? new Response('', { status: 202 }) : response(complete);
  });
  vi.stubGlobal('fetch', fetch);
  const request = () => runBackgroundJob(startPath, { brief: 'lost-response-test' }, new AbortController().signal, 'Waiting', vi.fn(), undefined, job => { pending = job; });
  await expect(request()).rejects.toThrow('Connection lost');
  const result = request();
  await new Promise<void>(resolve => setImmediate(resolve)); await vi.advanceTimersByTimeAsync(1100);
  expect(await result).toEqual(complete); expect(keys[0]).toBe(keys[1]);
});

it('preserves the server retry delay and request identity when queueing is rate limited', async () => {
  const keys: string[] = [];
  const fetch = vi.fn(async (url, init) => {
    if (url.endsWith('/ai-designer-fit')) {
      keys.push(JSON.parse(init.body).idempotencyKey);
      return response({ message: 'Please wait' }, 429, { 'Retry-After': '47' });
    }
    throw new Error('No worker may be dispatched after rejection');
  });
  vi.stubGlobal('fetch', fetch);
  const run = () => runBackgroundJob('/.netlify/functions/ai-designer-fit', { attempt: 1, widthIn: 120, heightIn: 36 }, new AbortController().signal, 'Waiting', vi.fn());
  const error = await run().catch(error => error);
  expect(error).toBeInstanceOf(AIRequestRateLimitError);
  expect(error.retryAt - Date.now()).toBe(47_000);
  await expect(run()).rejects.toBeInstanceOf(AIRequestRateLimitError);
  expect(keys[0]).toBe(keys[1]);
  const saved = JSON.parse(sessionStorage.getItem('banners_ai_designer_pending_job')!);
  forgetPendingJob(saved);
});
