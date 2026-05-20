export const ADMIN_THUMBNAIL_CLOUDINARY_CLOUD = 'dtrxl120u';

export function isCloudinaryUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/upload/');
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

/**
 * Shared thumbnail resolver used by cart/checkout/email/admin order surfaces.
 * Uses the finalized/stored `thumbnail_url` as the single source of truth and
 * only applies delivery transforms for size/quality.
 */
export function getFinalizedThumbnailUrl(
  item: { thumbnail_url?: string | null } | null | undefined,
  maxWidth = 240,
): string | null {
  if (!item?.thumbnail_url) return null;
  const thumbnailUrl = String(item.thumbnail_url);

  if (isCloudinaryUploadUrl(thumbnailUrl)) {
    return thumbnailUrl.replace('/upload/', `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
  }

  if (isHttpUrl(thumbnailUrl)) {
    return `https://res.cloudinary.com/${ADMIN_THUMBNAIL_CLOUDINARY_CLOUD}/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${thumbnailUrl}`;
  }

  // Keep data/blob urls intact for immediate post-checkout/admin preview states.
  return thumbnailUrl;
}
