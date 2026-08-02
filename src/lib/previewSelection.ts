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

export type PreviewSelection = {
  url: string | null;
  source: PreviewSource;
  isLowResolutionFallback: boolean;
  isPreparingHighResolution: boolean;
  isExactComposition: boolean;
};

export type ExpandedPreviewSelection = PreviewSelection;

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
    { url: design.previewThumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: design.thumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: pdfPreview, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: design.fileUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: reconstructed, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
  ];
}

function isExactThumbnailSource(item: PreviewableItem): boolean {
  const thumbnail = normalizeUrl(item.thumbnail_url);
  if (!thumbnail) return false;
  if (isTemporaryDataUrl(thumbnail)) return true;
  if (isTemporaryBlobUrl(thumbnail)) return false;

  const manifestOriginal = normalizeUrl(item.artwork_manifest?.originalUrl);
  const fileOriginal = normalizeUrl(item.file_url);
  if (thumbnail === manifestOriginal || thumbnail === fileOriginal) return false;

  return true;
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
    {
      url: item.thumbnail_url,
      source: 'thumbnail_fallback',
      exactComposition: isExactThumbnailSource(item),
      lowResolution: false,
    },
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

  const all = [...exactComposition, ...originals];
  const permanentExact = all.filter((candidate) => (
    candidate.exactComposition && isPermanentPreviewUrl(candidate.url)
  ));
  const temporaryExactData = all.filter((candidate) => (
    candidate.exactComposition && isTemporaryDataUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const temporaryExactBlob = all.filter((candidate) => (
    candidate.exactComposition && isTemporaryBlobUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const permanentOriginal = all.filter((candidate) => (
    !candidate.exactComposition && isPermanentPreviewUrl(candidate.url)
  ));
  const temporaryOriginalData = all.filter((candidate) => (
    !candidate.exactComposition && isTemporaryDataUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));
  const temporaryOriginalBlob = all.filter((candidate) => (
    !candidate.exactComposition && isTemporaryBlobUrl(candidate.url)
  )).map((candidate) => ({ ...candidate, lowResolution: true }));

  // Composition fidelity is the first invariant. A temporary baked snapshot
  // must beat a generic permanent original; otherwise checkout can show a
  // mostly-white, uncropped source instead of the exact canvas the customer
  // approved. Permanent exact proofs still outrank all temporary sources.
  return [
    ...permanentExact,
    ...temporaryExactData,
    ...temporaryExactBlob,
    ...permanentOriginal,
    ...temporaryOriginalData,
    ...temporaryOriginalBlob,
  ];
}

function safeCandidateUrls(candidates: Candidate[]): string[] {
  return dedupePreviewImageSources(candidates
    .map((candidate) => normalizeUrl(candidate.url))
    .filter((url) => Boolean(url) && !isRawPdfUrl(url) && !isPdfUrl(url)));
}

export const getPreviewSourceCandidates = (item: PreviewableItem): string[] => (
  safeCandidateUrls(buildCandidates(item))
);

function registerSelection(selectedUrl: string, candidates: Candidate[], selected: Candidate) {
  const urls = safeCandidateUrls(candidates);
  registerPreviewSourceCandidates(selectedUrl, urls, {
    exactComposition: selected.exactComposition,
    exactCompositionUrls: candidates
      .filter((candidate) => candidate.exactComposition)
      .map((candidate) => normalizeUrl(candidate.url))
      .filter(Boolean),
  });
}

function selectPreview(item: PreviewableItem): PreviewSelection {
  const candidates = buildCandidates(item);
  const selected = candidates[0];

  if (!selected?.url) {
    return {
      url: null,
      source: 'none',
      isLowResolutionFallback: false,
      isPreparingHighResolution: false,
      isExactComposition: false,
    };
  }

  const url = normalizeUrl(selected.url);
  registerSelection(url, candidates, selected);
  const isPreparingHighResolution = selected.lowResolution
    && selected.exactComposition
    && candidates.some((candidate) => (
      candidate.exactComposition
      && !candidate.lowResolution
      && isPermanentPreviewUrl(candidate.url)
    ));

  return {
    url,
    source: selected.source,
    isLowResolutionFallback: selected.lowResolution,
    isPreparingHighResolution,
    isExactComposition: selected.exactComposition,
  };
}

/**
 * Select the enlarged source from the same deterministic artwork identity used
 * by the small thumbnail. High-resolution exact snapshots outrank generic
 * originals, while every usable representation remains registered as a decode
 * fallback. This prevents a Yard Sign or banner lightbox from showing a
 * different file than the card the customer clicked.
 */
export const getExpandedPreviewSelection = (item: PreviewableItem): ExpandedPreviewSelection => (
  selectPreview(item)
);

/**
 * Return the full compact-preview selection, including whether the source is a
 * baked composition. Callers use this to avoid applying position and scale a
 * second time when a temporary or permanent positioned thumbnail is selected.
 */
export const getSmallPreviewSelection = (item: PreviewableItem): PreviewSelection => (
  selectPreview(item)
);

/**
 * Backward-compatible compact URL helper.
 */
export const getSmallPreviewUrl = (item: PreviewableItem): string | null => (
  getSmallPreviewSelection(item).url
);
