export type ExpandedPreviewSelection = {
  url: string | null;
  source: 'web_preview' | 'final_render' | 'thumbnail_fallback' | 'none';
  isLowResolutionFallback: boolean;
  isPreparingHighResolution: boolean;
};

const normalizeUrl = (value?: string | null) => String(value || '').trim();

const isRawPdfUrl = (value?: string | null) => {
  const normalized = normalizeUrl(value).toLowerCase();
  return Boolean(normalized) && (
    /\.pdf(?:$|[?#])/.test(normalized)
    || normalized.includes('/raw/upload/')
    || normalized.startsWith('application/pdf')
  );
};

const isTemporaryDataUrl = (value?: string | null) => (
  typeof value === 'string' && value.startsWith('data:image/')
);

const isTemporaryBlobUrl = (value?: string | null) => (
  typeof value === 'string' && value.startsWith('blob:')
);

const isPermanentPreviewUrl = (value?: string | null) => {
  const normalized = normalizeUrl(value);
  return Boolean(normalized)
    && !isTemporaryBlobUrl(normalized)
    && !isTemporaryDataUrl(normalized)
    && !isRawPdfUrl(normalized);
};

export const buildCloudinaryPdfPreviewUrl = (value?: string | null): string | null => {
  const url = normalizeUrl(value);
  if (!url || !/\.pdf(?:$|[?#])/i.test(url) || !url.includes('/image/upload/')) return null;
  const transformed = url.replace('/upload/', '/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/');
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
};

type PreviewableItem = {
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  print_ready_url?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null } } | null;
};

/**
 * Choose the enlarged preview source.
 *
 * Permanent CDN URLs always win over browser-only data/blob URLs so navigating
 * from the designer to checkout, refreshing, or opening the cart on another
 * device cannot strand the preview on an expired temporary source.
 */
export const getExpandedPreviewSelection = (item: PreviewableItem): ExpandedPreviewSelection => {
  if (isPermanentPreviewUrl(item.web_preview_url)) {
    return {
      url: normalizeUrl(item.web_preview_url),
      source: 'web_preview',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  if (isPermanentPreviewUrl(item.final_render_url)) {
    return {
      url: normalizeUrl(item.final_render_url),
      source: 'final_render',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  if (isPermanentPreviewUrl(item.thumbnail_url)) {
    return {
      url: normalizeUrl(item.thumbnail_url),
      source: 'thumbnail_fallback',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  if (cloudinaryPdfPreview) {
    return {
      url: cloudinaryPdfPreview,
      source: 'thumbnail_fallback',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  const permanentFallback = [
    item.file_url,
    item.print_ready_url,
    item.aiDesign?.assets?.proofUrl,
  ].find(isPermanentPreviewUrl);

  if (permanentFallback) {
    return {
      url: normalizeUrl(permanentFallback),
      source: 'thumbnail_fallback',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  if (isTemporaryDataUrl(item.thumbnail_url)) {
    return {
      url: normalizeUrl(item.thumbnail_url),
      source: 'thumbnail_fallback',
      isLowResolutionFallback: true,
      isPreparingHighResolution: true,
    };
  }

  return {
    url: null,
    source: 'none',
    isLowResolutionFallback: false,
    isPreparingHighResolution: true,
  };
};

/**
 * Choose the compact thumbnail used by the upsell/cart/checkout surfaces.
 *
 * A permanent positioned thumbnail is preferred first. If the positioned
 * upload is still finishing, use another permanent preview before falling back
 * to the in-memory data URL created on the design page.
 */
export const getSmallPreviewUrl = (item: PreviewableItem): string | null => {
  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  const permanentCandidates = [
    item.thumbnail_url,
    item.web_preview_url,
    item.final_render_url,
    cloudinaryPdfPreview,
    item.file_url,
    item.print_ready_url,
    item.aiDesign?.assets?.proofUrl,
  ];

  const permanent = permanentCandidates.find(isPermanentPreviewUrl);
  if (permanent) return normalizeUrl(permanent);

  if (isTemporaryDataUrl(item.thumbnail_url)) return normalizeUrl(item.thumbnail_url);
  return null;
};
