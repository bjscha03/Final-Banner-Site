import type { ArtworkManifest } from '@/types/artwork';
import { withUploadDeadline } from './uploadDeadline';

export const MAX_ARTWORK_MB = 300;
export const MAX_ARTWORK_BYTES = MAX_ARTWORK_MB * 1024 * 1024;
export const CLOUDINARY_ARTWORK_BYTES = 20 * 1024 * 1024;
export const ARTWORK_SIZE_MESSAGE = `This file exceeds ${MAX_ARTWORK_MB}MB. Please email support@bannersonthefly.com a download link so we can help with your artwork.`;
export const LEGACY_FUNCTION_SAFE_BYTES = 3.75 * 1024 * 1024;
export const DIRECT_UPLOAD_ATTEMPTS = 3;
export const CHUNKED_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export const UPLOAD_STALL_TIMEOUT_MS = 30_000;
export const SAME_ORIGIN_UPLOAD_TIMEOUT_MS = 20_000;

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
  transport: 'cloudinary-direct' | 'netlify-same-origin' | 'netlify-legacy-fallback' | 'netlify-original';
}

export interface UploadArtworkOptions {
  correlationId?: string;
  onAttempt?: (attempt: number, maximum: number) => void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Existing local preview; only the preview may be resized, never the original. */
  previewUrl?: string;
  originalWidth?: number | null;
  originalHeight?: number | null;
}

export type ArtworkUploadPhase =
  | 'validation'
  | 'ticket'
  | 'direct'
  | 'chunked'
  | 'fallback'
  | 'response';

export interface ArtworkUploadDiagnostic {
  phase: ArtworkUploadPhase;
  retryable: boolean;
  status: number | null;
  sizeBucket: 'under-4mb' | '4mb-8mb' | '8mb-20mb' | '20mb-50mb' | '50mb-300mb' | 'over-300mb';
  mimeType: 'pdf' | 'png' | 'jpeg' | 'unknown';
}

export class ArtworkUploadError extends Error {
  phase: ArtworkUploadPhase;
  status: number | null;
  retryable: boolean;

  constructor(
    message: string,
    options: {
      phase?: ArtworkUploadPhase;
      status?: number | null;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ArtworkUploadError';
    this.phase = options.phase ?? 'response';
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function getArtworkUploadDiagnostic(
  error: unknown,
  file: Pick<File, 'size' | 'type' | 'name'>,
): ArtworkUploadDiagnostic {
  const sizeBucket = file.size < 4 * 1024 * 1024
    ? 'under-4mb'
    : file.size < 8 * 1024 * 1024
      ? '4mb-8mb'
      : file.size < 20 * 1024 * 1024
        ? '8mb-20mb'
        : file.size <= 50 * 1024 * 1024
          ? '20mb-50mb'
          : file.size <= MAX_ARTWORK_BYTES ? '50mb-300mb' : 'over-300mb';
  const normalizedType = String(file.type || '').toLowerCase();
  const extension = extensionOf(file.name);
  const mimeType = normalizedType === 'application/pdf' || extension === 'pdf'
    ? 'pdf'
    : normalizedType === 'image/png' || extension === 'png'
      ? 'png'
      : normalizedType === 'image/jpeg' || normalizedType === 'image/jpg' || extension === 'jpg' || extension === 'jpeg'
        ? 'jpeg'
        : 'unknown';
  return {
    phase: error instanceof ArtworkUploadError ? error.phase : 'response',
    retryable: error instanceof ArtworkUploadError ? error.retryable : false,
    status: error instanceof ArtworkUploadError ? error.status : null,
    sizeBucket,
    mimeType,
  };
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
    return ARTWORK_SIZE_MESSAGE;
  }
  return null;
}

export function getArtworkUploadMessage(error: unknown): string {
  if (error instanceof ArtworkUploadError) {
    if (error.phase === 'validation') return error.message;
    if (error.status === 413 || /file size too large|maximum.*20971520/i.test(error.message)) {
      return 'We could not store this artwork. Please retry, or contact support@bannersonthefly.com.';
    }
    if (error.status === 400 || error.status === 415) {
      return `We could not accept this artwork file. Try exporting it as a PDF, PNG, or JPG up to ${MAX_ARTWORK_MB}MB, or email support@bannersonthefly.com for help.`;
    }
    if (error.phase === 'ticket' || error.status === 401 || error.status === 403 || (error.status ?? 0) >= 500) {
      return 'Artwork storage is temporarily unavailable. Your choices are still here. Please retry, or email support@bannersonthefly.com for help.';
    }
  }
  return 'Artwork upload did not finish. Your choices are still here. Please retry the upload, or email support@bannersonthefly.com for help.';
}

export function buildCloudinaryPdfPreviewUrl(url: string): string {
  if (!url || !/\.pdf(?:$|[?#])/i.test(url) || !url.includes('/image/upload/')) return url;
  try {
    if (new URL(url).hostname !== 'res.cloudinary.com') return url;
  } catch {
    return url;
  }
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

async function requestUploadTicket(
  file: File,
  options: UploadArtworkOptions,
): Promise<ArtworkUploadTicket> {
  try {
    return await withUploadDeadline(async (signal) => {
      const response = await fetch(SIGNATURE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlationId: options.correlationId || null,
          fileName: file.name,
          mimeType: file.type || null,
          size: file.size,
        }),
        signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ArtworkUploadError(
          messageFromPayload(payload, `Could not prepare upload (${response.status}).`),
          {
            phase: 'ticket',
            status: response.status,
            retryable: response.status >= 500 || response.status === 408 || response.status === 429,
          },
        );
      }
      if (!payload?.uploadUrl || !payload?.apiKey || !payload?.signature || !payload?.timestamp) {
        throw new ArtworkUploadError('The upload ticket was incomplete.', { phase: 'ticket', retryable: true });
      }
      return payload as ArtworkUploadTicket;
    }, 15_000, options.signal);
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ArtworkUploadError('Preparing the upload timed out.', { phase: 'ticket', retryable: true });
    }
    if (error instanceof ArtworkUploadError) throw error;
    throw new ArtworkUploadError(
      error instanceof Error ? error.message : 'Could not prepare artwork upload.',
      { phase: 'ticket', retryable: true },
    );
  }
}

function appendTicketFields(formData: FormData, ticket: ArtworkUploadTicket): void {
  formData.append('api_key', ticket.apiKey);
  formData.append('timestamp', String(ticket.timestamp));
  formData.append('signature', ticket.signature);
  formData.append('folder', ticket.folder);
  formData.append('use_filename', ticket.useFilename ? 'true' : 'false');
  formData.append('unique_filename', ticket.uniqueFilename ? 'true' : 'false');
  if (typeof ticket.overwrite === 'boolean') {
    formData.append('overwrite', ticket.overwrite ? 'true' : 'false');
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
    let stallTimer: ReturnType<typeof setTimeout>;
    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        finish(() => reject(new ArtworkUploadError(
          'Artwork upload stopped making progress.',
          { phase: 'direct', retryable: true },
        )));
        xhr.abort();
      }, UPLOAD_STALL_TIMEOUT_MS);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      options.signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => {
      xhr.abort();
      finish(() => reject(new ArtworkUploadError('Artwork upload was cancelled.', { phase: 'direct', retryable: false })));
    };

    xhr.open('POST', ticket.uploadUrl, true);
    xhr.responseType = 'json';
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (event) => {
      resetStallTimer();
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
        { phase: 'direct', status: xhr.status, retryable },
      )));
    };
    xhr.onerror = () => finish(() => reject(new ArtworkUploadError(
      'The connection was interrupted while uploading artwork.',
      { phase: 'direct', retryable: true },
    )));
    xhr.ontimeout = () => finish(() => reject(new ArtworkUploadError(
      'The artwork upload timed out.',
      { phase: 'direct', retryable: true },
    )));
    xhr.onabort = () => {
      if (!settled) finish(() => reject(new ArtworkUploadError('Artwork upload was cancelled.', { phase: 'direct' })));
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
    appendTicketFields(formData, ticket);
    resetStallTimer();
    xhr.send(formData);
  });
}

function createChunkUploadId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the non-cryptographic uniqueness fallback. This value is
    // only a transport correlation key, never an authorization credential.
  }
  return `artwork-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function uploadChunkWithProgress(
  file: File,
  ticket: ArtworkUploadTicket,
  options: UploadArtworkOptions,
  uploadId: string,
  start: number,
  end: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout>;
    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        finish(() => reject(new ArtworkUploadError(
          'Artwork upload stopped making progress.',
          { phase: 'chunked', retryable: true },
        )));
        xhr.abort();
      }, UPLOAD_STALL_TIMEOUT_MS);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      options.signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => {
      xhr.abort();
      finish(() => reject(new ArtworkUploadError(
        'Artwork upload was cancelled.',
        { phase: 'chunked', retryable: false },
      )));
    };

    xhr.open('POST', ticket.uploadUrl, true);
    xhr.responseType = 'json';
    xhr.timeout = 180_000;
    xhr.setRequestHeader('X-Unique-Upload-Id', uploadId);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
    xhr.upload.onprogress = (event) => {
      resetStallTimer();
      if (!event.lengthComputable || event.total <= 0) return;
      const uploadedBytes = start + Math.min(event.loaded, end - start + 1);
      options.onProgress?.(Math.max(0, Math.min(1, uploadedBytes / file.size)));
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
        messageFromPayload(payload, `Chunked artwork upload failed (${xhr.status}).`),
        { phase: 'chunked', status: xhr.status, retryable },
      )));
    };
    xhr.onerror = () => finish(() => reject(new ArtworkUploadError(
      'The connection was interrupted while uploading an artwork chunk.',
      { phase: 'chunked', retryable: true },
    )));
    xhr.ontimeout = () => finish(() => reject(new ArtworkUploadError(
      'The artwork chunk upload timed out.',
      { phase: 'chunked', retryable: true },
    )));
    xhr.onabort = () => {
      if (!settled) finish(() => reject(new ArtworkUploadError(
        'Artwork upload was cancelled.',
        { phase: 'chunked' },
      )));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    const chunk = file.slice(start, end + 1, file.type || undefined);
    const formData = new FormData();
    formData.append('file', chunk, file.name);
    appendTicketFields(formData, ticket);
    resetStallTimer();
    xhr.send(formData);
  });
}

async function uploadChunkedWithProgress(
  file: File,
  ticket: ArtworkUploadTicket,
  options: UploadArtworkOptions,
): Promise<any> {
  const uploadId = createChunkUploadId();
  let finalPayload: any = null;
  for (let start = 0; start < file.size; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, file.size) - 1;
    finalPayload = await uploadChunkWithProgress(
      file,
      ticket,
      options,
      uploadId,
      start,
      end,
    );
    options.onProgress?.((end + 1) / file.size);
  }
  return finalPayload;
}

async function uploadThroughLegacyFunction(
  file: File,
  options: UploadArtworkOptions,
): Promise<any> {
  try {
    return await withUploadDeadline(async (signal) => {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const response = await fetch(LEGACY_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData,
        signal,
      });
      const payload = await response.json().catch(async () => ({
        error: await response.text().catch(() => ''),
      }));
      if (!response.ok) {
        throw new ArtworkUploadError(
          messageFromPayload(payload, `Same-origin upload failed (${response.status}).`),
          { phase: 'fallback', status: response.status, retryable: false },
        );
      }
      return payload;
    }, SAME_ORIGIN_UPLOAD_TIMEOUT_MS, options.signal);
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ArtworkUploadError('Same-origin upload timed out.', { phase: 'fallback', retryable: false });
    }
    throw error;
  }
}

export function normalizeUploadResponse(
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
    throw new ArtworkUploadError('Upload completed without a permanent artwork URL.', { phase: 'response', retryable: true });
  }

  const pdf = isPdfArtwork(file);
  const previewUrl = transport === 'netlify-original' && payload.previewUrl
    ? payload.previewUrl
    : pdf ? buildCloudinaryPdfPreviewUrl(secureUrl) : secureUrl;
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
 * Small originals use the site's own endpoint, avoiding a cross-origin mobile
 * upload connection. Larger files go directly to storage to stay below Netlify's
 * binary request limit. The original bytes are never recompressed.
 */
export async function uploadArtworkFile(
  file: File,
  options: UploadArtworkOptions = {},
): Promise<ArtworkUploadResult> {
  const validationError = validateArtworkFile(file);
  if (validationError) {
    throw new ArtworkUploadError(validationError, { phase: 'validation', retryable: false });
  }

  if (file.size > CLOUDINARY_ARTWORK_BYTES) {
    const { uploadLargeArtworkFile } = await import('./uploadLargeArtworkFile');
    return uploadLargeArtworkFile(file, options);
  }

  let lastError: unknown = null;
  if (file.size <= LEGACY_FUNCTION_SAFE_BYTES) {
    try {
      const payload = await uploadThroughLegacyFunction(file, options);
      const result = normalizeUploadResponse(payload, file, 'netlify-same-origin');
      options.onProgress?.(1);
      return result;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastError = error;
    }
  }

  const useChunkedUpload = file.size >= CHUNKED_UPLOAD_THRESHOLD_BYTES;
  for (let attempt = 1; attempt <= DIRECT_UPLOAD_ATTEMPTS; attempt += 1) {
    options.onAttempt?.(attempt, DIRECT_UPLOAD_ATTEMPTS);
    try {
      const ticket = await requestUploadTicket(file, options);
      const payload = useChunkedUpload
        ? await uploadChunkedWithProgress(file, ticket, options)
        : await uploadDirectWithProgress(file, ticket, options);
      options.onProgress?.(1);
      return normalizeUploadResponse(payload, file, 'cloudinary-direct');
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      const retryable = error instanceof ArtworkUploadError ? error.retryable : true;
      if (!retryable || attempt >= DIRECT_UPLOAD_ATTEMPTS
        || file.size <= LEGACY_FUNCTION_SAFE_BYTES) break;
      const delay = (600 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new ArtworkUploadError(
    'Artwork upload failed. Please check your connection and try again.',
    { phase: useChunkedUpload ? 'chunked' : 'direct' },
  );
}
