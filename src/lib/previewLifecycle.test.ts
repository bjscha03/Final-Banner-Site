import { describe, expect, it } from 'vitest';
import {
  PREVIEW_ARTIFACT_VERSION,
  PreviewLifecycleError,
  buildCompositionSignature,
  normalizedTransformFromPixels,
  placementPreviewMatches,
  type ArtworkCompositionSpec,
} from './previewLifecycle';

const spec = (overrides: Partial<ArtworkCompositionSpec> = {}): ArtworkCompositionSpec => ({
  version: PREVIEW_ARTIFACT_VERSION,
  sourceUrl: 'https://res.cloudinary.com/demo/image/upload/artwork.png',
  sourceIdentity: 'uploads/artwork',
  widthIn: 120,
  heightIn: 48,
  fitMode: 'fill',
  transform: {
    xPct: 12.5,
    yPct: -4.25,
    scaleX: 1.40625,
    scaleY: 1.40625,
  },
  revision: 1,
  ...overrides,
});

describe('preview lifecycle', () => {
  it('normalizes editor pixels without consulting a later DOM ref', () => {
    expect(normalizedTransformFromPixels(
      { x: 50, y: -20, scaleX: 1.4, scaleY: 1.25 },
      { width: 400, height: 200 },
    )).toEqual({
      xPct: 12.5,
      yPct: -10,
      scaleX: 1.4,
      scaleY: 1.25,
    });
  });

  it('rejects zero or missing canvas geometry instead of dividing by one', () => {
    expect(() => normalizedTransformFromPixels(
      { x: 50, y: 20, scaleX: 1, scaleY: 1 },
      { width: 0, height: 0 },
    )).toThrowError(PreviewLifecycleError);
  });

  it('produces the same signature for the same source size crop and scale', () => {
    expect(buildCompositionSignature(spec())).toBe(buildCompositionSignature(spec({ revision: 99 })));
  });

  it('changes signature for source dimensions position and scale changes', () => {
    const baseline = buildCompositionSignature(spec());
    expect(buildCompositionSignature(spec({ sourceIdentity: 'uploads/other' }))).not.toBe(baseline);
    expect(buildCompositionSignature(spec({ widthIn: 48, heightIn: 24 }))).not.toBe(baseline);
    expect(buildCompositionSignature(spec({ transform: { ...spec().transform, xPct: 12.6 } }))).not.toBe(baseline);
    expect(buildCompositionSignature(spec({ transform: { ...spec().transform, scaleX: 1.5 } }))).not.toBe(baseline);
  });

  it('matches only an uploaded permanent preview for the exact composition', () => {
    const current = spec();
    const signature = buildCompositionSignature(current);
    const preview = {
      version: PREVIEW_ARTIFACT_VERSION,
      uploadStatus: 'uploaded' as const,
      url: 'https://res.cloudinary.com/demo/image/upload/placement.jpg',
      publicId: 'placement/abc',
      signature,
      sourceIdentity: current.sourceIdentity,
      widthIn: current.widthIn,
      heightIn: current.heightIn,
      widthPx: 1400,
      heightPx: 560,
      fitMode: current.fitMode,
      positionPct: { x: current.transform.xPct, y: current.transform.yPct },
      scaleX: current.transform.scaleX,
      scaleY: current.transform.scaleY,
      uploadedAt: new Date().toISOString(),
    };

    expect(placementPreviewMatches(preview, current)).toBe(true);
    expect(placementPreviewMatches({ ...preview, signature: 'stale' }, current)).toBe(false);
    expect(placementPreviewMatches({ ...preview, uploadStatus: 'pending' }, current)).toBe(false);
  });
});
