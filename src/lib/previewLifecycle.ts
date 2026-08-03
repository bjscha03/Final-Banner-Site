import type {
  ArtworkFitMode,
  PlacementPreviewManifest,
} from '@/types/artwork';

export const PREVIEW_ARTIFACT_VERSION = 3 as const;

export type NormalizedArtworkTransform = {
  xPct: number;
  yPct: number;
  scaleX: number;
  scaleY: number;
};

export type ArtworkCompositionSpec = {
  version: typeof PREVIEW_ARTIFACT_VERSION;
  sourceUrl: string;
  sourceIdentity: string;
  productType: string;
  widthIn: number;
  heightIn: number;
  fitMode: ArtworkFitMode;
  transform: NormalizedArtworkTransform;
  revision: number;
};

export type ReadyPlacementPreviewManifest = PlacementPreviewManifest & {
  version: typeof PREVIEW_ARTIFACT_VERSION;
  uploadStatus: 'uploaded';
  sourceIdentity: string;
  sourceUrl: string;
  productType: string;
  widthIn: number;
  heightIn: number;
  fitMode: ArtworkFitMode;
  positionPct: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  compositionRevision: number;
  compositionSignature: string;
  url: string;
  publicId: string;
  previewUrl: string;
  previewPublicId: string;
  previewWidthPx: number;
  previewHeightPx: number;
  uploadedAt: string;
  createdAt: string;
  error: null;
};

export type PreviewLifecycleErrorCode =
  | 'ARTWORK_NOT_SELECTED'
  | 'ORIGINAL_UPLOAD_INCOMPLETE'
  | 'PERMANENT_PREVIEW_UNAVAILABLE'
  | 'PREVIEW_GEOMETRY_NOT_READY'
  | 'INVALID_PRODUCT_DIMENSIONS'
  | 'INVALID_ARTWORK_TRANSFORM'
  | 'SOURCE_IMAGE_DECODE_FAILED'
  | 'CANVAS_ALLOCATION_FAILED'
  | 'CANVAS_CONTEXT_UNAVAILABLE'
  | 'CANVAS_EXPORT_FAILED'
  | 'PREVIEW_RENDERED_BLANK'
  | 'PREVIEW_UPLOAD_FAILED'
  | 'PREVIEW_UPLOAD_UNREADABLE'
  | 'COMPOSITION_CHANGED';

export class PreviewLifecycleError extends Error {
  readonly code: PreviewLifecycleErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PreviewLifecycleErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PreviewLifecycleError';
    this.code = code;
    this.details = details;
  }
}

const finite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export const canonicalPreviewNumber = (value: number) => Number(value.toFixed(6));

export function normalizedTransformFromPixels(
  value: { x: number; y: number; scaleX: number; scaleY: number },
  canvas: { width: number; height: number },
): NormalizedArtworkTransform {
  if (!finite(canvas.width) || !finite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    throw new PreviewLifecycleError(
      'PREVIEW_GEOMETRY_NOT_READY',
      'The visible artwork canvas has no usable geometry.',
      { canvas },
    );
  }

  return {
    xPct: canonicalPreviewNumber((value.x / canvas.width) * 100),
    yPct: canonicalPreviewNumber((value.y / canvas.height) * 100),
    scaleX: canonicalPreviewNumber(value.scaleX),
    scaleY: canonicalPreviewNumber(value.scaleY),
  };
}

export function validateCompositionSpec(spec: ArtworkCompositionSpec): ArtworkCompositionSpec {
  if (!spec.sourceIdentity) {
    throw new PreviewLifecycleError(
      'ORIGINAL_UPLOAD_INCOMPLETE',
      'The permanent original artwork identity is missing.',
    );
  }
  if (!/^https?:\/\//i.test(spec.sourceUrl)) {
    throw new PreviewLifecycleError(
      'PERMANENT_PREVIEW_UNAVAILABLE',
      'A permanent browser-readable artwork URL is required.',
      { sourceUrlKind: String(spec.sourceUrl || '').split(':', 1)[0] || 'empty' },
    );
  }
  if (!spec.productType) {
    throw new PreviewLifecycleError('INVALID_PRODUCT_DIMENSIONS', 'The product type is missing.');
  }
  if (!finite(spec.widthIn) || !finite(spec.heightIn) || spec.widthIn <= 0 || spec.heightIn <= 0) {
    throw new PreviewLifecycleError(
      'INVALID_PRODUCT_DIMENSIONS',
      'The product width and height must both be greater than zero.',
      { widthIn: spec.widthIn, heightIn: spec.heightIn },
    );
  }
  if (!finite(spec.revision) || spec.revision < 0) {
    throw new PreviewLifecycleError(
      'INVALID_ARTWORK_TRANSFORM',
      'The composition revision is invalid.',
      { revision: spec.revision },
    );
  }
  const { xPct, yPct, scaleX, scaleY } = spec.transform;
  if (![xPct, yPct, scaleX, scaleY].every(finite) || scaleX <= 0 || scaleY <= 0) {
    throw new PreviewLifecycleError(
      'INVALID_ARTWORK_TRANSFORM',
      'The artwork position or scale is invalid.',
      { transform: spec.transform },
    );
  }
  return spec;
}

function hashCanonicalPayload(payload: string): string {
  // Two independent 32-bit streams give a deterministic 64-bit browser-safe
  // key without making signature creation asynchronous. Including revision in
  // the payload prevents an old result from winning after change-away/change-back.
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193);
    b ^= code + index;
    b = Math.imul(b, 0x85ebca6b);
    b ^= b >>> 13;
  }
  return `${(a >>> 0).toString(36).padStart(7, '0')}${(b >>> 0).toString(36).padStart(7, '0')}`;
}

export function buildCompositionSignature(spec: ArtworkCompositionSpec): string {
  validateCompositionSpec(spec);
  const payload = [
    `v${spec.version}`,
    spec.sourceIdentity,
    spec.productType,
    canonicalPreviewNumber(spec.widthIn),
    canonicalPreviewNumber(spec.heightIn),
    spec.fitMode,
    canonicalPreviewNumber(spec.transform.xPct),
    canonicalPreviewNumber(spec.transform.yPct),
    canonicalPreviewNumber(spec.transform.scaleX),
    canonicalPreviewNumber(spec.transform.scaleY),
    Math.trunc(spec.revision),
  ].join('|');
  return `placement-v${spec.version}-${hashCanonicalPayload(payload)}`;
}

export function isReadyPlacementPreview(
  preview: PlacementPreviewManifest | null | undefined,
): preview is ReadyPlacementPreviewManifest {
  if (!preview || preview.uploadStatus !== 'uploaded') return false;
  const url = String(preview.previewUrl || preview.url || '').trim();
  const publicId = String(preview.previewPublicId || preview.publicId || '').trim();
  const position = preview.positionPct;
  const structurallyReady = preview.version === PREVIEW_ARTIFACT_VERSION
    && /^https?:\/\//i.test(url)
    && /^https?:\/\//i.test(String(preview.sourceUrl || ''))
    && Boolean(publicId)
    && Boolean(preview.sourceIdentity)
    && Boolean(preview.productType)
    && finite(preview.widthIn)
    && preview.widthIn > 0
    && finite(preview.heightIn)
    && preview.heightIn > 0
    && ['fit', 'fill', 'stretch'].includes(String(preview.fitMode || ''))
    && Boolean(position)
    && finite(position?.x)
    && finite(position?.y)
    && finite(preview.scaleX)
    && preview.scaleX > 0
    && finite(preview.scaleY)
    && preview.scaleY > 0
    && finite(preview.compositionRevision)
    && preview.compositionRevision >= 0
    && Boolean(preview.compositionSignature)
    && Number(preview.previewWidthPx) > 0
    && Number(preview.previewHeightPx) > 0;
  if (!structurallyReady) return false;

  try {
    return preview.compositionSignature === buildCompositionSignature({
      version: PREVIEW_ARTIFACT_VERSION,
      sourceIdentity: preview.sourceIdentity!,
      sourceUrl: preview.sourceUrl!,
      productType: preview.productType!,
      widthIn: preview.widthIn!,
      heightIn: preview.heightIn!,
      fitMode: preview.fitMode!,
      transform: {
        xPct: position!.x,
        yPct: position!.y,
        scaleX: preview.scaleX!,
        scaleY: preview.scaleY!,
      },
      revision: preview.compositionRevision!,
    });
  } catch {
    return false;
  }
}

export function placementPreviewMatches(
  preview: PlacementPreviewManifest | null | undefined,
  spec: ArtworkCompositionSpec,
): preview is ReadyPlacementPreviewManifest {
  return isReadyPlacementPreview(preview)
    && preview.compositionSignature === buildCompositionSignature(spec)
    && preview.compositionRevision === spec.revision
    && preview.sourceIdentity === spec.sourceIdentity
    && preview.productType === spec.productType
    && preview.widthIn === spec.widthIn
    && preview.heightIn === spec.heightIn;
}

export function toCheckoutTransform(spec: ArtworkCompositionSpec) {
  return {
    pos: {
      x: canonicalPreviewNumber(spec.transform.xPct),
      y: canonicalPreviewNumber(spec.transform.yPct),
    },
    scale: canonicalPreviewNumber(spec.transform.scaleX),
    scaleY: canonicalPreviewNumber(spec.transform.scaleY),
  };
}

export function explainPreviewLifecycleError(error: unknown): {
  code: PreviewLifecycleErrorCode | 'UNKNOWN_PREVIEW_ERROR';
  title: string;
  description: string;
  technicalReason: string;
} {
  const code = error instanceof PreviewLifecycleError
    ? error.code
    : 'UNKNOWN_PREVIEW_ERROR';
  const messages: Record<PreviewLifecycleErrorCode | 'UNKNOWN_PREVIEW_ERROR', [string, string]> = {
    ARTWORK_NOT_SELECTED: ['Artwork is not selected', 'Choose an artwork file before continuing.'],
    ORIGINAL_UPLOAD_INCOMPLETE: ['Original upload incomplete', 'The original file could not be stored securely. No cart item was created.'],
    PERMANENT_PREVIEW_UNAVAILABLE: ['Permanent preview unavailable', 'The permanent browser preview is unavailable. No cart item was created.'],
    PREVIEW_GEOMETRY_NOT_READY: ['Canvas geometry unavailable', 'The visible artwork canvas did not report valid geometry. No cart item was created.'],
    INVALID_PRODUCT_DIMENSIONS: ['Product dimensions are invalid', 'Enter a valid width and height before continuing.'],
    INVALID_ARTWORK_TRANSFORM: ['Artwork placement is invalid', 'The saved artwork position or scale is invalid. No cart item was created.'],
    SOURCE_IMAGE_DECODE_FAILED: ['Source image decode failed', 'The permanent artwork source could not be decoded by this browser.'],
    CANVAS_ALLOCATION_FAILED: ['Preview canvas allocation failed', 'This browser could not allocate the bounded preview canvas.'],
    CANVAS_CONTEXT_UNAVAILABLE: ['Preview renderer unavailable', 'This browser could not create a 2D preview renderer.'],
    CANVAS_EXPORT_FAILED: ['Preview export failed', 'The browser returned no image while exporting the exact composition.'],
    PREVIEW_RENDERED_BLANK: ['Rendered preview was blank', 'The exact composition contained no visible artwork. No cart item was created.'],
    PREVIEW_UPLOAD_FAILED: ['Permanent preview upload failed', 'The exact preview could not be stored securely. No cart item was created.'],
    PREVIEW_UPLOAD_UNREADABLE: ['Uploaded preview unreadable', 'The stored preview could not be decoded and verified after upload.'],
    COMPOSITION_CHANGED: ['Composition changed during preparation', 'The artwork kept changing while its exact preview was being finalized. No cart item was created.'],
    UNKNOWN_PREVIEW_ERROR: ['Exact preview could not be prepared', 'The exact artwork composition could not be finalized. No cart item was created.'],
  };
  const [title, description] = messages[code];
  return {
    code,
    title,
    description,
    technicalReason: error instanceof Error ? error.message : String(error),
  };
}
