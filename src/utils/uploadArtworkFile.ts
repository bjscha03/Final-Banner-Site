import type { ArtworkManifest } from '@/types/artwork';

export const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;
export const LEGACY_FUNCTION_SAFE_BYTES = 3.75 * 1024 * 1024;
export const DIRECT_UPLOAD_ATTEMPTS = 3;

const SIGNATURE_ENDPOINT = '/.netlify/functions/cloudinary-upload-signature';
const LEGACY_UPLOAD_ENDPOINT = '/.netlify/functions/upload-file';
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

export interface ArtworkUploadTicket {
  apiKey: string;
  cloudName: string;
  expiresAt: number;
  folder: string;
  overwrite?: boolean;
  resourceType: 'image';
  signature: string;
  timestamp: number;
  uniqueFilename: boolean;
  uploadUrl: string;
  useFilename: boolean;
}

export interface ArtworkUploadResult {
  secureUrl: string;
  productionUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
  fileKey: string;
  publicId: string;
  productionPublicId: string;
  bytes: number;
  width: number | null;
  height: number | null;
  format: string;
  resourceType: string;
  mimeType: string;
  assetId: string | null;
  version: number | null;
  uploadedAt: string;
  artworkManifest: ArtworkManifest;
  transport: 'cloudinary-direct' | 'netlify-legacy-fallback';
}

export interface UploadArtworkOptions {
  correlationId?: string;
  onAttempt?: (attempt: number, maximum: number) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

class ArtworkUploadError extends Error {
  status: number | null;
  retryable: boolean;

  constructor(message: string, options: { status?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ArtworkUploadError';
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

const extensionOf = (fileName: string) => {
  const match = String(fileName || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

export function isPdfArtwork(file: Pick<File, 'name' | 'type'>): boolean {
  return String(file.type || '').toLowerCase() === 'application/pdf'
    || extensionOf(file.name) === 'pdf';
}

export function validateArtworkFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const mimeType = String(file.type || '').trim().toLowerCase();
  const extension = extensionOf(file.name);
  if (!ALLOWED_MIME_TYPES.has(mimeType) && !ALLOWED_EXTENSIONS.has(extension)) {
    return 'Please upload a PDF, PNG, JPG, or JPEG file.';
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'The selected file is empty. Please choose a different file.';
  }
  if (file.size > MAX_ARTWORK_BYTES) {
    return 'File too large. Please upload a file under 50MB.';
  }
  return null;
}

export function buildCloudinaryPdfPreviewUrl(url: string): string {
  if (!url || !/\.pdf(?:$|[?#])/i.test(url) || !url.includes('/image/upload/')) return url;
  const transformed = url.includes('/image/upload/pg_1,')
    ? url
    : url.replace(
        '/image/upload/',
        '/image/upload/pg_1,f_jpg,q_auto:good,w_1800,c_limit/',
      );
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
}

const sleep = (milliseconds: number) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const messageFromPayload = (payload: any, fallback: string): string => {
  const message = payload?.error?.message
    || payload?.message
    || payload?.error
    || payload?.details;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
};

const withTimeoutSignal = (
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onAbort);
    },
  };
};

async function requestUploadTicket(
  file: File,
  options: UploadArtworkOptions,
): Promise<ArtworkUploadTicket> {
  const timed = withTimeoutSignal(15_000, options.signal);
  try {
    const response = await fetch(SIGNATURE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlationId: options.correlationId || null,
        fileName: file.name,
        mimeType: file.type || null,
        size: file.size,
      }),
      signal: timed.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ArtworkUploadError(
        messageFromPayload(payload, `Could not prepare upload (${response.status}).`),
        { status: response.status, retryable: response.status >= 500 || response.status === 408 || response.status === 429 },
      );
    }
    if (!payload?.uploadUrl || !payload?.apiKey || !payload?.signature || !payload?.timestamp) {
      throw new ArtworkUploadError('The upload ticket was incomplete.', { retryable: true });
    }
    return payload as ArtworkUploadTicket;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ArtworkUploadError('Preparing the upload timed out.', { retryable: true });
    }
    if (error instanceof ArtworkUploadError) throw error;
    throw new ArtworkUploadError(
      error instanceof Error ? error.message : 'Could not prepare artwork upload.',
      { retryable: true },
    );
  } finally {
    timed.cleanup();
  }
}

function uploadDirectWithProgress(
  file: File,
  ticket: ArtworkUploadTicket,
  options: UploadArtworkOptions,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => {
      xhr.abort();
      finish(() => reject(new ArtworkUploadError('Artwork upload was cancelled.', { retryable: false })));
    };

    xhr.open('POST', ticket.uploadUrl, true);
    xhr.responseType = 'json';
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.max(0, Math.min(1, event.loaded / event.total)));
    };
    xhr.onload = () => {
      const payload = xhr.response && typeof xhr.response === 'object'
        ? xhr.response
        : (() => {
            try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; }
          })();
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(() => resolve(payload));
        return;
      }
      const retryable = xhr.status === 408
        || xhr.status === 409
        || xhr.status === 420
        || xhr.status === 429
        || xhr.status >= 500;
      finish(() => reject(new ArtworkUploadError(
        messageFromPayload(payload, `Cloudinary upload failed (${xhr.status}).`),
        { status: xhr.status, retryable },
      )));
    };
    xhr.onerror = () => finish(() => reject(new ArtworkUploadError(
      'The connection was interrupted while uploading artwork.',
      { retryable: true },
    )));
    xhr.ontimeout = () => finish(() => reject(new ArtworkUploadError(
      'The artwork upload timed out.',
      { retryable: true },
    )));
    xhr.onabort = () => {
      if (!settled) finish(() => reject(new ArtworkUploadError('Artwork upload was cancelled.')));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('api_key', ticket.apiKey);
    formData.append('timestamp', String(ticket.timestamp));
    formData.append('signature', ticket.signature);
    formData.append('folder', ticket.folder);
    formData.append('use_filename', ticket.useFilename ? 'true' : 'false');
    formData.append('unique_filename', ticket.uniqueFilename ? 'true' : 'false');
    if (typeof ticket.overwrite === 'boolean') {
      formData.append('overwrite', ticket.overwrite ? 'true' : 'false');
    }
    xhr.send(formData);
  });
}

async function uploadThroughLegacyFunction(
  file: File,
  options: UploadArtworkOptions,
): Promise<any> {
  const timed = withTimeoutSignal(75_000, options.signal);
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const response = await fetch(LEGACY_UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: timed.signal,
    });
    const payload = await response.json().catch(async () => ({
      error: await response.text().catch(() => ''),
    }));
    if (!response.ok) {
      throw new ArtworkUploadError(
        messageFromPayload(payload, `Fallback upload failed (${response.status}).`),
        { status: response.status, retryable: false },
      );
    }
    return payload;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ArtworkUploadError('Fallback upload timed out.', { retryable: false });
    }
    throw error;
  } finally {
    timed.cleanup();
  }
}

function normalizeUploadResponse(
  payload: any,
  file: File,
  transport: ArtworkUploadResult['transport'],
): ArtworkUploadResult {
  const secureUrl = String(
    payload?.secure_url
      || payload?.secureUrl
      || payload?.productionUrl
      || payload?.url
      || '',
  ).trim();
  const publicId = String(
    payload?.public_id
      || payload?.publicId
      || payload?.productionPublicId
      || payload?.fileKey
      || '',
  ).trim();
  if (!secureUrl || !publicId) {
    throw new ArtworkUploadError('Upload completed without a permanent artwork URL.', { retryable: true });
  }

  const pdf = isPdfArtwork(file);
  const previewUrl = pdf ? buildCloudinaryPdfPreviewUrl(secureUrl) : secureUrl;
  const uploadedAt = new Date().toISOString();
  const format = String(payload?.format || extensionOf(file.name) || (pdf ? 'pdf' : 'jpg'));
  const resourceType = String(payload?.resource_type || payload?.resourceType || 'image');
  const bytes = Number(payload?.bytes || file.size);
  const width = Number.isFinite(Number(payload?.width)) && Number(payload?.width) > 0
    ? Number(payload.width)
    : null;
  const height = Number.isFinite(Number(payload?.height)) && Number(payload?.height) > 0
    ? Number(payload.height)
    : null;
  const assetId = payload?.asset_id || payload?.assetId || null;
  const version = Number.isFinite(Number(payload?.version)) ? Number(payload.version) : null;
  const mimeType = file.type || (pdf ? 'application/pdf' : `image/${format}`);
  const artworkManifest: ArtworkManifest = {
    originalUrl: secureUrl,
    publicId,
    assetId,
    version,
    resourceType,
    format,
    mimeType,
    originalFilename: file.name,
    bytes,
    width,
    height,
    sha256: payload?.sha256 || null,
    uploadStatus: 'uploaded',
    uploadedAt,
  };

  return {
    secureUrl,
    productionUrl: secureUrl,
    previewUrl,
    thumbnailUrl: previewUrl,
    fileKey: publicId,
    publicId,
    productionPublicId: publicId,
    bytes,
    width,
    height,
    format,
    resourceType,
    mimeType,
    assetId,
    version,
    uploadedAt,
    artworkManifest,
    transport,
  };
}

/**
 * Upload the original customer file directly from the browser to Cloudinary.
 * Only the small signed ticket traverses Netlify, avoiding Netlify's effective
 * ~4.5MB binary request limit. The original bytes are never recompressed.
 */
export async function uploadArtworkFile(
  file: File,
  options: UploadArtworkOptions = {},
): Promise<ArtworkUploadResult> {
  const validationError = validateArtworkFile(file);
  if (validationError) throw new ArtworkUploadError(validationError, { retryable: false });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= DIRECT_UPLOAD_ATTEMPTS; attempt += 1) {
    options.onAttempt?.(attempt, DIRECT_UPLOAD_ATTEMPTS);
    try {
      const ticket = await requestUploadTicket(file, options);
      const payload = await uploadDirectWithProgress(file, ticket, options);
      options.onProgress?.(1);
      return normalizeUploadResponse(payload, file, 'cloudinary-direct');
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      const retryable = error instanceof ArtworkUploadError ? error.retryable : true;
      if (!retryable || attempt >= DIRECT_UPLOAD_ATTEMPTS) break;
      const delay = (600 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }

  // Existing upload endpoint remains as a conservative same-origin fallback
  // only for files that fit safely inside Netlify's binary request envelope.
  if (file.size <= LEGACY_FUNCTION_SAFE_BYTES && !options.signal?.aborted) {
    try {
      const payload = await uploadThroughLegacyFunction(file, options);
      options.onProgress?.(1);
      return normalizeUploadResponse(payload, file, 'netlify-legacy-fallback');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new ArtworkUploadError('Artwork upload failed. Please check your connection and try again.');
}
