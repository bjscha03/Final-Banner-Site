import {
  ArtworkUploadError, normalizeUploadResponse, uploadArtworkFile,
  type UploadArtworkOptions, type ArtworkUploadResult,
} from './uploadArtworkFile';

const ENDPOINT = '/.netlify/functions/artwork-original-upload';
type OriginalUploadState = {
  session: { id: string; token: string; chunkBytes: number };
  previewUrl: string; width: number; height: number;
  nextOffset: number; createdAt: number;
};
// Keep recovery tied to the exact File object, in memory only. A customer can
// retry without re-sending confirmed chunks or persisting upload credentials.
const pendingOriginals = new WeakMap<File, OriginalUploadState>();

// Fetch has no upload progress events. Report bytes within each chunk so a
// slow but healthy large upload does not look stalled to the page watchdog.
export function sendArtworkChunk(url: string, body: Blob, token: string, signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      finish(() => reject(new DOMException('Upload cancelled', 'AbortError')));
      xhr.abort();
    };
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Artwork-Token', token);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => finish(() => resolve(new Response(xhr.responseText, { status: xhr.status })));
    xhr.onerror = () => finish(() => reject(new ArtworkUploadError('Artwork upload connection interrupted.', { phase: 'chunked', retryable: true })));
    xhr.ontimeout = () => finish(() => reject(new ArtworkUploadError('Artwork chunk timed out.', { phase: 'chunked', retryable: true })));
    xhr.onabort = () => finish(() => reject(new DOMException('Upload cancelled', 'AbortError')));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(body);
  });
}

async function request(action: string, body: BodyInit, options: UploadArtworkOptions, session?: { id: string; token: string }, index?: number, onProgress?: (fraction: number) => void) {
  const query = new URLSearchParams({ action });
  if (session) query.set('id', session.id);
  if (index != null) query.set('index', String(index));
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = window.setTimeout(abort, 120_000);
    try {
      const response = action === 'chunk' && session && body instanceof Blob
        ? await sendArtworkChunk(`${ENDPOINT}?${query}`, body, session.token, controller.signal, onProgress)
        : await fetch(`${ENDPOINT}?${query}`, {
        method: 'POST', body, signal: controller.signal,
        headers: { 'Content-Type': action === 'chunk' ? 'application/octet-stream' : 'application/json', ...(session ? { 'X-Artwork-Token': session.token } : {}) },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ArtworkUploadError(data.error || `Artwork upload failed (${response.status}).`, {
        phase: 'chunked', status: response.status, retryable: response.status >= 500 || response.status === 408 || response.status === 429,
      });
      return data;
    } catch (error) {
      if (options.signal?.aborted || attempt === 3 || (error instanceof ArtworkUploadError && !error.retryable)) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 600 * attempt));
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
  throw new Error('Artwork upload did not complete');
}

async function makePreview(file: File, options: UploadArtworkOptions): Promise<{ file: File; width: number; height: number }> {
  let localUrl = options.previewUrl;
  let cleanup = () => {};
  if (!localUrl) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const { renderPdfToDataUrl } = await import('./pdf/renderPdfToDataUrl');
      const pdf = await renderPdfToDataUrl(file, { targetWidth: 1800, maxPixels: 2_500_000, signal: options.signal });
      localUrl = pdf.previewUrl;
      cleanup = pdf.cleanup;
    } else {
      localUrl = URL.createObjectURL(file);
      cleanup = () => URL.revokeObjectURL(localUrl!);
    }
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const timeout = window.setTimeout(() => reject(new Error('Artwork preview timed out')), 30_000);
      image.onload = () => { window.clearTimeout(timeout); resolve(image); };
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Artwork preview could not be read')); };
      image.src = localUrl!;
    });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork preview renderer unavailable');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Artwork preview could not be saved')), 'image/png'));
    canvas.width = canvas.height = 1;
    return { file: new File([blob], 'artwork-preview.png', { type: 'image/png' }), width: options.originalWidth || img.naturalWidth, height: options.originalHeight || img.naturalHeight };
  } finally { cleanup(); }
}

export async function uploadLargeArtworkFile(file: File, options: UploadArtworkOptions): Promise<ArtworkUploadResult> {
  let state = pendingOriginals.get(file);
  if (state && Date.now() - state.createdAt >= 90 * 60_000) {
    pendingOriginals.delete(file);
    state = undefined;
  }
  if (!state) {
    const preview = await makePreview(file, options);
    // Preview upload uses the established small-file path. Production always
    // points to the untouched original below, never to this display image.
    const savedPreview = await uploadArtworkFile(preview.file, { signal: options.signal });
    const session = await request('start', JSON.stringify({ fileName: file.name, size: file.size }), options);
    if (!session.id || !session.token || !Number.isSafeInteger(session.chunkBytes) || session.chunkBytes <= 0 || session.chunkBytes > 3 * 1024 * 1024) {
      throw new ArtworkUploadError('Artwork upload session was incomplete.', { phase: 'ticket', retryable: true });
    }
    state = { session, previewUrl: savedPreview.secureUrl, width: preview.width, height: preview.height, nextOffset: 0, createdAt: Date.now() };
    pendingOriginals.set(file, state);
  }
  const { session } = state;
  options.onProgress?.(0.95 * state.nextOffset / file.size);
  try {
    for (let offset = state.nextOffset; offset < file.size; offset += session.chunkBytes) {
      const index = offset / session.chunkBytes;
      const end = Math.min(offset + session.chunkBytes, file.size);
      await request('chunk', file.slice(offset, end), options, session, index, fraction => {
        options.onProgress?.(0.95 * (offset + fraction * (end - offset)) / file.size);
      });
      state.nextOffset = end;
      options.onProgress?.(0.95 * end / file.size);
    }
    const result = await request('complete', JSON.stringify({ previewUrl: state.previewUrl, width: state.width, height: state.height }), options, session);
    const normalized = normalizeUploadResponse(result, file, 'netlify-original');
    options.onProgress?.(1);
    pendingOriginals.delete(file);
    return normalized;
  } catch (error) {
    // Retain progress for network/timeout/cancel recovery, but never reuse an
    // expired, unauthorized, or conflicting upload session.
    if (error instanceof ArtworkUploadError && [403, 409, 410].includes(error.status || 0)) pendingOriginals.delete(file);
    throw error;
  }
}
