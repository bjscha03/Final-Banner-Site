import { dedupePreviewImageSources } from './previewImageCache';
import { registerPreviewSourceCandidates } from './previewSourceRegistry';

const CLOUDINARY_CLOUD_NAME = 'dtrxl120u';

export type PreviewSource =
  | 'yard_sign_preview'
  | 'placement_preview'
  | 'final_render'
  | 'web_preview'
  | 'thumbnail_fallback'
  | 'original_fallback'
  | 'none';

export type ExpandedPreviewSelection = {
  url: string | null;
  source: PreviewSource;
  isLowResolutionFallback: boolean;
  isPreparingHighResolution: boolean;
};

type ArtworkManifestLike = {
  originalUrl?: string | null;
  publicId?: string | null;
  resourceType?: string | null;
  format?: string | null;
  uploadStatus?: string | null;
};

type PlacementPreviewLike = {
  url?: string | null;
  uploadStatus?: string | null;
};

type YardSignDesignLike = {
  previewThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
  isPdf?: boolean | null;
};

export type PreviewableItem = {
  product_type?: string | null;
  web_preview_url?: string | null;
  final_render_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  file_key?: string | null;
  file_name?: string | null;
  print_ready_url?: string | null;
  is_pdf?: boolean | null;
  artwork_manifest?: ArtworkManifestLike | null;
  placement_preview?: PlacementPreviewLike | null;
  yard_sign_designs?: YardSignDesignLike[] | null;
  design_uploaded_assets?: Array<{ url?: string | null; fileKey?: string | null }> | null;
  design_request_text?: string | null;
  canvas_state_json?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null; finalUrl?: string | null } } | null;
};

type Candidate = {
  url: string | null | undefined;
  source: PreviewSource;
  exactComposition: boolean;
  lowResolution: boolean;
};

const normalizeUrl = (value?: string | null) => String(value || '').trim();

const isTemporaryDataUrl = (value?: string | null) => (
  normalizeUrl(value).startsWith('data:image/')
);

const isTemporaryBlobUrl = (value?: string | null) => (
  normalizeUrl(value).startsWith('blob:')
);

const isTemporaryPreviewUrl = (value?: string | null) => (
  isTemporaryDataUrl(value) || isTemporaryBlobUrl(value)
);

const isRawPdfUrl = (value?: string | null) => {
  const normalized = normalizeUrl(value).toLowerCase();
  return Boolean(normalized) && (
    normalized.includes('/raw/upload/')
    || normalized.startsWith('application/pdf')
  );
};

const isPdfUrl = (value?: string | null) => {
  const normalized = normalizeUrl(value).toLowerCase();
  return Boolean(normalized) && /\.pdf(?:$|[?#])/.test(normalized);
};

const isPermanentPreviewUrl = (value?: string | null) => {
  const normalized = normalizeUrl(value);
  return Boolean(normalized)
    && !isTemporaryPreviewUrl(normalized)
    && !isRawPdfUrl(normalized)
    && !isPdfUrl(normalized);
};

const getFileExtension = (value?: string | null) => {
  const normalized = normalizeUrl(value).split(/[?#]/)[0];
  const match = normalized.match(/\.([a-z0-9]{2,8})$/i);
  return match?.[1]?.toLowerCase() || null;
};

const encodeCloudinaryPublicId = (value: string) => value
  .replace(/^\/+/, '')
  .split('/')
  .filter(Boolean)
  .map((segment) => encodeURIComponent(segment))
  .join('/');

/**
 * Reconstruct a public Cloudinary delivery URL when an older/cart-race item
 * retained only its unguessable Cloudinary public ID. This is a display-only
 * fallback; original artwork storage and Admin download security are unchanged.
 */
export const buildCloudinaryUrlFromFileKey = (
  fileKey?: string | null,
  options: {
    format?: string | null;
    fileName?: string | null;
    isPdf?: boolean | null;
    resourceType?: string | null;
  } = {},
): string | null => {
  const key = normalizeUrl(fileKey);
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  if (key.startsWith('blob:') || key.startsWith('data:')) return null;

  const resourceType = String(options.resourceType || 'image').toLowerCase();
  if (resourceType === 'raw') return null;

  const encodedKey = encodeCloudinaryPublicId(key);
  if (!encodedKey) return null;

  const existingExtension = getFileExtension(key);
  const requestedFormat = String(
    options.format
      || getFileExtension(options.fileName)
      || (options.isPdf ? 'pdf' : ''),
  ).replace(/^\./, '').toLowerCase();
  const extension = existingExtension || !requestedFormat ? '' : `.${requestedFormat}`;

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encodedKey}${extension}`;
};

export const buildCloudinaryPdfPreviewUrl = (value?: string | null): string | null => {
  const url = normalizeUrl(value);
  if (!url || !isPdfUrl(url) || !url.includes('/image/upload/')) return null;

  const transformed = url.includes('/image/upload/pg_1,')
    ? url
    : url.replace(
        '/image/upload/',
        '/image/upload/pg_1,f_jpg,q_auto:good,w_1800,c_limit/',
      );
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
};

function parseJsonObject(value?: string | null): Record<string, any> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getDesignRequestSources(item: PreviewableItem): string[] {
  const parsed = parseJsonObject(item.design_request_text);
  if (!parsed) return [];
  return dedupePreviewImageSources([
    parsed.approvedProofUrl,
    parsed.proofUrl,
    parsed.thumbnailUrl,
    parsed.previewUrl,
  ]);
}

function getCanvasSources(item: PreviewableItem): string[] {
  const parsed = parseJsonObject(item.canvas_state_json);
  if (!parsed) return [];

  const values: Array<string | null | undefined> = [
    parsed.previewUrl,
    parsed.webPreviewUrl,
    parsed.finalRenderUrl,
  ];
  const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
  for (const object of objects) {
    if (!object || typeof object !== 'object' || object.type !== 'image') continue;
    values.push(
      object.source?.previewUrl,
      object.source?.originalUrl,
      object.previewUrl,
      object.url,
      object.src,
    );
  }
  return dedupePreviewImageSources(values);
}

function getYardSignCandidates(item: PreviewableItem): Candidate[] {
  const designs = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const candidates: Candidate[] = [];

  for (const design of designs) {
    const reconstructed = buildCloudinaryUrlFromFileKey(design.fileKey, {
      fileName: design.fileUrl,
      isPdf: design.isPdf,
    });
    const pdfPreview = buildCloudinaryPdfPreviewUrl(design.fileUrl)
      || buildCloudinaryPdfPreviewUrl(reconstructed);

    candidates.push(
      { url: design.previewThumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: design.thumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: pdfPreview, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: design.fileUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
      { url: reconstructed, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    );
  }

  return candidates;
}

function buildCandidates(item: PreviewableItem): Candidate[] {
  const manifest = item.artwork_manifest || null;
  const reconstructed = buildCloudinaryUrlFromFileKey(
    item.file_key || manifest?.publicId,
    {
      format: manifest?.format,
      fileName: item.file_name,
      isPdf: item.is_pdf,
      resourceType: manifest?.resourceType,
    },
  );
  const original = normalizeUrl(manifest?.originalUrl) || normalizeUrl(item.file_url) || reconstructed;
  const pdfPreview = buildCloudinaryPdfPreviewUrl(manifest?.originalUrl)
    || buildCloudinaryPdfPreviewUrl(item.file_url)
    || buildCloudinaryPdfPreviewUrl(reconstructed);
  const yardSign = getYardSignCandidates(item);
  const designRequestSources = getDesignRequestSources(item);
  const canvasSources = getCanvasSources(item);
  const designAssets = Array.isArray(item.design_uploaded_assets)
    ? item.design_uploaded_assets.flatMap((asset) => [
        asset.url,
        buildCloudinaryUrlFromFileKey(asset.fileKey),
      ])
    : [];

  const exactComposition: Candidate[] = [
    ...yardSign,
    { url: item.placement_preview?.url, source: 'placement_preview', exactComposition: true, lowResolution: false },
    { url: item.final_render_url, source: 'final_render', exactComposition: true, lowResolution: false },
    { url: item.web_preview_url, source: 'web_preview', exactComposition: true, lowResolution: false },
    { url: item.thumbnail_url, source: 'thumbnail_fallback', exactComposition: true, lowResolution: false },
    { url: item.aiDesign?.assets?.proofUrl, source: 'web_preview', exactComposition: true, lowResolution: false },
    { url: item.aiDesign?.assets?.finalUrl, source: 'final_render', exactComposition: true, lowResolution: false },
    ...designRequestSources.map((url): Candidate => ({
      url,
      source: 'web_preview',
      exactComposition: true,
      lowResolution: false,
    })),
    ...canvasSources.map((url): Candidate => ({
      url,
      source: 'web_preview',
      exactComposition: true,
      lowResolution: false,
    })),
  ];

  const originals: Candidate[] = [
    { url: pdfPreview, source: 'original_fallback', exactComposition: false, lowResolution: false },
    { url: original, source: 'original_fallback', exactComposition: false, lowResolution: false },
    { url: item.print_ready_url, source: 'original_fallback', exactComposition: false, lowResolution: false },
    ...designAssets.map((url): Candidate => ({
      url,
      source: 'original_fallback',
      exactComposition: false,
      lowResolution: false,
    })),
  ];

  // Permanent exact-composition sources always win. Temporary data images are
  // retained only as an immediate in-session bridge while permanent uploads
  // finish; blob URLs never outrank a permanent representation.
  const permanent = [...exactComposition, ...originals].filter((candidate) => (
    isPermanentPreviewUrl(candidate.url)
  ));
  const temporaryData = [...exactComposition, ...originals].filter((candidate) => (
    isTemporaryDataUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const temporaryBlob = [...exactComposition, ...originals].filter((candidate) => (
    isTemporaryBlobUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));

  return [...permanent, ...temporaryData, ...temporaryBlob];
}

function safeCandidateUrls(candidates: Candidate[]): string[] {
  return dedupePreviewImageSources(candidates
    .map((candidate) => normalizeUrl(candidate.url))
    .filter((url) => Boolean(url) && !isRawPdfUrl(url) && !isPdfUrl(url)));
}

export const getPreviewSourceCandidates = (item: PreviewableItem): string[] => (
  safeCandidateUrls(buildCandidates(item))
);

function registerSelection(selectedUrl: string, candidates: Candidate[]) {
  const urls = safeCandidateUrls(candidates);
  registerPreviewSourceCandidates(selectedUrl, urls);
}

/**
 * Select the enlarged source from the same deterministic artwork identity used
 * by the small thumbnail. High-resolution exact snapshots outrank generic
 * originals, while every usable representation remains registered as a decode
 * fallback. This prevents a Yard Sign or banner lightbox from showing a
 * different file than the card the customer clicked.
 */
export const getExpandedPreviewSelection = (item: PreviewableItem): ExpandedPreviewSelection => {
  const candidates = buildCandidates(item);
  const selected = candidates[0];

  if (!selected?.url) {
    return {
      url: null,
      source: 'none',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
    };
  }

  const url = normalizeUrl(selected.url);
  registerSelection(url, candidates);
  const hasHigherResolutionPending = selected.lowResolution && candidates.some((candidate) => (
    !candidate.lowResolution && isPermanentPreviewUrl(candidate.url)
  ));

  return {
    url,
    source: selected.source,
    isLowResolutionFallback: selected.lowResolution,
    isPreparingHighResolution: hasHigherResolutionPending,
  };
};

/**
 * Select the compact commerce thumbnail. It uses the same ordered candidate
 * chain as the lightbox, so the expanded view cannot drift to unrelated
 * artwork. The renderer derives a compact CDN version without changing the
 * original/print asset.
 */
export const getSmallPreviewUrl = (item: PreviewableItem): string | null => {
  const candidates = buildCandidates(item);
  const selected = candidates[0];
  if (!selected?.url) return null;

  const url = normalizeUrl(selected.url);
  registerSelection(url, candidates);
  return url;
};
