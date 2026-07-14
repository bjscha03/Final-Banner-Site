export type ExpandedPreviewSelection = {
  url: string | null;
  source: 'web_preview' | 'final_render' | 'thumbnail_fallback' | 'none';
  isLowResolutionFallback: boolean;
  isPreparingHighResolution: boolean;
};

const isRawPdfUrl = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && (
    /\.pdf(?:$|[?#])/.test(normalized)
    || normalized.includes('/raw/upload/')
    || normalized.startsWith('application/pdf')
  );
};

export const buildCloudinaryPdfPreviewUrl = (value?: string | null): string | null => {
  const url = String(value || '').trim();
  if (!url || !/\.pdf(?:$|[?#])/i.test(url) || !url.includes('/image/upload/')) return null;
  const transformed = url.replace('/upload/', '/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/');
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
};

const isUsablePreviewUrl = (value?: string | null) => (
  typeof value === 'string'
  && value.trim().length > 0
  && !value.startsWith('blob:')
  && !isRawPdfUrl(value)
);

const isUsableTemporaryDataUrl = (value?: string | null) => (
  typeof value === 'string' && value.startsWith('data:image/')
);

export const getExpandedPreviewSelection = (item: {
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
}): ExpandedPreviewSelection => {
  if (isUsablePreviewUrl(item.web_preview_url)) {
    return { url: item.web_preview_url!, source: 'web_preview', isLowResolutionFallback: false, isPreparingHighResolution: false };
  }
  if (isUsablePreviewUrl(item.final_render_url)) {
    return { url: item.final_render_url!, source: 'final_render', isLowResolutionFallback: false, isPreparingHighResolution: false };
  }

  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  if (cloudinaryPdfPreview) {
    return { url: cloudinaryPdfPreview, source: 'thumbnail_fallback', isLowResolutionFallback: false, isPreparingHighResolution: false };
  }

  if (isUsablePreviewUrl(item.thumbnail_url) || isUsableTemporaryDataUrl(item.thumbnail_url)) {
    return { url: item.thumbnail_url!, source: 'thumbnail_fallback', isLowResolutionFallback: true, isPreparingHighResolution: true };
  }
  return { url: null, source: 'none', isLowResolutionFallback: false, isPreparingHighResolution: true };
};

export const getSmallPreviewUrl = (item: {
  thumbnail_url?: string | null;
  file_url?: string | null;
  web_preview_url?: string | null;
  final_render_url?: string | null;
  print_ready_url?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null } } | null;
}) => {
  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  const candidates = [
    item.thumbnail_url,
    item.web_preview_url,
    item.final_render_url,
    cloudinaryPdfPreview,
    item.file_url,
    item.print_ready_url,
    item.aiDesign?.assets?.proofUrl,
  ];
  const permanent = candidates.find(isUsablePreviewUrl);
  if (permanent) return permanent;
  if (isUsableTemporaryDataUrl(item.thumbnail_url)) return item.thumbnail_url!;
  return null;
};
