// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestAIAccess } from './aiAccessRequest';
vi.mock('@/lib/serverAuth', () => ({ authorizedHeaders: (headers: unknown) => headers, authenticatedJsonBody: JSON.stringify }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const ready = () => new Response(JSON.stringify({ authorized: true, ready: true, sessionKey: 'same-session' }));
it('recovers a temporary mobile connection failure without starting image work', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ready()); vi.stubGlobal('fetch', fetch);
  const pending = requestAIAccess(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(601);
  expect((await pending).body.ready).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => url.endsWith('/ai-designer-status'))).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('recovers gateway HTML and malformed successful responses', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('Bad gateway', { status: 502 })).mockResolvedValueOnce(new Response('<html>edge error</html>')).mockResolvedValueOnce(ready()); vi.stubGlobal('fetch', fetch);
  const pending = requestAIAccess(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1801);
  expect((await pending).body.authorized).toBe(true); expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([401, 403, 429])('does not retry authorization or rate limit rejection %i', async status => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status })); vi.stubGlobal('fetch', fetch);
  expect((await requestAIAccess(new AbortController().signal)).response.status).toBe(status);
  expect(fetch).toHaveBeenCalledOnce();
});
it('bounds a stalled connection and leaves no retry timer after final failure', async () => {
  const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))); vi.stubGlobal('fetch', fetch);
  const pending = expect(requestAIAccess(new AbortController().signal)).rejects.toThrow('connection is taking too long');
  await vi.advanceTimersByTimeAsync(46_801); await pending;
  expect(fetch).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
});
it('stops retries when the designer is closed', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Offline')); vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  const pending = expect(requestAIAccess(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(1); controller.abort(); await pending;
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
