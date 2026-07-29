import {
  buildCommercePreviewUrl,
  isRawPdfPreviewSource,
} from './commercePreviewUrl';
import { dedupePreviewImageSources } from './previewImageCache';

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

type ThumbnailItem = {
  thumbnail_url?: string | null;
  web_preview_url?: string | null;
  final_render_url?: string | null;
  file_url?: string | null;
  print_ready_url?: string | null;
};

/**
 * Ordered browser-safe thumbnail candidates shared by customer and Admin order
 * surfaces. A raw PDF is never returned to an <img>, and original Cloudinary
 * uploads are converted to a memory-safe CDN derivative for mobile browsers.
 */
export function getFinalizedThumbnailCandidates(
  item: ThumbnailItem | null | undefined,
  maxWidth = 240,
): string[] {
  const sources = dedupePreviewImageSources([
    item?.thumbnail_url,
    item?.web_preview_url,
    item?.final_render_url,
    item?.print_ready_url,
    item?.file_url,
  ]);

  return dedupePreviewImageSources(sources.flatMap((source) => {
    if (isRawPdfPreviewSource(source)) return [];

    if (isCloudinaryUploadUrl(source)) {
      return [buildCommercePreviewUrl(source, maxWidth), source];
    }

    if (isHttpUrl(source)) {
      return [
        `https://res.cloudinary.com/${ADMIN_THUMBNAIL_CLOUDINARY_CLOUD}/image/fetch/w_${Math.max(240, maxWidth)},c_limit,f_auto,q_auto/${source}`,
        source,
      ];
    }

    // Keep data/blob URLs intact for immediate post-checkout states.
    return [source];
  }));
}

/**
 * Backward-compatible single-URL resolver. New stable image components should
 * prefer getFinalizedThumbnailCandidates so they can fail over without ever
 * showing a broken-image icon.
 */
export function getFinalizedThumbnailUrl(
  item: ThumbnailItem | null | undefined,
  maxWidth = 240,
): string | null {
  return getFinalizedThumbnailCandidates(item, maxWidth)[0] || null;
}
