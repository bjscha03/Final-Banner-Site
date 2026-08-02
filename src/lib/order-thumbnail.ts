import {
  buildCommercePreviewUrl,
  isRawPdfPreviewSource,
} from './commercePreviewUrl';
import { dedupePreviewImageSources } from './previewImageCache';
import {
  getPreviewSourceCandidates,
  type PreviewableItem,
} from './previewSelection';

export const ADMIN_THUMBNAIL_CLOUDINARY_CLOUD = 'dtrxl120u';

export function isCloudinaryUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.hostname === 'res.cloudinary.com' || parsed.hostname.endsWith('.res.cloudinary.com'))
      && parsed.pathname.includes('/upload/');
  } catch {
    return false;
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type ThumbnailItem = PreviewableItem & {
  final_print_pdf_url?: string | null;
};

/**
 * Ordered browser-safe thumbnail candidates shared by customer confirmation,
 * My Orders, Admin order cards/detail, and any legacy order surface.
 *
 * The source identity comes from the same exhaustive resolver used by cart and
 * checkout: placement preview, final/web preview, positioned thumbnail,
 * artwork manifest, Cloudinary public ID, PDF first-page derivative, AI proof,
 * canvas sources, uploaded design assets, and nested Yard Sign designs.
 */
export function getFinalizedThumbnailCandidates(
  item: ThumbnailItem | null | undefined,
  maxWidth = 240,
): string[] {
  if (!item) return [];

  const sources = getPreviewSourceCandidates(item);
  return dedupePreviewImageSources(sources.flatMap((source) => {
    if (isRawPdfPreviewSource(source)) return [];
    if (source.startsWith('data:image/') || source.startsWith('blob:')) return [source];

    if (isCloudinaryUploadUrl(source)) {
      return [
        buildCommercePreviewUrl(source, maxWidth),
        source,
      ];
    }

    if (isHttpUrl(source)) {
      return [
        source,
        `https://res.cloudinary.com/${ADMIN_THUMBNAIL_CLOUDINARY_CLOUD}/image/fetch/w_${Math.max(240, maxWidth)},c_limit,f_auto,q_auto/${source}`,
      ];
    }

    return [];
  }));
}

/**
 * Backward-compatible single-URL resolver. Stable renderers should prefer the
 * candidate array so one stale derivative can never leave a blank frame.
 */
export function getFinalizedThumbnailUrl(
  item: ThumbnailItem | null | undefined,
  maxWidth = 240,
): string | null {
  return getFinalizedThumbnailCandidates(item, maxWidth)[0] || null;
}
