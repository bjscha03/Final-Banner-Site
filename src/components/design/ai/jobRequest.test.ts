// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { fetchAIRequest } from './jobRequest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const stalledFetch = () => vi.fn((_url, { signal }) => new Promise<Response>((_resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
}));
it('turns a stalled status connection into a recoverable error without retrying paid work', async () => {
  vi.useFakeTimers(); const fetch = stalledFetch(); vi.stubGlobal('fetch', fetch);
  const pending = fetchAIRequest('/.netlify/functions/ai-designer-job');
  const check = expect(pending).rejects.toThrow('Retry the same request to recover its result');
  await vi.advanceTimersByTimeAsync(45_000); await check;
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('preserves deliberate cancellation and clears the connection timer', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', stalledFetch());
  const controller = new AbortController();
  const pending = fetchAIRequest('/.netlify/functions/ai-designer-job', { signal: controller.signal });
  const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); await check;
  expect(vi.getTimerCount()).toBe(0);
});
it('returns successful responses unchanged', async () => {
  vi.useFakeTimers(); const response = new Response('{}');
  vi.stubGlobal('fetch', vi.fn(async () => response));
  expect(await fetchAIRequest('/.netlify/functions/ai-designer-job')).toBe(response);
  expect(vi.getTimerCount()).toBe(0);
});
