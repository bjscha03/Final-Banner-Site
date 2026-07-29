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

  const transformed = url.replace(
    '/upload/',
    '/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/',
  );
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
};

type YardSignDesignPreview = {
  previewThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
};

type PlacementPreview = {
  url?: string | null;
  uploadStatus?: string | null;
};

type PreviewableItem = {
  product_type?: string | null;
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  print_ready_url?: string | null;
  placement_preview?: PlacementPreview | null;
  yard_sign_designs?: YardSignDesignPreview[] | null;
  aiDesign?: { assets?: { proofUrl?: string | null } } | null;
};

type Candidate = {
  url: string | null | undefined;
  source: ExpandedPreviewSelection['source'];
  permanent: boolean;
  lowResolution: boolean;
};

const getPlacementPreviewUrl = (item: PreviewableItem): string | null => {
  const placement = item.placement_preview;
  if (placement?.uploadStatus !== 'uploaded') return null;
  const url = normalizeUrl(placement.url);
  return isPermanentPreviewUrl(url) ? url : null;
};

const getPrimaryYardSignDesign = (item: PreviewableItem): YardSignDesignPreview | null => {
  if (!Array.isArray(item.yard_sign_designs)) return null;
  return item.yard_sign_designs.find((design) => Boolean(
    normalizeUrl(design?.previewThumbnailUrl)
    || normalizeUrl(design?.thumbnailUrl)
    || normalizeUrl(design?.fileUrl),
  )) || null;
};

/**
 * Legacy web_preview_url values are accepted only when the item predates the
 * placement-preview manifest. A pending/failed manifest means the URL must not
 * be trusted, because it may have leaked from a previously edited product.
 * Yard signs never use an unverified item-level web preview; their exact design
 * preview lives on thumbnail_url / yard_sign_designs.
 */
const getTrustedWebPreviewUrl = (item: PreviewableItem): string | null => {
  const placementUrl = getPlacementPreviewUrl(item);
  if (placementUrl) return placementUrl;
  if (item.product_type === 'yard_sign') return null;
  if (item.placement_preview) return null;
  const legacy = normalizeUrl(item.web_preview_url);
  return isPermanentPreviewUrl(legacy) ? legacy : null;
};

function getExpandedCandidates(item: PreviewableItem): Candidate[] {
  const placementPreview = getPlacementPreviewUrl(item);
  const trustedWebPreview = getTrustedWebPreviewUrl(item);
  const itemPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);

  if (item.product_type === 'yard_sign') {
    const design = getPrimaryYardSignDesign(item);
    const designPdfPreview = buildCloudinaryPdfPreviewUrl(design?.fileUrl);
    return [
      { url: placementPreview, source: 'web_preview', permanent: true, lowResolution: false },
      { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: design?.previewThumbnailUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: design?.thumbnailUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: item.final_render_url, source: 'final_render', permanent: true, lowResolution: false },
      { url: designPdfPreview, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: design?.fileUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: itemPdfPreview, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: item.file_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: item.print_ready_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: item.aiDesign?.assets?.proofUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
      { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
      { url: design?.previewThumbnailUrl, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
      { url: design?.thumbnailUrl, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
    ];
  }

  return [
    { url: placementPreview, source: 'web_preview', permanent: true, lowResolution: false },
    { url: trustedWebPreview, source: 'web_preview', permanent: true, lowResolution: false },
    { url: item.final_render_url, source: 'final_render', permanent: true, lowResolution: false },
    { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: itemPdfPreview, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.file_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.print_ready_url, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.aiDesign?.assets?.proofUrl, source: 'thumbnail_fallback', permanent: true, lowResolution: false },
    { url: item.thumbnail_url, source: 'thumbnail_fallback', permanent: false, lowResolution: true },
  ];
}

function safeCandidateUrls(candidates: Candidate[]): string[] {
  return dedupePreviewImageSources(candidates
    .map((candidate) => normalizeUrl(candidate.url))
    .filter((url) => Boolean(url) && !isRawPdfUrl(url)));
}

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

export const getSmallPreviewUrl = (item: PreviewableItem): string | null => {
  const placementPreview = getPlacementPreviewUrl(item);
  const trustedWebPreview = getTrustedWebPreviewUrl(item);
  const itemPdfPreview = buildCloudinaryPdfPreviewUrl(item.file_url);
  const design = item.product_type === 'yard_sign' ? getPrimaryYardSignDesign(item) : null;
  const designPdfPreview = buildCloudinaryPdfPreviewUrl(design?.fileUrl);

  const candidates = dedupePreviewImageSources(item.product_type === 'yard_sign'
    ? [
        item.thumbnail_url,
        design?.previewThumbnailUrl,
        design?.thumbnailUrl,
        placementPreview,
        item.final_render_url,
        designPdfPreview,
        design?.fileUrl,
        itemPdfPreview,
        item.file_url,
        item.print_ready_url,
        item.aiDesign?.assets?.proofUrl,
      ]
    : [
        item.thumbnail_url,
        placementPreview,
        trustedWebPreview,
        item.final_render_url,
        itemPdfPreview,
        item.file_url,
        item.print_ready_url,
        item.aiDesign?.assets?.proofUrl,
      ]
  ).filter((url) => !isRawPdfUrl(url));

  const permanent = candidates.find(isPermanentPreviewUrl);
  const temporary = candidates.find(isTemporaryPreviewUrl);
  const selected = permanent || temporary || null;
  if (!selected) return null;

  registerPreviewSourceCandidates(selected, candidates);
  return selected;
};
