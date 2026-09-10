import { describe, expect, it } from 'vitest';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  isReadyPlacementPreview,
  normalizedTransformFromPixels,
  placementPreviewMatches,
  type ArtworkCompositionSpec,
  type ReadyPlacementPreviewManifest,
} from '../previewLifecycle';

const baseSpec = (overrides: Partial<ArtworkCompositionSpec> = {}): ArtworkCompositionSpec => ({
  version: PREVIEW_ARTIFACT_VERSION,
  sourceIdentity: 'uploads/customer-artwork@42@1',
  sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v42/customer-artwork.png',
  productType: 'banner',
  widthIn: 48,
  heightIn: 24,
  fitMode: 'fit',
  transform: { xPct: 12.5, yPct: -4.25, scaleX: 1.6, scaleY: 1.35 },
  revision: 7,
  ...overrides,
});

const readyArtifact = (spec: ArtworkCompositionSpec): ReadyPlacementPreviewManifest => ({
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
  compositionSignature: buildCompositionSignature(spec),
  url: 'https://res.cloudinary.com/demo/image/upload/exact-placement.jpg',
  publicId: 'exact-placement',
  previewUrl: 'https://res.cloudinary.com/demo/image/upload/exact-placement.jpg',
  previewPublicId: 'exact-placement',
  previewWidthPx: 1400,
  previewHeightPx: 700,
  uploadStatus: 'uploaded',
  uploadedAt: '2026-08-02T00:00:00.000Z',
  createdAt: '2026-08-02T00:00:00.000Z',
  error: null,
});

describe('canonical preview lifecycle', () => {
  it('normalizes editor pixels against the actual rendered canvas', () => {
    expect(normalizedTransformFromPixels(
      { x: 40, y: -30, scaleX: 1.5, scaleY: 1.25 },
      { width: 400, height: 300 },
    )).toEqual({ xPct: 10, yPct: -10, scaleX: 1.5, scaleY: 1.25 });
  });

  it('produces a stable signature for an identical canonical composition', () => {
    expect(buildCompositionSignature(baseSpec())).toBe('placement-v3-0fmi0551wi3ftg');
    expect(buildCompositionSignature(baseSpec())).toBe(buildCompositionSignature(baseSpec()));
  });

  it.each([
    ['source', { sourceIdentity: 'other-source@42@1' }],
    ['width', { widthIn: 72 }],
    ['height', { heightIn: 36 }],
    ['fit mode', { fitMode: 'fill' as const }],
    ['x position', { transform: { ...baseSpec().transform, xPct: 13 } }],
    ['y position', { transform: { ...baseSpec().transform, yPct: -5 } }],
    ['x scale', { transform: { ...baseSpec().transform, scaleX: 1.7 } }],
    ['y scale', { transform: { ...baseSpec().transform, scaleY: 1.45 } }],
    ['revision', { revision: 8 }],
  ])('invalidates the signature when %s changes', (_label, override) => {
    expect(buildCompositionSignature(baseSpec(override))).not.toBe(buildCompositionSignature(baseSpec()));
  });

  it('accepts only complete uploaded permanent artifacts', () => {
    const spec = baseSpec();
    const artifact = readyArtifact(spec);
    expect(isReadyPlacementPreview(artifact)).toBe(true);
    expect(placementPreviewMatches(artifact, spec)).toBe(true);
    expect(isReadyPlacementPreview({ ...artifact, previewUrl: 'blob:temporary' })).toBe(false);
    expect(isReadyPlacementPreview({ ...artifact, previewWidthPx: 0 })).toBe(false);
    expect(isReadyPlacementPreview({ ...artifact, widthIn: 72 })).toBe(false);
    expect(placementPreviewMatches({ ...artifact, compositionRevision: 6 }, spec)).toBe(false);
  });
});
