'use strict';

const PREVIEW_ARTIFACT_VERSION = 3;

class PreviewArtifactValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PreviewArtifactValidationError';
    this.code = 'INVALID_PLACEMENT_PREVIEW';
    this.details = details;
  }
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function canonicalPreviewNumber(value) {
  return Number(Number(value).toFixed(6));
}

function hashCanonicalPayload(payload) {
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

function buildCompositionSignatureFromPreview(preview) {
  const payload = [
    `v${preview.version}`,
    preview.sourceIdentity,
    preview.productType,
    canonicalPreviewNumber(preview.widthIn),
    canonicalPreviewNumber(preview.heightIn),
    preview.fitMode,
    canonicalPreviewNumber(preview.positionPct.x),
    canonicalPreviewNumber(preview.positionPct.y),
    canonicalPreviewNumber(preview.scaleX),
    canonicalPreviewNumber(preview.scaleY),
    Math.trunc(preview.compositionRevision),
  ].join('|');
  return `placement-v${preview.version}-${hashCanonicalPayload(payload)}`;
}

function isPermanentUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim()) && value.length <= 10000;
}

function assertReadyPlacementPreview(preview, label = 'placement_preview') {
  const url = preview && (preview.previewUrl || preview.url);
  const publicId = preview && (preview.previewPublicId || preview.publicId);
  const position = preview && preview.positionPct;
  const valid = preview
    && typeof preview === 'object'
    && preview.version === PREVIEW_ARTIFACT_VERSION
    && preview.uploadStatus === 'uploaded'
    && isPermanentUrl(url)
    && isPermanentUrl(preview.sourceUrl)
    && typeof publicId === 'string'
    && publicId.trim().length > 0
    && typeof preview.sourceIdentity === 'string'
    && preview.sourceIdentity.trim().length > 0
    && typeof preview.productType === 'string'
    && preview.productType.trim().length > 0
    && finite(preview.widthIn)
    && preview.widthIn > 0
    && finite(preview.heightIn)
    && preview.heightIn > 0
    && ['fit', 'fill', 'stretch'].includes(preview.fitMode)
    && position
    && finite(position.x)
    && finite(position.y)
    && finite(preview.scaleX)
    && preview.scaleX > 0
    && finite(preview.scaleY)
    && preview.scaleY > 0
    && finite(preview.compositionRevision)
    && preview.compositionRevision >= 0
    && finite(preview.previewWidthPx)
    && preview.previewWidthPx > 0
    && finite(preview.previewHeightPx)
    && preview.previewHeightPx > 0
    && typeof preview.compositionSignature === 'string';

  if (!valid) {
    throw new PreviewArtifactValidationError(`${label} is not a complete permanent version ${PREVIEW_ARTIFACT_VERSION} artifact.`, { label });
  }

  const expectedSignature = buildCompositionSignatureFromPreview(preview);
  if (preview.compositionSignature !== expectedSignature) {
    throw new PreviewArtifactValidationError(`${label} does not match its canonical composition signature.`, {
      label,
      expectedSignature,
      receivedSignature: preview.compositionSignature,
    });
  }
  return preview;
}

function normalizeReadyPlacementPreview(preview, label) {
  assertReadyPlacementPreview(preview, label);
  const previewUrl = String(preview.previewUrl || preview.url).trim();
  const previewPublicId = String(preview.previewPublicId || preview.publicId).trim();
  return {
    ...preview,
    url: previewUrl,
    publicId: previewPublicId,
    previewUrl,
    previewPublicId,
  };
}

function normalizeCartItemPlacement(item = {}) {
  const normalized = { ...item };
  if (normalized.placement_preview != null) {
    normalized.placement_preview = normalizeReadyPlacementPreview(
      normalized.placement_preview,
      'placement_preview',
    );
    const itemProductType = String(normalized.product_type || '').trim();
    const itemWidthIn = Number(normalized.width_in);
    const itemHeightIn = Number(normalized.height_in);
    if (itemProductType && normalized.placement_preview.productType !== itemProductType) {
      throw new PreviewArtifactValidationError('placement_preview product type does not match its cart line.', {
        itemProductType,
        previewProductType: normalized.placement_preview.productType,
      });
    }
    if (Number.isFinite(itemWidthIn) && itemWidthIn > 0
      && Math.abs(normalized.placement_preview.widthIn - itemWidthIn) > 0.000001) {
      throw new PreviewArtifactValidationError('placement_preview width does not match its cart line.', {
        itemWidthIn,
        previewWidthIn: normalized.placement_preview.widthIn,
      });
    }
    if (Number.isFinite(itemHeightIn) && itemHeightIn > 0
      && Math.abs(normalized.placement_preview.heightIn - itemHeightIn) > 0.000001) {
      throw new PreviewArtifactValidationError('placement_preview height does not match its cart line.', {
        itemHeightIn,
        previewHeightIn: normalized.placement_preview.heightIn,
      });
    }
    const exactUrl = normalized.placement_preview.previewUrl;
    normalized.thumbnail_url = exactUrl;
    normalized.web_preview_url = exactUrl;
    normalized.composition_signature = normalized.placement_preview.compositionSignature;
    normalized.composition_revision = normalized.placement_preview.compositionRevision;
  }

  if (Array.isArray(normalized.yard_sign_designs)) {
    normalized.yard_sign_designs = normalized.yard_sign_designs.map((design, index) => {
      if (!design || typeof design !== 'object' || design.placementPreview == null) return design;
      const placementPreview = normalizeReadyPlacementPreview(
        design.placementPreview,
        `yard_sign_designs[${index}].placementPreview`,
      );
      const itemProductType = String(normalized.product_type || '').trim();
      const itemWidthIn = Number(normalized.width_in);
      const itemHeightIn = Number(normalized.height_in);
      if (itemProductType && placementPreview.productType !== itemProductType) {
        throw new PreviewArtifactValidationError(
          `yard_sign_designs[${index}].placementPreview product type does not match its cart line.`,
          { itemProductType, previewProductType: placementPreview.productType },
        );
      }
      if (Number.isFinite(itemWidthIn) && itemWidthIn > 0
        && Math.abs(placementPreview.widthIn - itemWidthIn) > 0.000001) {
        throw new PreviewArtifactValidationError(
          `yard_sign_designs[${index}].placementPreview width does not match its cart line.`,
          { itemWidthIn, previewWidthIn: placementPreview.widthIn },
        );
      }
      if (Number.isFinite(itemHeightIn) && itemHeightIn > 0
        && Math.abs(placementPreview.heightIn - itemHeightIn) > 0.000001) {
        throw new PreviewArtifactValidationError(
          `yard_sign_designs[${index}].placementPreview height does not match its cart line.`,
          { itemHeightIn, previewHeightIn: placementPreview.heightIn },
        );
      }
      return {
        ...design,
        placementPreview,
        previewThumbnailUrl: placementPreview.previewUrl,
        compositionSignature: placementPreview.compositionSignature,
      };
    });
  }
  return normalized;
}

module.exports = {
  PREVIEW_ARTIFACT_VERSION,
  PreviewArtifactValidationError,
  buildCompositionSignatureFromPreview,
  assertReadyPlacementPreview,
  normalizeReadyPlacementPreview,
  normalizeCartItemPlacement,
};
