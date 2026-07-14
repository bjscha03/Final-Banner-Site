type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  uploadUrl: string;
  maxBytes: number;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  resource_type?: string;
  error?: { message?: string };
};

const MAX_DIRECT_UPLOAD_ATTEMPTS = 3;
const DIRECT_UPLOAD_TIMEOUT_MS = 180_000;
const NETLIFY_FALLBACK_MAX_BYTES = 4 * 1024 * 1024;

class ArtworkUploadError extends Error {
  status?: number;
  retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ArtworkUploadError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const sleep = (milliseconds: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Upload aborted', 'AbortError'));
    return;
  }
  const timer = window.setTimeout(resolve, milliseconds);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Upload aborted', 'AbortError'));
  }, { once: true });
});

async function waitForConnection(signal?: AbortSignal | null): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new ArtworkUploadError('The internet connection is offline.', { retryable: true }));
    }, 15_000);
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
    };
    window.addEventListener('online', onOnline, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function getUploadFile(formData: FormData): File | null {
  const candidate = formData.get('file');
  if (candidate instanceof File) return candidate;
  if (candidate instanceof Blob) {
    const filename = typeof (candidate as File).name === 'string'
      ? (candidate as File).name
      : `artwork-${Date.now()}`;
    return new File([candidate], filename, { type: candidate.type || 'application/octet-stream' });
  }
  return null;
}

function isUploadFileRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST') return false;

  const rawUrl = input instanceof Request ? input.url : String(input);
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, window.location.origin).pathname;
  } catch {
    // Keep the raw value for relative URLs that URL() could not parse.
  }
  return pathname === '/.netlify/functions/upload-file';
}

async function requestUploadSignature(
  nativeFetch: typeof window.fetch,
  file: File,
  signal?: AbortSignal | null,
): Promise<UploadSignature> {
  const response = await nativeFetch('/.netlify/functions/create-upload-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal || undefined,
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });

  const raw = await response.text().catch(() => '');
  let result: any = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new ArtworkUploadError(
      result.message || result.error || `Unable to prepare artwork upload (${response.status}).`,
      { status: response.status, retryable: response.status >= 500 || response.status === 408 || response.status === 429 },
    );
  }

  return result as UploadSignature;
}

function uploadDirectlyToCloudinary(
  file: File,
  signed: UploadSignature,
  signal?: AbortSignal | null,
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    };
    const finishResolve = (value: CloudinaryUploadResponse) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => {
      xhr.abort();
      finishReject(new DOMException('Upload aborted', 'AbortError'));
    };

    xhr.open('POST', signed.uploadUrl, true);
    xhr.timeout = DIRECT_UPLOAD_TIMEOUT_MS;
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      window.dispatchEvent(new CustomEvent('botf-artwork-upload-progress', {
        detail: {
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
          filename: file.name,
        },
      }));
    };

    xhr.onerror = () => finishReject(new ArtworkUploadError(
      'The network changed while uploading the artwork.',
      { retryable: true },
    ));
    xhr.ontimeout = () => finishReject(new ArtworkUploadError(
      'Artwork upload timed out.',
      { retryable: true },
    ));
    xhr.onabort = () => finishReject(new DOMException('Upload aborted', 'AbortError'));
    xhr.onload = () => {
      const result: CloudinaryUploadResponse = xhr.response && typeof xhr.response === 'object'
        ? xhr.response
        : (() => {
            try { return JSON.parse(xhr.responseText || '{}'); }
            catch { return {}; }
          })();

      if (xhr.status < 200 || xhr.status >= 300 || !result.secure_url || !result.public_id) {
        const message = result.error?.message || `Cloudinary upload failed (${xhr.status || 'network error'}).`;
        finishReject(new ArtworkUploadError(message, {
          status: xhr.status || undefined,
          retryable: xhr.status === 0 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500,
        }));
        return;
      }
      finishResolve(result);
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('api_key', signed.apiKey);
    formData.append('timestamp', String(signed.timestamp));
    formData.append('signature', signed.signature);
    formData.append('folder', signed.folder);
    formData.append('public_id', signed.publicId);
    xhr.send(formData);
  });
}

async function performDirectUpload(
  nativeFetch: typeof window.fetch,
  file: File,
  signal?: AbortSignal | null,
): Promise<Response> {
  await waitForConnection(signal);
  const signed = await requestUploadSignature(nativeFetch, file, signal);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_DIRECT_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      await waitForConnection(signal);
      const result = await uploadDirectlyToCloudinary(file, signed, signal);
      const normalized = {
        secureUrl: result.secure_url,
        publicId: result.public_id,
        fileKey: result.public_id,
        width: result.width ?? null,
        height: result.height ?? null,
        bytes: result.bytes ?? file.size,
        format: result.format || file.name.split('.').pop()?.toLowerCase() || null,
        resourceType: result.resource_type || signed.resourceType,
        originalPreserved: true,
        uploadTransport: 'direct_signed_cloudinary',
      };
      return new Response(JSON.stringify(normalized), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      lastError = error;
      if ((error as { name?: string })?.name === 'AbortError') throw error;
      const retryable = error instanceof ArtworkUploadError ? error.retryable : true;
      if (!retryable || attempt >= MAX_DIRECT_UPLOAD_ATTEMPTS) break;
      await sleep(900 * (2 ** (attempt - 1)), signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ArtworkUploadError('Artwork upload failed after multiple attempts.');
}

declare global {
  interface Window {
    __BOTF_DIRECT_ARTWORK_UPLOAD_INSTALLED__?: boolean;
  }
}

/**
 * Compatibility bridge for existing upload flows. It intercepts only POSTs to
 * /.netlify/functions/upload-file, obtains a short-lived server signature, and
 * sends the original File directly to Cloudinary. This avoids Netlify's
 * buffered-function request-size ceiling and preserves the exact selected bytes.
 */
export function installDirectArtworkUploadBridge(): void {
  if (typeof window === 'undefined' || window.__BOTF_DIRECT_ARTWORK_UPLOAD_INSTALLED__) return;

  const nativeFetch = window.fetch.bind(window);
  window.__BOTF_DIRECT_ARTWORK_UPLOAD_INSTALLED__ = true;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isUploadFileRequest(input, init) || !(init?.body instanceof FormData)) {
      return nativeFetch(input, init);
    }

    const file = getUploadFile(init.body);
    if (!file) return nativeFetch(input, init);

    try {
      return await performDirectUpload(nativeFetch, file, init.signal);
    } catch (directError) {
      console.error('[DIRECT_ARTWORK_UPLOAD] direct upload failed', {
        name: file.name,
        size: file.size,
        type: file.type,
        error: directError instanceof Error ? directError.message : String(directError),
      });

      // Preserve the old endpoint as a small-file compatibility fallback only.
      // Large uploads must never be pushed through a buffered Netlify Function.
      if (file.size <= NETLIFY_FALLBACK_MAX_BYTES && (directError as { name?: string })?.name !== 'AbortError') {
        return nativeFetch(input, init);
      }
      throw directError;
    }
  }) as typeof window.fetch;
}
