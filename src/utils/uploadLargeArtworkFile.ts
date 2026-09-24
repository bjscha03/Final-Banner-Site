import {
  ArtworkUploadError, normalizeUploadResponse, uploadArtworkFile,
  type UploadArtworkOptions, type ArtworkUploadResult,
} from './uploadArtworkFile';

const ENDPOINT = '/.netlify/functions/artwork-original-upload';

async function request(action: string, body: BodyInit, options: UploadArtworkOptions, session?: { id: string; token: string }, index?: number) {
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
      const response = await fetch(`${ENDPOINT}?${query}`, {
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
  const preview = await makePreview(file, options);
  // Preview upload uses the established small-file path. Production always
  // points to the untouched original below, never to this display image.
  const savedPreview = await uploadArtworkFile(preview.file, { signal: options.signal });
  const session = await request('start', JSON.stringify({ fileName: file.name, size: file.size }), options);
  for (let offset = 0, index = 0; offset < file.size; offset += session.chunkBytes, index++) {
    const end = Math.min(offset + session.chunkBytes, file.size);
    await request('chunk', file.slice(offset, end), options, session, index);
    options.onProgress?.(end / file.size);
  }
  const result = await request('complete', JSON.stringify({ previewUrl: savedPreview.secureUrl, width: preview.width, height: preview.height }), options, session);
  return normalizeUploadResponse(result, file, 'netlify-original');
}
