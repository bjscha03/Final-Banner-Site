import { dedupePreviewImageSources } from './previewImageCache';
import { registerPreviewSourceCandidates } from './previewSourceRegistry';
import { isReadyPlacementPreview } from './previewLifecycle';
import type { PlacementPreviewManifest } from '@/types/artwork';

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
  isExactComposition: boolean;
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
  version?: number | null;
  sourceUrl?: string | null;
  productType?: string | null;
  widthIn?: number | null;
  heightIn?: number | null;
  fitMode?: string | null;
  positionPct?: { x: number; y: number } | null;
  scaleX?: number | null;
  scaleY?: number | null;
  compositionRevision?: number | null;
  url?: string | null;
  publicId?: string | null;
  previewUrl?: string | null;
  previewPublicId?: string | null;
  previewWidthPx?: number | null;
  previewHeightPx?: number | null;
  sourceIdentity?: string | null;
  compositionSignature?: string | null;
  uploadStatus?: string | null;
};

type YardSignDesignLike = {
  previewThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
  isPdf?: boolean | null;
  placementPreview?: PlacementPreviewLike | null;
};

export type PreviewableItem = {
  product_type?: string | null;
  width_in?: number | null;
  height_in?: number | null;
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
  immutableExactArtifact?: boolean;
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

type CanvasSources = {
  exact: string[];
  originals: string[];
};

function getCanvasSources(item: PreviewableItem): CanvasSources {
  const parsed = parseJsonObject(item.canvas_state_json);
  if (!parsed) return { exact: [], originals: [] };

  // Only fields that explicitly describe a rendered output may participate in
  // the exact-composition chain. `previewUrl` and image-object URLs are source
  // artwork in the designer's persisted scene; treating them as baked output
  // is what allowed the uncropped original to replace the approved placement
  // at checkout.
  const exactValues: Array<string | null | undefined> = [
    parsed.finalRenderUrl,
    parsed.webPreviewUrl,
    parsed.approvedProofUrl,
    parsed.thumbnailUrl,
  ];
  const originalValues: Array<string | null | undefined> = [
    parsed.originalImageUrl,
    parsed.productionUrl,
    parsed.previewUrl,
  ];
  const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
  for (const object of objects) {
    if (!object || typeof object !== 'object' || object.type !== 'image') continue;
    originalValues.push(
      object.source?.previewUrl,
      object.source?.originalUrl,
      object.previewUrl,
      object.url,
      object.src,
    );
  }
  return {
    exact: dedupePreviewImageSources(exactValues),
    originals: dedupePreviewImageSources(originalValues),
  };
}

function getYardSignCandidates(item: PreviewableItem): Candidate[] {
  const designs = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const design = designs[0];
  if (!design) return [];

  // An item-level Yard Sign thumbnail represents the first uploaded design.
  // Never fall through to design two when design one's first derivative fails;
  // that would make the expanded view show different customer artwork.
  const reconstructed = buildCloudinaryUrlFromFileKey(design.fileKey, {
    fileName: design.fileUrl,
    isPdf: design.isPdf,
  });
  const pdfPreview = buildCloudinaryPdfPreviewUrl(design.fileUrl)
    || buildCloudinaryPdfPreviewUrl(reconstructed);
  return [
    { url: design.previewThumbnailUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: design.thumbnailUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: pdfPreview, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: design.fileUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: reconstructed, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
  ];
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

  // A v3 ready artifact is immutable and already contains the full placement.
  // Its fallback chain deliberately excludes the original artwork: showing a
  // materially different crop is worse than showing Preview unavailable.
  if (isReadyPlacementPreview(item.placement_preview as PlacementPreviewManifest | null | undefined)
    && (!item.product_type || item.placement_preview?.productType === item.product_type)
    && (!(Number(item.width_in) > 0) || item.placement_preview?.widthIn === Number(item.width_in))
    && (!(Number(item.height_in) > 0) || item.placement_preview?.heightIn === Number(item.height_in))) {
    const exactUrl = normalizeUrl(item.placement_preview?.previewUrl)
      || normalizeUrl(item.placement_preview?.url);
    return [{
      url: exactUrl,
      source: 'placement_preview',
      exactComposition: true,
      lowResolution: false,
      immutableExactArtifact: true,
    }];
  }

  // The presence of a non-ready canonical manifest means an exact artifact
  // was expected but never became authoritative. Do not silently substitute
  // an original or a legacy thumbnail under that failed exact composition.
  if (item.placement_preview) return [];

  const firstYardDesign = Array.isArray(item.yard_sign_designs)
    ? item.yard_sign_designs[0]
    : null;
  if (firstYardDesign?.placementPreview) {
    const yardPlacement = firstYardDesign.placementPreview as PlacementPreviewManifest;
    const parentProductMatches = !item.product_type
      || yardPlacement.productType === item.product_type;
    const parentWidthMatches = !(Number(item.width_in) > 0)
      || yardPlacement.widthIn === Number(item.width_in);
    const parentHeightMatches = !(Number(item.height_in) > 0)
      || yardPlacement.heightIn === Number(item.height_in);
    if (!isReadyPlacementPreview(yardPlacement)
      || !parentProductMatches
      || !parentWidthMatches
      || !parentHeightMatches) {
      return [];
    }
    return [{
      url: normalizeUrl(yardPlacement.previewUrl) || normalizeUrl(yardPlacement.url),
      source: 'yard_sign_preview',
      exactComposition: true,
      lowResolution: false,
      immutableExactArtifact: true,
    }];
  }

  const thumbnailIsOriginal = [original, pdfPreview, reconstructed]
    .filter(Boolean)
    .some((url) => normalizeUrl(url) === normalizeUrl(item.thumbnail_url));

  const exactComposition: Candidate[] = [
    ...yardSign,
    { url: item.final_render_url, source: 'final_render', exactComposition: true, lowResolution: false },
    { url: item.web_preview_url, source: 'web_preview', exactComposition: true, lowResolution: false },
    { url: thumbnailIsOriginal ? null : item.thumbnail_url, source: 'thumbnail_fallback', exactComposition: true, lowResolution: false },
    { url: item.aiDesign?.assets?.proofUrl, source: 'web_preview', exactComposition: true, lowResolution: false },
    { url: item.aiDesign?.assets?.finalUrl, source: 'final_render', exactComposition: true, lowResolution: false },
    ...designRequestSources.map((url): Candidate => ({
      url,
      source: 'web_preview',
      exactComposition: true,
      lowResolution: false,
    })),
    ...canvasSources.exact.map((url): Candidate => ({
      url,
      source: 'web_preview',
      exactComposition: true,
      lowResolution: false,
    })),
  ];

  const originals: Candidate[] = [
    { url: thumbnailIsOriginal ? item.thumbnail_url : null, source: 'original_fallback', exactComposition: false, lowResolution: false },
    { url: pdfPreview, source: 'original_fallback', exactComposition: false, lowResolution: false },
    { url: original, source: 'original_fallback', exactComposition: false, lowResolution: false },
    { url: item.print_ready_url, source: 'original_fallback', exactComposition: false, lowResolution: false },
    ...designAssets.map((url): Candidate => ({
      url,
      source: 'original_fallback',
      exactComposition: false,
      lowResolution: false,
    })),
    ...canvasSources.originals.map((url): Candidate => ({
      url,
      source: 'original_fallback',
      exactComposition: false,
      lowResolution: false,
    })),
  ];

  const permanentExact = exactComposition.filter((candidate) => (
    isPermanentPreviewUrl(candidate.url)
  ));
  const temporaryExact = exactComposition.filter((candidate) => (
    isTemporaryDataUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const permanentOriginal = originals.filter((candidate) => (
    isPermanentPreviewUrl(candidate.url)
  ));
  const temporaryOriginalData = originals.filter((candidate) => (
    isTemporaryDataUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const temporaryBlob = [...exactComposition, ...originals].filter((candidate) => (
    isTemporaryBlobUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));

  return [...permanentExact, ...temporaryExact, ...permanentOriginal, ...temporaryOriginalData, ...temporaryBlob];
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
  const selected = candidates.find((candidate) => normalizeUrl(candidate.url) === selectedUrl);
  registerPreviewSourceCandidates(selectedUrl, urls, {
    exactComposition: selected?.exactComposition === true,
    immutableExactArtifact: selected?.immutableExactArtifact === true,
  });
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
      isExactComposition: false,
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
    isExactComposition: selected.exactComposition,
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

export const getSmallPreviewSelection = (item: PreviewableItem): ExpandedPreviewSelection => (
  getExpandedPreviewSelection(item)
);
