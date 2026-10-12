import type { CartItem } from '@/store/cart';
import type { ArtworkManifest } from '@/types/artwork';
import { buildCloudinaryPdfPreviewUrl } from '@/utils/uploadArtworkFile';
import { isRawPdfPreviewSource } from '@/components/design/artworkPreviewSource';

export type UploadedArtworkFile = {
  editorIdentity?: string;
  name: string;
  url: string;
  fileKey: string;
  size: number;
  isPdf: boolean;
  thumbnailUrl?: string;
  previewUrl?: string;
  permanentPreviewUrl?: string;
  productionUrl?: string;
  productionPublicId?: string;
  resourceType?: 'image' | 'raw' | string;
  mimeType?: string;
  originalFormat?: string;
  originalBytes?: number;
  originalWidth?: number | null;
  originalHeight?: number | null;
  pdfPageNumber?: number;
  artworkManifest?: ArtworkManifest;
};

/** A browser-local retry image must never replace the persisted source used by checkout. */
export function getPermanentArtworkPreviewUrl(artwork: UploadedArtworkFile): string {
  const originalUrl = artwork.artworkManifest?.originalUrl || artwork.productionUrl || artwork.url;
  if (!artwork.isPdf && artwork.resourceType !== 'original') return originalUrl;
  return [artwork.permanentPreviewUrl, artwork.previewUrl, artwork.thumbnailUrl, originalUrl]
    .map(url => buildCloudinaryPdfPreviewUrl(url || ''))
    .find(url => /^https?:\/\//i.test(url) && !isRawPdfPreviewSource(url)) || '';
}

// Build a downscaled, format/quality-optimized Cloudinary URL for the live
// preview surface. The original full-resolution Cloudinary URL is preserved on
// the cart/order item for print/admin export — only the on-screen preview uses
// this transformed variant. This avoids decoding 10–50MB images in the browser
// (which causes Chrome to hang and Safari to lay out the page incorrectly).
function getImagePreviewUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;
  let host = '';
  try {
    host = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    return imageUrl;
  }
  if (host !== 'res.cloudinary.com' && !host.endsWith('.res.cloudinary.com')) return imageUrl;
  if (!imageUrl.includes('/upload/')) return imageUrl;
  // Skip if a transformation already exists right after /upload/.
  if (/\/upload\/[a-z]_[^/]+\//.test(imageUrl)) return imageUrl;
  return imageUrl.replace('/upload/', '/upload/f_auto,q_auto:good,w_1600,c_limit/');
}

export function buildCartArtworkForEditor(item: CartItem): UploadedArtworkFile | null {
  const manifest = item.artwork_manifest;
  const originalUrl = manifest?.originalUrl
    || item.file_url
    || item.placement_preview?.sourceUrl
    || '';
  if (!originalUrl) return null;
  const isPdf = Boolean(item.is_pdf || manifest?.mimeType === 'application/pdf');
  const publicId = manifest?.publicId
    || item.file_key
    || String(item.placement_preview?.sourceIdentity || '').split('@')[0]
    || '';
  // sourceUrl is the uncomposed image used to create the approved preview.
  // The baked thumbnail already includes placement/finishing and must not be
  // used as editable artwork. Large PDFs have a separate saved PNG source.
  const savedSource = buildCloudinaryPdfPreviewUrl(item.placement_preview?.sourceUrl || '');
  const browserPreviewUrl = /^https?:\/\//i.test(savedSource) && !isRawPdfPreviewSource(savedSource)
    ? savedSource
    : isPdf ? buildCloudinaryPdfPreviewUrl(originalUrl) : getImagePreviewUrl(originalUrl);
  const restored: UploadedArtworkFile = {
    editorIdentity: [
      'cart-source',
      publicId || item.id,
      manifest?.version ?? '',
      item.placement_preview?.compositionRevision ?? item.composition_revision ?? '',
    ].join('@'),
    name: item.file_name || manifest?.originalFilename || 'artwork',
    url: originalUrl,
    fileKey: publicId,
    size: Number(manifest?.bytes || 0),
    isPdf,
    thumbnailUrl: browserPreviewUrl,
    previewUrl: browserPreviewUrl,
    permanentPreviewUrl: isRawPdfPreviewSource(browserPreviewUrl) ? undefined : browserPreviewUrl,
    productionUrl: originalUrl,
    productionPublicId: publicId,
    resourceType: manifest?.resourceType || 'image',
    mimeType: manifest?.mimeType || (isPdf ? 'application/pdf' : undefined),
    originalFormat: manifest?.format,
    originalBytes: manifest?.bytes,
    originalWidth: manifest?.width ?? null,
    originalHeight: manifest?.height ?? null,
    pdfPageNumber: isPdf ? 1 : undefined,
    artworkManifest: manifest || undefined,
  };
  return restored;
}
