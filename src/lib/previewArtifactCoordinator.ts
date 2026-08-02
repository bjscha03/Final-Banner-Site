import { preloadPreviewImage, isVisuallyBlankPreviewResult } from '@/lib/previewImageCache';
import {
  ArtworkCompositionSpec,
  PreviewLifecycleError,
  ReadyPlacementPreviewManifest,
  buildCompositionSignature,
  validateCompositionSpec,
} from '@/lib/previewLifecycle';
import { renderPositionedThumbnailDataUrl } from '@/utils/generatePositionedThumbnail';
import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';

const inFlightBySignature = new Map<string, Promise<ReadyPlacementPreviewManifest>>();

function mapRenderError(error: unknown): PreviewLifecycleError {
  if (error instanceof PreviewLifecycleError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/2D context|canvas context/i.test(message)) {
    return new PreviewLifecycleError('CANVAS_CONTEXT_UNAVAILABLE', message);
  }
  if (/source image|failed to load|timed out|decode/i.test(message)) {
    return new PreviewLifecycleError('SOURCE_IMAGE_LOAD_FAILED', message);
  }
  if (/empty image|data:,|export/i.test(message)) {
    return new PreviewLifecycleError('CANVAS_EXPORT_FAILED', message);
  }
  return new PreviewLifecycleError('CANVAS_EXPORT_FAILED', message);
}

async function createArtifact(
  spec: ArtworkCompositionSpec,
): Promise<ReadyPlacementPreviewManifest> {
  validateCompositionSpec(spec);
  const signature = buildCompositionSignature(spec);

  let rendered: { dataUrl: string; widthPx: number; heightPx: number };
  try {
    rendered = await renderPositionedThumbnailDataUrl({
      imageUrl: spec.sourceUrl,
      widthIn: spec.widthIn,
      heightIn: spec.heightIn,
      imgPosPercent: {
        x: spec.transform.xPct,
        y: spec.transform.yPct,
      },
      imgScale: spec.transform.scaleX,
      imgScaleY: spec.transform.scaleY,
      backgroundColor: '#ffffff',
      maxOutputPx: 1400,
      maxOutputPixels: 1_500_000,
    });
  } catch (error) {
    throw mapRenderError(error);
  }

  const decoded = await preloadPreviewImage(rendered.dataUrl, {
    timeoutMs: 20_000,
    fetchPriority: 'high',
  }).catch((error) => {
    throw new PreviewLifecycleError(
      'CANVAS_EXPORT_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  });

  if (isVisuallyBlankPreviewResult(decoded)) {
    throw new PreviewLifecycleError(
      'PREVIEW_RENDERED_BLANK',
      'The rendered exact composition did not contain visible artwork.',
      { signature, visualInkFraction: decoded.visualInkFraction },
    );
  }

  let uploaded: { secureUrl: string; fileKey: string };
  try {
    uploaded = await uploadCanvasImageToCloudinary(
      rendered.dataUrl,
      `placement-preview-${signature}.jpg`,
    );
  } catch (error) {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_FAILED',
      error instanceof Error ? error.message : String(error),
      { signature },
    );
  }

  if (!uploaded.secureUrl || !uploaded.fileKey) {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_FAILED',
      'The preview upload completed without a permanent URL and public ID.',
      { signature },
    );
  }

  const permanent = await preloadPreviewImage(uploaded.secureUrl, {
    timeoutMs: 25_000,
    fetchPriority: 'high',
    crossOrigin: 'anonymous',
  }).catch((error) => {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_UNREADABLE',
      error instanceof Error ? error.message : String(error),
      { signature, url: uploaded.secureUrl },
    );
  });

  if (!permanent.naturalWidth || !permanent.naturalHeight) {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_UNREADABLE',
      'The permanent preview loaded without valid dimensions.',
      { signature, url: uploaded.secureUrl },
    );
  }

  return {
    version: 2,
    uploadStatus: 'uploaded',
    url: uploaded.secureUrl,
    publicId: uploaded.fileKey,
    signature,
    sourceIdentity: spec.sourceIdentity,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    widthPx: rendered.widthPx,
    heightPx: rendered.heightPx,
    fitMode: spec.fitMode,
    positionPct: {
      x: spec.transform.xPct,
      y: spec.transform.yPct,
    },
    scaleX: spec.transform.scaleX,
    scaleY: spec.transform.scaleY,
    uploadedAt: new Date().toISOString(),
    error: null,
  };
}

/**
 * Exactly one render/upload may run for a composition signature. This prevents
 * double taps, duplicate React handlers, and compact/expanded views from racing
 * separate canvas exports for the same cart item.
 */
export function createPermanentPlacementPreview(
  spec: ArtworkCompositionSpec,
): Promise<ReadyPlacementPreviewManifest> {
  const signature = buildCompositionSignature(spec);
  const existing = inFlightBySignature.get(signature);
  if (existing) return existing;

  const promise = createArtifact(spec).finally(() => {
    if (inFlightBySignature.get(signature) === promise) {
      inFlightBySignature.delete(signature);
    }
  });
  inFlightBySignature.set(signature, promise);
  return promise;
}

export function clearPlacementPreviewCoordinatorForTests() {
  inFlightBySignature.clear();
}
