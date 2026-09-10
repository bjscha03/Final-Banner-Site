const { describe, it, expect } = require('vitest');
const { normalizeArtworkManifest } = require('../_shared/artwork-manifest.cjs');

describe('canonical artwork manifest', () => {
  it('preserves complete immutable upload metadata', () => {
    const manifest = normalizeArtworkManifest({ artwork_manifest: {
      originalUrl: 'https://res.cloudinary.com/demo/image/upload/v1/art.pdf',
      publicId: 'uploads/art', assetId: 'asset-1', version: 1,
      resourceType: 'image', format: 'pdf', mimeType: 'application/pdf',
      originalFilename: 'John print master.pdf', bytes: 123, sha256: 'abc',
      uploadStatus: 'uploaded', uploadedAt: '2026-01-01T00:00:00.000Z',
    } });
    expect(manifest.originalFilename).toBe('John print master.pdf');
    expect(manifest.publicId).toBe('uploads/art');
    expect(manifest.sha256).toBe('abc');
  });

  it('adapts legacy file_url/file_key without inventing a filename', () => {
    expect(normalizeArtworkManifest({ file_url: 'https://example.com/a', file_key: 'uploads/a' }))
      .toMatchObject({ originalUrl: 'https://example.com/a', publicId: 'uploads/a', originalFilename: null });
  });
});
