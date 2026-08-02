import type { PlacementPreviewManifest } from '@/types/artwork';

export const PREVIEW_ARTIFACT_VERSION = 2;

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
  widthIn: number;
  heightIn: number;
  fitMode: 'fill' | 'fit' | 'stretch';
  transform: NormalizedArtworkTransform;
  revision: number;
};

export type ReadyPlacementPreviewManifest = PlacementPreviewManifest & {
  version: typeof PREVIEW_ARTIFACT_VERSION;
  uploadStatus: 'uploaded';
  url: string;
  publicId: string;
  signature: string;
  sourceIdentity: string;
  widthIn: number;
  heightIn: number;
  widthPx: number;
  heightPx: number;
  fitMode: 'fill' | 'fit' | 'stretch';
  positionPct: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  uploadedAt: string;
};

export type PreviewLifecycleErrorCode =
  | 'ARTWORK_NOT_SELECTED'
  | 'ORIGINAL_UPLOAD_INCOMPLETE'
  | 'PERMANENT_PREVIEW_UNAVAILABLE'
  | 'PREVIEW_GEOMETRY_NOT_READY'
  | 'INVALID_PRODUCT_DIMENSIONS'
  | 'INVALID_ARTWORK_TRANSFORM'
  | 'SOURCE_IMAGE_LOAD_FAILED'
  | 'CANVAS_CONTEXT_UNAVAILABLE'
  | 'CANVAS_EXPORT_FAILED'
  | 'PREVIEW_RENDERED_BLANK'
  | 'PREVIEW_UPLOAD_FAILED'
  | 'PREVIEW_UPLOAD_UNREADABLE'
  | 'PREVIEW_STATE_CHANGED';

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

const canonicalNumber = (value: number) => Number(value.toFixed(6));

export function normalizedTransformFromPixels(
  value: { x: number; y: number; scaleX: number; scaleY: number },
  canvas: { width: number; height: number },
): NormalizedArtworkTransform {
  if (!finite(canvas.width) || !finite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
    throw new PreviewLifecycleError(
      'PREVIEW_GEOMETRY_NOT_READY',
      'The artwork canvas does not have usable dimensions yet.',
      { canvas },
    );
  }

  return {
    xPct: canonicalNumber((value.x / canvas.width) * 100),
    yPct: canonicalNumber((value.y / canvas.height) * 100),
    scaleX: canonicalNumber(value.scaleX),
    scaleY: canonicalNumber(value.scaleY),
  };
}

export function validateCompositionSpec(spec: ArtworkCompositionSpec): ArtworkCompositionSpec {
  if (!spec.sourceUrl || !spec.sourceIdentity) {
    throw new PreviewLifecycleError(
      'PERMANENT_PREVIEW_UNAVAILABLE',
      'A permanent browser-readable artwork source is required.',
    );
  }

  if (!finite(spec.widthIn) || !finite(spec.heightIn) || spec.widthIn <= 0 || spec.heightIn <= 0) {
    throw new PreviewLifecycleError(
      'INVALID_PRODUCT_DIMENSIONS',
      'The product width and height must both be greater than zero.',
      { widthIn: spec.widthIn, heightIn: spec.heightIn },
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

export function buildCompositionSignature(spec: ArtworkCompositionSpec): string {
  validateCompositionSpec(spec);
  const payload = [
    `v${spec.version}`,
    spec.sourceIdentity,
    canonicalNumber(spec.widthIn),
    canonicalNumber(spec.heightIn),
    spec.fitMode,
    canonicalNumber(spec.transform.xPct),
    canonicalNumber(spec.transform.yPct),
    canonicalNumber(spec.transform.scaleX),
    canonicalNumber(spec.transform.scaleY),
  ].join('|');

  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `preview-v${spec.version}-${(hash >>> 0).toString(36)}`;
}

export function placementPreviewMatches(
  preview: PlacementPreviewManifest | null | undefined,
  spec: ArtworkCompositionSpec,
): preview is ReadyPlacementPreviewManifest {
  if (!preview || preview.uploadStatus !== 'uploaded' || !preview.url || !preview.publicId) return false;
  const enriched = preview as Partial<ReadyPlacementPreviewManifest>;
  return enriched.version === PREVIEW_ARTIFACT_VERSION
    && enriched.signature === buildCompositionSignature(spec)
    && enriched.sourceIdentity === spec.sourceIdentity
    && enriched.widthIn === spec.widthIn
    && enriched.heightIn === spec.heightIn;
}

export function toCheckoutTransform(spec: ArtworkCompositionSpec) {
  return {
    pos: {
      x: canonicalNumber(spec.transform.xPct),
      y: canonicalNumber(spec.transform.yPct),
    },
    scale: canonicalNumber(spec.transform.scaleX),
    scaleY: canonicalNumber(spec.transform.scaleY),
  };
}

export function explainPreviewLifecycleError(error: unknown): {
  code: PreviewLifecycleErrorCode | 'UNKNOWN_PREVIEW_ERROR';
  title: string;
  description: string;
} {
  const code = error instanceof PreviewLifecycleError
    ? error.code
    : 'UNKNOWN_PREVIEW_ERROR';

  const messages: Record<PreviewLifecycleErrorCode | 'UNKNOWN_PREVIEW_ERROR', [string, string]> = {
    ARTWORK_NOT_SELECTED: ['Artwork is not selected', 'Choose an artwork file before continuing.'],
    ORIGINAL_UPLOAD_INCOMPLETE: ['Artwork upload did not finish', 'The original file could not be stored securely. No cart item was created.'],
    PERMANENT_PREVIEW_UNAVAILABLE: ['Artwork preview is unavailable', 'The permanent browser preview could not be loaded. No incorrect thumbnail was stored.'],
    PREVIEW_GEOMETRY_NOT_READY: ['Artwork canvas is not ready', 'The visible artwork canvas did not report valid geometry. No cart item was created.'],
    INVALID_PRODUCT_DIMENSIONS: ['Banner dimensions are invalid', 'Enter a valid width and height before continuing.'],
    INVALID_ARTWORK_TRANSFORM: ['Artwork placement is invalid', 'The saved artwork position or scale is invalid. No cart item was created.'],
    SOURCE_IMAGE_LOAD_FAILED: ['Artwork could not be decoded', 'The permanent artwork source could not be decoded by this browser. No cart item was created.'],
    CANVAS_CONTEXT_UNAVAILABLE: ['Preview renderer is unavailable', 'This browser could not create the preview canvas. No cart item was created.'],
    CANVAS_EXPORT_FAILED: ['Preview export failed', 'The browser could not export the exact composition. No cart item was created.'],
    PREVIEW_RENDERED_BLANK: ['Preview contained no visible artwork', 'The exact composition rendered without visible artwork. No cart item was created.'],
    PREVIEW_UPLOAD_FAILED: ['Exact preview upload failed', 'The finished preview could not be stored securely. No cart item was created.'],
    PREVIEW_UPLOAD_UNREADABLE: ['Stored preview could not be verified', 'The stored preview could not be decoded after upload. No cart item was created.'],
    PREVIEW_STATE_CHANGED: ['Artwork changed while preparing', 'The artwork changed during preview generation and the latest composition could not be finalized. No cart item was created.'],
    UNKNOWN_PREVIEW_ERROR: ['Exact preview could not be prepared', 'The exact artwork composition could not be finalized. No cart item was created.'],
  };

  const [title, description] = messages[code];
  return { code, title, description };
}
