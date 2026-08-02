import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  MAX_ARTWORK_BYTES,
  uploadArtworkFile,
  validateArtworkFile,
} from './uploadArtworkFile';

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

beforeEach(() => {
  vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  SuccessfulUploadXhr.sentFormData = null;
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
    expect(formData?.get('file')).toBe(file);
    expect(formData?.get('api_key')).toBe('public-key');
    expect(formData?.get('timestamp')).toBe('123456');
    expect(formData?.get('signature')).toBe('signature-value');
    expect(formData?.get('folder')).toBe('uploads');
    expect(formData?.get('use_filename')).toBe('true');
    expect(formData?.get('unique_filename')).toBe('true');
    expect(formData?.get('overwrite')).toBe('false');
  });
});
