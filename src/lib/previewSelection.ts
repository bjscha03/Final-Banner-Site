export type ExpandedPreviewSelection = {
  url: string | null;
  source: 'web_preview' | 'final_render' | 'thumbnail_fallback' | 'none';
  isLowResolutionFallback: boolean;
  isPreparingHighResolution: boolean;
};

const isUsablePreviewUrl = (value?: string | null) => (
  typeof value === 'string'
  && value.trim().length > 0
  && !value.startsWith('blob:')
  && !value.startsWith('data:')
  && !value.toLowerCase().endsWith('.pdf')
);

export const getExpandedPreviewSelection = (item: {
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
}): ExpandedPreviewSelection => {
  if (isUsablePreviewUrl(item.web_preview_url)) {
    return { url: item.web_preview_url!, source: 'web_preview', isLowResolutionFallback: false, isPreparingHighResolution: false };
  }
  if (isUsablePreviewUrl(item.final_render_url)) {
    return { url: item.final_render_url!, source: 'final_render', isLowResolutionFallback: false, isPreparingHighResolution: false };
  }
  if (item.thumbnail_url) {
    return { url: item.thumbnail_url, source: 'thumbnail_fallback', isLowResolutionFallback: true, isPreparingHighResolution: true };
  }
  return { url: null, source: 'none', isLowResolutionFallback: false, isPreparingHighResolution: true };
};

export const getSmallPreviewUrl = (item: {
  thumbnail_url?: string | null;
  file_url?: string | null;
  web_preview_url?: string | null;
  print_ready_url?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null } } | null;
}) => item.thumbnail_url || item.file_url || item.web_preview_url || item.print_ready_url || item.aiDesign?.assets?.proofUrl || null;
