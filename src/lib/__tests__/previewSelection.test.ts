import { beforeEach, describe, expect, it } from 'vitest';
import {
  getExpandedPreviewSelection,
  getPreviewSourceCandidates,
  getSmallPreviewUrl,
} from '../previewSelection';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  type ArtworkCompositionSpec,
} from '../previewLifecycle';
import {
  clearPreviewSourceRegistry,
  getRegisteredPreviewSourceCandidates,
  isRegisteredExactComposition,
  isRegisteredImmutableExactArtifact,
} from '../previewSourceRegistry';

function readyPlacement(
  url = 'https://cdn.example.com/placement.png',
  identity: { productType?: string; widthIn?: number; heightIn?: number } = {},
) {
  const spec: ArtworkCompositionSpec = {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: 'source-one@1@1',
    sourceUrl: 'https://cdn.example.com/original.png',
    productType: identity.productType || 'banner',
    widthIn: identity.widthIn || 48,
    heightIn: identity.heightIn || 24,
    fitMode: 'fit',
    transform: { xPct: 12, yPct: -4, scaleX: 1.5, scaleY: 1.25 },
    revision: 3,
  };
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
    compositionSignature: buildCompositionSignature(spec),
    url,
    publicId: 'placement-public-id',
    previewUrl: url,
    previewPublicId: 'placement-public-id',
    previewWidthPx: 1400,
    previewHeightPx: 700,
    uploadStatus: 'uploaded' as const,
    createdAt: '2026-08-02T00:00:00.000Z',
    uploadedAt: '2026-08-02T00:00:00.000Z',
    error: null,
  };
}

describe('previewSelection identity contract', () => {
  beforeEach(() => clearPreviewSourceRegistry());

  it('uses only the same immutable exact artifact for compact and expanded views', () => {
    const item = {
      placement_preview: readyPlacement(),
      final_render_url: 'https://cdn.example.com/final.png',
      web_preview_url: 'https://cdn.example.com/web.png',
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      file_url: 'https://cdn.example.com/original.png',
    };

    expect(getSmallPreviewUrl(item)).toBe('https://cdn.example.com/placement.png');
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: 'https://cdn.example.com/placement.png',
      source: 'placement_preview',
      isExactComposition: true,
    });
    expect(getPreviewSourceCandidates(item)).toEqual(['https://cdn.example.com/placement.png']);
    expect(isRegisteredImmutableExactArtifact('https://cdn.example.com/placement.png')).toBe(true);
  });

  it('keeps a legacy same-item fallback chain without marking it as an immutable v3 artifact', () => {
    const primary = 'https://cdn.example.com/legacy-web-preview.png';
    const fallback = 'https://cdn.example.com/legacy-thumbnail.png';
    expect(getSmallPreviewUrl({
      web_preview_url: primary,
      thumbnail_url: fallback,
      file_url: 'https://cdn.example.com/legacy-original.png',
    })).toBe(primary);

    expect(isRegisteredExactComposition(primary)).toBe(true);
    expect(isRegisteredImmutableExactArtifact(primary)).toBe(false);
    expect(getRegisteredPreviewSourceCandidates(primary)).toEqual([
      primary,
      fallback,
      'https://cdn.example.com/legacy-original.png',
    ]);
  });

  it('fails closed when a canonical manifest exists but is incomplete', () => {
    const item = {
      placement_preview: { uploadStatus: 'failed' as const, url: 'https://cdn.example.com/stale.png' },
      thumbnail_url: 'https://cdn.example.com/original-fitted.png',
      file_url: 'https://cdn.example.com/original.png',
    };
    expect(getSmallPreviewUrl(item)).toBeNull();
    expect(getExpandedPreviewSelection(item).source).toBe('none');
  });

  it('never sends a raw PDF URL to an img element when a legacy permanent proof exists', () => {
    expect(getSmallPreviewUrl({
      file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
      web_preview_url: 'https://cdn.example.com/web-preview.png',
    })).toBe('https://cdn.example.com/web-preview.png');
  });

  it('recovers a legacy image item from file_key after navigation or refresh', () => {
    const item = { file_key: 'uploads/customer_image_123', file_name: 'customer-image.jpeg' };
    const expected = 'https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer_image_123.jpeg';
    expect(getSmallPreviewUrl(item)).toBe(expected);
    expect(getExpandedPreviewSelection(item).url).toBe(expected);
  });

  it('uses a verified nested Yard Sign artifact for both views', () => {
    const placement = readyPlacement(
      'https://cdn.example.com/yard-one-positioned.jpg',
      { productType: 'yard_sign', widthIn: 24, heightIn: 18 },
    );
    const item = {
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      yard_sign_designs: [{
        placementPreview: placement,
        previewThumbnailUrl: placement.previewUrl,
        fileUrl: 'https://cdn.example.com/yard-one-original.jpg',
      }],
    };

    expect(getSmallPreviewUrl(item)).toBe(placement.previewUrl);
    expect(getExpandedPreviewSelection(item).url).toBe(placement.previewUrl);
    expect(getPreviewSourceCandidates(item)).toEqual([placement.previewUrl]);
  });

  it('fails closed when a nested Yard Sign artifact belongs to another line identity', () => {
    const wrongSize = readyPlacement(
      'https://cdn.example.com/wrong-yard-positioned.jpg',
      { productType: 'yard_sign', widthIn: 48, heightIn: 24 },
    );
    const item = {
      product_type: 'yard_sign',
      width_in: 24,
      height_in: 18,
      yard_sign_designs: [{
        placementPreview: wrongSize,
        previewThumbnailUrl: 'https://cdn.example.com/stale-yard-thumbnail.jpg',
        fileUrl: 'https://cdn.example.com/yard-original.jpg',
      }],
    };

    expect(getPreviewSourceCandidates(item)).toEqual([]);
    expect(getSmallPreviewUrl(item)).toBeNull();
  });

  it('labels a legacy temporary data URL as an in-session fallback only', () => {
    const selected = getExpandedPreviewSelection({ thumbnail_url: 'data:image/png;base64,small' });
    expect(selected.url).toBe('data:image/png;base64,small');
    expect(selected.isExactComposition).toBe(true);
    expect(selected.isLowResolutionFallback).toBe(true);
  });
});
