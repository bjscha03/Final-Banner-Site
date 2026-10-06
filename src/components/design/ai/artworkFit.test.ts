import { expect, it } from 'vitest';
import { artworkFitSourceUrl } from './artworkFit';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
const file = { name: 'artwork.jpg', size: 100, isPdf: false, url: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/customer-design.jpg', fileKey: 'uploads/customer-design', previewUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_jpg/v1/uploads/customer-design.jpg' } as UploadedArtworkFile;
it('reads original artwork at high resolution instead of the 800px UI preview', () => {
  expect(artworkFitSourceUrl(file)).toBe('https://res.cloudinary.com/demo/image/upload/w_2560,h_2560,c_limit,q_95,f_jpg/v1/uploads/customer-design.jpg');
});
it('replaces PDF thumbnail sizing but keeps the chosen PDF page', () => {
  expect(artworkFitSourceUrl({ ...file, isPdf: true, mimeType: 'application/pdf', url: file.url.replace('.jpg', '.pdf'), previewUrl: file.previewUrl!.replace('w_800,f_jpg', 'pg_2,f_jpg,w_800') })).toContain('/image/upload/pg_2,w_2560,h_2560,c_limit,q_95,f_jpg/v1/uploads/customer-design.jpg');
});
it('uses the permanent original page image for large PDFs rather than a composed thumbnail', () => {
  expect(artworkFitSourceUrl({ ...file, isPdf: true, resourceType: 'original', url: 'https://site.test/artwork-original/123/original.pdf', previewUrl: 'blob:temporary-preview', permanentPreviewUrl: 'https://cdn.test/original-page.png', thumbnailUrl: 'https://cdn.test/placed-preview.png' })).toBe('https://cdn.test/original-page.png');
});
it('keeps a local PDF raster when a permanent preview is not yet available', () => {
  expect(artworkFitSourceUrl({ ...file, isPdf: true, url: 'https://site.test/raw/original.pdf', previewUrl: 'blob:readable-pdf-page' })).toBe('blob:readable-pdf-page');
});
it('does not try to read a raw PDF as a bitmap', () => {
  expect(artworkFitSourceUrl({ ...file, isPdf: true, resourceType: 'raw', mimeType: 'application/pdf', url: 'https://site.test/raw/original.pdf', previewUrl: undefined })).toBe('');
});
