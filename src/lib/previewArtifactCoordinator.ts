import {
  type ArtworkCompositionSpec,
  type ReadyPlacementPreviewManifest,
  PreviewLifecycleError,
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  validateCompositionSpec,
} from '@/lib/previewLifecycle';
import {
  renderPositionedThumbnailBlob,
} from '@/utils/generatePositionedThumbnail';
import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';
import { rememberDecodedPreviewImage } from '@/lib/previewImageCache';

const inFlightBySignature = new Map<string, Promise<ReadyPlacementPreviewManifest>>();
const completedBySignature = new Map<string, ReadyPlacementPreviewManifest>();

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

function loadPermanentImage(url: string, timeoutMs = 25_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    const accept = async () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        finish(() => reject(new PreviewLifecycleError(
          'PREVIEW_UPLOAD_UNREADABLE',
          'The uploaded preview reported zero dimensions.',
          { url },
        )));
        return;
      }
      try {
        await image.decode?.();
      } catch {
        // Safari may reject decode after a valid load. Natural dimensions are
        // the authoritative fallback in that case.
      }
      finish(() => resolve(image));
    };
    const timeoutId = window.setTimeout(() => finish(() => reject(new PreviewLifecycleError(
      'PREVIEW_UPLOAD_UNREADABLE',
      `The uploaded preview did not become readable within ${timeoutMs}ms.`,
      { url },
    ))), timeoutMs);
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => { void accept(); };
    image.onerror = () => finish(() => reject(new PreviewLifecycleError(
      'PREVIEW_UPLOAD_UNREADABLE',
      'The uploaded preview failed to load.',
      { url },
    )));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void accept();
  });
}

async function verifyPermanentArtifact(
  url: string,
  expectedWidthPx: number,
  expectedHeightPx: number,
): Promise<{ naturalWidth: number; naturalHeight: number; visiblePixelFraction: number }> {
  let lastError: unknown;
  for (const delayMs of [0, 350, 1_100]) {
    if (delayMs) await wait(delayMs);
    try {
      const image = await loadPermanentImage(url);
      const expectedAspect = expectedWidthPx / expectedHeightPx;
      const actualAspect = image.naturalWidth / image.naturalHeight;
      const aspectRatioError = Math.abs((actualAspect / expectedAspect) - 1);
      if (!Number.isFinite(aspectRatioError) || aspectRatioError > 0.02) {
        throw new PreviewLifecycleError(
          'PREVIEW_UPLOAD_UNREADABLE',
          'The permanent preview decoded with dimensions that do not match the rendered composition.',
          {
            url,
            expectedWidthPx,
            expectedHeightPx,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            aspectRatioError,
          },
        );
      }
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        visiblePixelFraction: -1,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof PreviewLifecycleError) throw lastError;
  throw new PreviewLifecycleError(
    'PREVIEW_UPLOAD_UNREADABLE',
    lastError instanceof Error ? lastError.message : String(lastError),
    { url },
  );
}

async function createArtifact(spec: ArtworkCompositionSpec): Promise<ReadyPlacementPreviewManifest> {
  validateCompositionSpec(spec);
  const compositionSignature = buildCompositionSignature(spec);
  const rendered = await renderPositionedThumbnailBlob({
    imageUrl: spec.sourceUrl,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    imgPosPercent: { x: spec.transform.xPct, y: spec.transform.yPct },
    imgScale: spec.transform.scaleX,
    imgScaleY: spec.transform.scaleY,
    backgroundColor: '#ffffff',
    maxOutputPx: 1400,
    maxOutputPixels: 1_500_000,
  });

  let uploaded: Awaited<ReturnType<typeof uploadCanvasImageToCloudinary>>;
  try {
    uploaded = await uploadCanvasImageToCloudinary(
      rendered.blob,
      `${compositionSignature}.jpg`,
    );
  } catch (error) {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_FAILED',
      error instanceof Error ? error.message : String(error),
      { compositionSignature },
    );
  }
  if (!/^https?:\/\//i.test(uploaded.secureUrl || '') || !uploaded.fileKey) {
    throw new PreviewLifecycleError(
      'PREVIEW_UPLOAD_FAILED',
      'The upload completed without a permanent URL and public ID.',
      { compositionSignature },
    );
  }

  const verification = await verifyPermanentArtifact(
    uploaded.secureUrl,
    rendered.widthPx,
    rendered.heightPx,
  );
  rememberDecodedPreviewImage({
    url: uploaded.secureUrl,
    naturalWidth: verification.naturalWidth,
    naturalHeight: verification.naturalHeight,
  });
  const createdAt = new Date().toISOString();
  console.info('[placement_preview_ready]', {
    compositionSignature,
    sourceIdentity: spec.sourceIdentity,
    productType: spec.productType,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    previewWidthPx: rendered.widthPx,
    previewHeightPx: rendered.heightPx,
    renderedVisiblePixelFraction: rendered.visiblePixelFraction,
    uploadedVisiblePixelFraction: verification.visiblePixelFraction,
  });

  return {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: spec.sourceIdentity,
    sourceUrl: spec.sourceUrl,
    productType: spec.productType,
    widthIn: spec.widthIn,
    heightIn: spec.heightIn,
    fitMode: spec.fitMode,
    positionPct: { x: spec.transform.xPct, y: spec.transform.yPct },
    scaleX: spec.transform.scaleX,
    scaleY: spec.transform.scaleY,
    compositionRevision: spec.revision,
    compositionSignature,
    url: uploaded.secureUrl,
    publicId: uploaded.fileKey,
    previewUrl: uploaded.secureUrl,
    previewPublicId: uploaded.fileKey,
    previewWidthPx: rendered.widthPx,
    previewHeightPx: rendered.heightPx,
    uploadStatus: 'uploaded',
    uploadedAt: createdAt,
    createdAt,
    error: null,
  };
}

/**
 * Double taps for the same immutable composition join one promise. Completed
 * artifacts are reused in-session; a different revision always has a different
 * signature and cannot share or overwrite this result.
 */
export function createPermanentPlacementPreview(
  spec: ArtworkCompositionSpec,
): Promise<ReadyPlacementPreviewManifest> {
  const signature = buildCompositionSignature(spec);
  const completed = completedBySignature.get(signature);
  if (completed) return Promise.resolve(completed);
  const existing = inFlightBySignature.get(signature);
  if (existing) return existing;

  const promise = createArtifact(spec).then((artifact) => {
    completedBySignature.set(signature, artifact);
    return artifact;
  }).finally(() => {
    if (inFlightBySignature.get(signature) === promise) inFlightBySignature.delete(signature);
  });
  inFlightBySignature.set(signature, promise);
  return promise;
}

export function clearPlacementPreviewCoordinatorForTests() {
  inFlightBySignature.clear();
  completedBySignature.clear();
}
