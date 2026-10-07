import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendArtworkChunk } from './uploadLargeArtworkFile';

class ChunkXhr {
  static current: ChunkXhr;
  status = 200;
  responseText = '{"uploaded":3145728}';
  timeout = 0;
  upload = { onprogress: null as any };
  onload: any;
  onerror: any;
  ontimeout: any;
  onabort: any;
  headers: Record<string, string> = {};
  body?: Blob;
  constructor() { ChunkXhr.current = this; }
  open = vi.fn();
  setRequestHeader(key: string, value: string) { this.headers[key] = value; }
  send(body: Blob) { this.body = body; }
  abort = vi.fn(() => this.onabort?.());
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function upload(signal = new AbortController().signal) {
  vi.stubGlobal('XMLHttpRequest', ChunkXhr);
  const body = new Blob(['unchanged original file bytes']);
  const progress = vi.fn();
  const result = sendArtworkChunk('/upload?action=chunk&id=test&index=0', body, 'session-token', signal, progress);
  return { result, progress, body, xhr: ChunkXhr.current };
}
describe('large artwork chunk transfer', () => {
  it('sends the original slice with its session token and reports fractional progress', async () => {
    const { result, body, progress, xhr } = upload();
    expect(xhr.body).toBe(body);
    expect(xhr.headers).toEqual({ 'Content-Type': 'application/octet-stream', 'X-Artwork-Token': 'session-token' });
    xhr.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1000 });
    expect(progress).toHaveBeenCalledWith(0.001);
    xhr.onload();
    expect(await (await result).json()).toEqual({ uploaded: 3145728 });
  });
  it('returns rejection status so the existing retry policy can distinguish transient failures', async () => {
    const { result, xhr } = upload();
    xhr.status = 503;
    xhr.responseText = '{"error":"temporarily unavailable"}';
    xhr.onload();
    expect((await result).status).toBe(503);
  });
  it('cancels an active upload and rejects only once', async () => {
    const controller = new AbortController();
    const { result, xhr } = upload(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.abort).toHaveBeenCalledOnce();
    xhr.onload();
  });
  it('does not send a chunk after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    const { result, xhr } = upload(controller.signal);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.body).toBeUndefined();
  });
  it('marks transport timeouts as retryable', async () => {
    const { result, xhr } = upload(); xhr.ontimeout();
    await expect(result).rejects.toMatchObject({ phase: 'chunked', retryable: true });
  });
});

describe('customer retry resumes the same original', () => {
  it.each(['chunk', 'complete'])('retains accepted chunks after a failed %s response', async failureAt => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('Image', class {
      naturalWidth = 720; naturalHeight = 288; onload: any;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('document', { createElement: () => ({
      width: 0, height: 0, getContext: () => ({ drawImage() {} }),
      toBlob: (cb: any) => cb(new Blob(['preview'], { type: 'image/png' })),
    }) });
    let failing = true;
    const sent: number[] = [];
    vi.stubGlobal('XMLHttpRequest', class extends ChunkXhr {
      index = -1;
      open = vi.fn((_method: string, url: string) => { this.index = Number(new URL(url, 'https://test.local').searchParams.get('index')); });
      send(body: Blob) {
        this.body = body; sent.push(this.index);
        queueMicrotask(() => {
          if (failing && failureAt === 'chunk' && this.index === 1) this.onerror();
          else this.onload();
        });
      }
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('upload-file')) return Response.json({ secureUrl: 'https://res.cloudinary.com/test/image/upload/p.png', publicId: 'preview' });
      if (url.includes('action=start')) return Response.json({ id: 'session-1', token: 'token-1', chunkBytes: 3 * 1024 * 1024 });
      if (url.includes('action=complete')) {
        if (failing && failureAt === 'complete') throw new TypeError('Lost final response');
        return Response.json({ secureUrl: 'https://bannersonthefly.com/artwork-original/saved/original.pdf', publicId: 'saved', previewUrl: 'https://res.cloudinary.com/test/image/upload/p.png' });
      }
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { uploadLargeArtworkFile } = await import('./uploadLargeArtworkFile');
    const file = new File([new Uint8Array(6 * 1024 * 1024 + 17)], 'original.pdf', { type: 'application/pdf' });
    const first = uploadLargeArtworkFile(file, { previewUrl: 'blob:preview' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await first).toBeInstanceOf(Error);
    const sentBeforeRetry = sent.length;
    failing = false;
    const second = uploadLargeArtworkFile(file, { previewUrl: 'blob:preview' });
    await vi.runAllTimersAsync();
    expect((await second).transport).toBe('netlify-original');
    expect(sent.slice(sentBeforeRetry)).toEqual(failureAt === 'chunk' ? [1, 2] : []);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('action=start'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('upload-file'))).toHaveLength(1);
    vi.useRealTimers();
  });
});
