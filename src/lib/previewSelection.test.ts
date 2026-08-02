import { describe, expect, it } from 'vitest';
import {
  buildCloudinaryPdfPreviewUrl,
  buildCloudinaryUrlFromFileKey,
  getExpandedPreviewSelection,
  getPreviewSourceCandidates,
  getSmallPreviewUrl,
} from './previewSelection';
import {
  PREVIEW_ARTIFACT_VERSION,
  buildCompositionSignature,
  type ArtworkCompositionSpec,
} from './previewLifecycle';

function readyPlacement(url: string) {
  const spec: ArtworkCompositionSpec = {
    version: PREVIEW_ARTIFACT_VERSION,
    sourceIdentity: 'uploads/source@9@1',
    sourceUrl: 'https://cdn.example.com/original.png',
    productType: 'banner',
    widthIn: 72,
    heightIn: 24,
    fitMode: 'fit',
    transform: { xPct: 8, yPct: -2, scaleX: 1.7, scaleY: 1.7 },
    revision: 4,
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
    publicId: 'approved-thumbnail',
    previewUrl: url,
    previewPublicId: 'approved-thumbnail',
    previewWidthPx: 1400,
    previewHeightPx: 467,
    uploadStatus: 'uploaded' as const,
  };
}

describe('previewSelection', () => {
  it('keeps one exact placement identity and excludes competing fallbacks', () => {
    const placement = readyPlacement('https://cdn.example.com/approved-thumbnail.jpg');
    const item = {
      placement_preview: placement,
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
      file_url: 'https://cdn.example.com/original.png',
    };
    expect(getSmallPreviewUrl(item)).toBe(placement.previewUrl);
    expect(getExpandedPreviewSelection(item)).toMatchObject({
      url: placement.previewUrl,
      source: 'placement_preview',
      isExactComposition: true,
    });
    expect(getPreviewSourceCandidates(item)).toEqual([placement.previewUrl]);
  });

  it('does not let a temporary legacy data URL hide a permanent web preview', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'data:image/jpeg;base64,temporary',
      web_preview_url: 'https://cdn.example.com/web-preview.jpg',
    })).toBe('https://cdn.example.com/web-preview.jpg');
  });

  it('keeps blob URLs behind legacy permanent sources', () => {
    expect(getSmallPreviewUrl({
      thumbnail_url: 'blob:https://bannersonthefly.com/temporary',
      file_key: 'uploads/customer-artwork_ab12cd',
      file_name: 'customer-artwork.jpg',
    })).toBe('https://res.cloudinary.com/dtrxl120u/image/upload/uploads/customer-artwork_ab12cd.jpg');
  });

  it('reconstructs Cloudinary image and PDF preview URLs', () => {
    expect(buildCloudinaryUrlFromFileKey('uploads/design_abc123', { format: 'png' }))
      .toBe('https://res.cloudinary.com/dtrxl120u/image/upload/uploads/design_abc123.png');
    expect(buildCloudinaryPdfPreviewUrl(
      'https://res.cloudinary.com/demo/image/upload/v123/uploads/design.pdf',
    )).toBe(
      'https://res.cloudinary.com/demo/image/upload/pg_1,f_jpg,q_auto:good,w_1800,c_limit/v123/uploads/design.jpg',
    );
  });

  it('returns no source for an invalid claimed canonical artifact', () => {
    expect(getSmallPreviewUrl({
      placement_preview: {
        uploadStatus: 'uploaded',
        url: 'https://cdn.example.com/incomplete.jpg',
      },
      file_url: 'https://cdn.example.com/original.jpg',
    })).toBeNull();
  });

  it('recovers a legacy artwork manifest when canonical fields are absent', () => {
    expect(getSmallPreviewUrl({
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/demo/image/upload/v1/uploads/artwork.png',
        publicId: 'uploads/artwork',
        format: 'png',
        resourceType: 'image',
      },
    })).toBe('https://res.cloudinary.com/demo/image/upload/v1/uploads/artwork.png');
  });

  it('does not return a raw Cloudinary PDF to an img element', () => {
    expect(getSmallPreviewUrl({
      artwork_manifest: {
        originalUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/uploads/artwork.pdf',
        resourceType: 'raw',
      },
    })).toBeNull();
  });
});
