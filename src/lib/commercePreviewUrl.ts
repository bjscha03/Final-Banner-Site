const normalizeUrl = (value?: string | null) => String(value || '').trim();

const isCloudinaryHost = (hostname: string) => (
  hostname === 'res.cloudinary.com' || hostname.endsWith('.res.cloudinary.com')
);

export const isRawPdfPreviewSource = (value?: string | null): boolean => {
  const normalized = normalizeUrl(value).toLowerCase();
  return Boolean(normalized) && (
    normalized.includes('/raw/upload/')
    || /\.pdf(?:$|[?#])/.test(normalized)
  );
};

const hasCloudinaryTransformation = (pathname: string): boolean => {
  const marker = '/image/upload/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return false;

  const afterUpload = pathname.slice(markerIndex + marker.length);
  const firstSegment = afterUpload.split('/')[0] || '';
  if (!firstSegment || /^v\d+$/i.test(firstSegment)) return false;

  return firstSegment.includes(',') || /^[a-z]{1,4}_[^/]+$/i.test(firstSegment);
};

/**
 * Return a browser-friendly preview source for upsell, cart, and checkout.
 *
 * Original Cloudinary uploads can be tens of megabytes. Mobile Safari and
 * lower-memory Android devices may simply render those thumbnails blank. This
 * helper keeps the original URL untouched for production while requesting a
 * compact CDN derivative for commerce previews.
 */
export function buildCommercePreviewUrl(
  value?: string | null,
  maxDisplayPx = 200,
): string | null {
  const url = normalizeUrl(value);
  if (!url) return null;
  if (url.startsWith('data:image/') || url.startsWith('blob:')) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!isCloudinaryHost(parsed.hostname.toLowerCase())) return url;

  // Cloudinary raw PDF assets cannot be displayed by an <img>. Current uploads
  // are image-type PDFs, but this guard prevents legacy raw URLs from causing a
  // permanently blank thumbnail.
  if (parsed.pathname.includes('/raw/upload/')) return null;
  if (!parsed.pathname.includes('/image/upload/')) return url;

  const targetWidth = Math.max(800, Math.min(1800, Math.round(maxDisplayPx * 2)));
  const isPdf = /\.pdf$/i.test(parsed.pathname);

  if (isPdf) {
    if (!hasCloudinaryTransformation(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(
        '/image/upload/',
        `/image/upload/pg_1,f_jpg,q_auto:good,w_${targetWidth},c_limit/`,
      );
    }
    parsed.pathname = parsed.pathname.replace(/\.pdf$/i, '.jpg');
    return parsed.toString();
  }

  if (!hasCloudinaryTransformation(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(
      '/image/upload/',
      `/image/upload/f_auto,q_auto:good,w_${targetWidth},c_limit/`,
    );
  }

  return parsed.toString();
}
