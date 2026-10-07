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
afterEach(() => vi.unstubAllGlobals());
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
