import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  CHUNKED_UPLOAD_THRESHOLD_BYTES,
  getArtworkUploadDiagnostic,
  MAX_ARTWORK_BYTES,
  UPLOAD_CHUNK_BYTES,
  uploadArtworkFile,
  validateArtworkFile,
} from './uploadArtworkFile';

class TestFile extends Blob {
  readonly name: string;
  readonly lastModified: number;

  constructor(
    fileBits: BlobPart[],
    fileName: string,
    options: FilePropertyBag = {},
  ) {
    super(fileBits, options);
    this.name = fileName;
    this.lastModified = options.lastModified ?? Date.now();
  }
}

class SuccessfulUploadXhr {
  static sentFormData: FormData | null = null;
  status = 0;
  response: any = null;
  responseText = '';
  responseType = '';
  timeout = 0;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(_method: string, _url: string, _async: boolean) {}

  send(body: FormData) {
    SuccessfulUploadXhr.sentFormData = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    window.setTimeout(() => {
      this.status = 200;
      this.response = {
        secure_url: 'https://res.cloudinary.com/test/image/upload/v1/uploads/customer-art.png',
        public_id: 'uploads/customer-art',
        bytes: 5000,
        width: 1200,
        height: 600,
        format: 'png',
        resource_type: 'image',
        asset_id: 'asset-123',
        version: 1,
      };
      this.onload?.();
    }, 0);
  }

  abort() {
    this.onabort?.();
  }
}

class SuccessfulChunkedUploadXhr {
  static requests: Array<{ headers: Record<string, string>; body: FormData }> = [];
  status = 0;
  response: any = null;
  responseText = '';
  responseType = '';
  timeout = 0;
  headers: Record<string, string> = {};
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(_method: string, _url: string, _async: boolean) {}

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: FormData) {
    SuccessfulChunkedUploadXhr.requests.push({ headers: { ...this.headers }, body });
    const range = this.headers['Content-Range'];
    const match = range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (!match) throw new Error(`Invalid test range: ${range}`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded: end - start + 1,
      total: end - start + 1,
    } as ProgressEvent);
    window.setTimeout(() => {
      this.status = 200;
      this.response = end + 1 < total
        ? { done: false }
        : {
            done: true,
            secure_url: 'https://res.cloudinary.com/test/image/upload/v1/uploads/large-art.pdf',
            public_id: 'uploads/large-art',
            bytes: total,
            format: 'pdf',
            resource_type: 'image',
          };
      this.onload?.();
    }, 0);
  }

  abort() {
    this.onabort?.();
  }
}

beforeEach(() => {
  vi.stubGlobal('File', TestFile);
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  SuccessfulUploadXhr.sentFormData = null;
  SuccessfulChunkedUploadXhr.requests = [];
});

describe('uploadArtworkFile', () => {
  it('validates the advertised customer artwork contract', () => {
    expect(validateArtworkFile(new File(['x'], 'banner.png', { type: 'image/png' }))).toBeNull();
    expect(validateArtworkFile(new File(['x'], 'banner.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(validateArtworkFile(new File(['x'], 'banner.exe', { type: 'application/octet-stream' })))
      .toContain('PDF, PNG, JPG, or JPEG');

    const oversized = new File(['x'], 'banner.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: MAX_ARTWORK_BYTES + 1 });
    expect(validateArtworkFile(oversized)).toContain('under 50MB');
  });

  it('creates a browser-safe first-page image for Cloudinary PDFs', () => {
    expect(buildCloudinaryPdfPreviewUrl(
      'https://res.cloudinary.com/demo/image/upload/v123/uploads/design.pdf',
    )).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1800,c_limit/v123/uploads/design.jpg',
    );
  });

  it('uploads original bytes directly with the exact signed parameters', async () => {
    const signatureResponse = {
      apiKey: 'public-key',
      cloudName: 'test',
      expiresAt: Date.now() + 60_000,
      folder: 'uploads',
      overwrite: false,
      resourceType: 'image',
      signature: 'signature-value',
      timestamp: 123456,
      uniqueFilename: true,
      uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
      useFilename: true,
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('/.netlify/functions/cloudinary-upload-signature');
      return new Response(JSON.stringify(signatureResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    vi.stubGlobal('XMLHttpRequest', SuccessfulUploadXhr as any);

    const progress: number[] = [];
    const file = new File(['original customer bytes'], 'customer-art.png', { type: 'image/png' });
    const result = await uploadArtworkFile(file, {
      correlationId: 'test-upload',
      onProgress: (value) => progress.push(value),
    });

    expect(result.transport).toBe('cloudinary-direct');
    expect(result.secureUrl).toContain('customer-art.png');
    expect(result.fileKey).toBe('uploads/customer-art');
    expect(result.artworkManifest.originalFilename).toBe('customer-art.png');
    expect(result.artworkManifest.uploadStatus).toBe('uploaded');
    expect(progress).toContain(0.5);
    expect(progress.at(-1)).toBe(1);

    const formData = SuccessfulUploadXhr.sentFormData;
    expect(formData).toBeInstanceOf(FormData);
    const submittedFile = formData?.get('file') as File | null;
    expect(submittedFile).toBeTruthy();
    expect(submittedFile?.name).toBe('customer-art.png');
    expect(submittedFile?.size).toBe(file.size);
    expect(submittedFile?.type).toBe('image/png');
    expect(formData?.get('api_key')).toBe('public-key');
    expect(formData?.get('timestamp')).toBe('123456');
    expect(formData?.get('signature')).toBe('signature-value');
    expect(formData?.get('folder')).toBe('uploads');
    expect(formData?.get('use_filename')).toBe('true');
    expect(formData?.get('unique_filename')).toBe('true');
    expect(formData?.get('overwrite')).toBe('false');
  });

  it('uploads larger originals in restartable Cloudinary chunks', async () => {
    const signatureResponse = {
      apiKey: 'public-key',
      cloudName: 'test',
      expiresAt: Date.now() + 60_000,
      folder: 'uploads',
      overwrite: false,
      resourceType: 'image',
      signature: 'signature-value',
      timestamp: 123456,
      uniqueFilename: true,
      uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
      useFilename: true,
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(signatureResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-upload-id' });
    vi.stubGlobal('XMLHttpRequest', SuccessfulChunkedUploadXhr as any);

    const byteLength = CHUNKED_UPLOAD_THRESHOLD_BYTES + UPLOAD_CHUNK_BYTES + 17;
    const file = new File([new Uint8Array(byteLength)], 'large-art.pdf', { type: 'application/pdf' });
    const progress: number[] = [];
    const result = await uploadArtworkFile(file, {
      onProgress: (value) => progress.push(value),
    });

    expect(result.fileKey).toBe('uploads/large-art');
    expect(result.previewUrl).toContain('pg_1,f_jpg');
    expect(SuccessfulChunkedUploadXhr.requests).toHaveLength(3);
    expect(new Set(SuccessfulChunkedUploadXhr.requests.map((request) => (
      request.headers['X-Unique-Upload-Id']
    )))).toEqual(new Set(['fixed-upload-id']));
    expect(SuccessfulChunkedUploadXhr.requests.map((request) => request.headers['Content-Range']))
      .toEqual([
        `bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${byteLength}`,
        `bytes ${UPLOAD_CHUNK_BYTES}-${(2 * UPLOAD_CHUNK_BYTES) - 1}/${byteLength}`,
        `bytes ${2 * UPLOAD_CHUNK_BYTES}-${byteLength - 1}/${byteLength}`,
      ]);
    expect(progress.at(-1)).toBe(1);
  });

  it('returns bounded, non-PII diagnostics for Clarity tags', () => {
    const file = new File(['private'], 'customer-name-private-art.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 });
    expect(getArtworkUploadDiagnostic(new Error('secret transport response'), file)).toEqual({
      phase: 'response',
      retryable: false,
      status: null,
      sizeBucket: '4mb-8mb',
      mimeType: 'png',
    });
  });
});
