import { buildCommercePreviewUrl } from './commercePreviewUrl';
import { dedupePreviewImageSources } from './previewImageCache';
import { registerPreviewSourceCandidates } from './previewSourceRegistry';

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

const isTemporaryPreviewUrl = (value?: string | null) => (
  isTemporaryDataUrl(value) || isTemporaryBlobUrl(value)
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
  return buildCommercePreviewUrl(url, 800);
};

type PreviewableItem = {
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  print_ready_url?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null } } | null;
};

type Candidate = {
  url: string | null | undefined;
  source: ExpandedPreviewSelection['source'];
  permanent: boolean;
  lowResolution: boolean;
};

function getExpandedCandidates(item: PreviewableItem): Candidate[] {
  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  return [
    { url: item.web_preview_url, source: 'web_preview', permanent: true, lowResolution: false },
    { url: item.final_render_url, source: 'final_render', permanent: true, lowResolution: false },
    { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: cloudinaryPdfPreview, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.file_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.print_ready_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.aiDesign?.assets?.proofUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
    { url: item.web_preview_url, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
  ];
}

function safeCandidateUrls(candidates: Candidate[]): string[] {
  return dedupePreviewImageSources(candidates
    .map((candidate) => normalizeUrl(candidate.url))
    .filter((url) => Boolean(url) && !isRawPdfUrl(url)));
}

/**
 * Choose the enlarged preview source and register every other usable artwork
 * representation as an automatic fallback for the shared image renderer.
 */
export const getExpandedPreviewSelection = (item: PreviewableItem): ExpandedPreviewSelection => {
  const candidates = getExpandedCandidates(item);
  const selected = candidates.find((candidate) => {
    if (candidate.permanent) return isPermanentPreviewUrl(candidate.url);
    return isTemporaryPreviewUrl(candidate.url);
  });

  if (!selected) {
    return {
      url: null,
      source: 'none',
      isLowResolutionFallback: false,
      isPreparingHighResolution: true,
    };
  }

  const url = normalizeUrl(selected.url);
  registerPreviewSourceCandidates(url, safeCandidateUrls(candidates));
  return {
    url,
    source: selected.source,
    isLowResolutionFallback: selected.lowResolution,
    isPreparingHighResolution: selected.lowResolution,
  };
};

/**
 * Choose the compact thumbnail used by upsell/cart/checkout surfaces. The
 * selected URL is registered with its complete fallback chain so a stale first
 * derivative cannot leave the product card blank.
 */
export const getSmallPreviewUrl = (item: PreviewableItem): string | null => {
  const cloudinaryPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  const candidates = dedupePreviewImageSources([
    item.thumbnail_url,
    item.web_preview_url,
    item.final_render_url,
    cloudinaryPdfPreview,
    item.file_url,
    item.print_ready_url,
    item.aiDesign?.assets?.proofUrl,
  ]).filter((url) => !isRawPdfUrl(url));

  const permanent = candidates.find(isPermanentPreviewUrl);
  const temporary = candidates.find(isTemporaryPreviewUrl);
  const selected = permanent || temporary || null;
  if (!selected) return null;

  registerPreviewSourceCandidates(selected, candidates);
  return selected;
};
