'use strict';

const {
  normalizeCartItemPlacement,
  normalizeReadyPlacementPreview,
} = require('../preview-artifact.cjs');

const CLOUDINARY_CLOUD_NAME = 'dtrxl120u';

function normalize(value) {
  return String(value || '').trim();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(normalize(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isCloudinaryUploadUrl(value) {
  try {
    const parsed = new URL(normalize(value));
    return (parsed.hostname === 'res.cloudinary.com' || parsed.hostname.endsWith('.res.cloudinary.com'))
      && parsed.pathname.includes('/image/upload/');
  } catch {
    return false;
  }
}

function isRawPdfUrl(value) {
  const url = normalize(value).toLowerCase();
  return Boolean(url) && (
    url.includes('/raw/upload/')
    || url.startsWith('application/pdf')
  );
}

function isPdfUrl(value) {
  return /\.pdf(?:$|[?#])/i.test(normalize(value));
}

function getExtension(value) {
  const match = normalize(value).split(/[?#]/)[0].match(/\.([a-z0-9]{2,8})$/i);
  return match?.[1]?.toLowerCase() || '';
}

function encodePublicId(value) {
  return normalize(value)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildCloudinaryUrlFromFileKey(fileKey, item = {}) {
  const key = normalize(fileKey);
  if (!key || /^https?:\/\//i.test(key) || key.startsWith('data:') || key.startsWith('blob:')) {
    return /^https?:\/\//i.test(key) ? key : null;
  }

  const resourceType = String(item.artwork_manifest?.resourceType || 'image').toLowerCase();
  if (resourceType === 'raw') return null;

  const encoded = encodePublicId(key);
  if (!encoded) return null;
  const existingExtension = getExtension(key);
  const format = normalize(
    item.artwork_manifest?.format
      || getExtension(item.file_name)
      || (item.is_pdf ? 'pdf' : ''),
  ).replace(/^\./, '').toLowerCase();
  const extension = existingExtension || !format ? '' : `.${format}`;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${encoded}${extension}`;
}

function buildPdfPreviewUrl(value) {
  const url = normalize(value);
  if (!url || !isPdfUrl(url) || !isCloudinaryUploadUrl(url)) return null;
  const transformed = url.includes('/image/upload/pg_1,')
    ? url
    : url.replace(
        '/image/upload/',
        '/image/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/',
      );
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
}

function parseObject(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const url = normalize(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function getPermanentEmailPreviewCandidates(item = {}) {
  try {
    item = normalizeCartItemPlacement(item);
  } catch (error) {
    console.error('[email-preview-source] canonical placement does not match its order item', {
      code: error.code || 'INVALID_PLACEMENT_PREVIEW',
      message: error.message,
    });
    return [];
  }
  const placement = item.placement_preview;
  if (placement) {
    try {
      const readyPlacement = normalizeReadyPlacementPreview(placement, 'placement_preview');
      const exactPlacementUrl = readyPlacement.previewUrl;
    // Canonical artifacts fail closed: substituting the original would change
    // the crop in customer and Admin emails while pretending it was approved.
      return [exactPlacementUrl];
    } catch (error) {
      console.error('[email-preview-source] invalid canonical placement artifact', {
        code: error.code || 'INVALID_PLACEMENT_PREVIEW',
        message: error.message,
      });
      return [];
    }
  }

  const yardSignDesigns = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const yardSignSources = [];
  const yardSignDesign = yardSignDesigns[0];
  if (yardSignDesign) {
    const reconstructedYardSign = buildCloudinaryUrlFromFileKey(yardSignDesign.fileKey, {
      file_name: yardSignDesign.fileName || yardSignDesign.fileUrl,
      is_pdf: yardSignDesign.isPdf,
    });
    if (yardSignDesign.placementPreview) {
      try {
        const readyYardPlacement = normalizeReadyPlacementPreview(
          yardSignDesign.placementPreview,
          'yard_sign_designs[0].placementPreview',
        );
        yardSignSources.push(readyYardPlacement.previewUrl);
      } catch (error) {
        console.error('[email-preview-source] invalid Yard Sign placement artifact', {
          code: error.code || 'INVALID_PLACEMENT_PREVIEW',
          message: error.message,
        });
        return [];
      }
    }
    yardSignSources.push(
      yardSignDesign.placementPreview ? null : yardSignDesign.previewThumbnailUrl,
      yardSignDesign.thumbnailUrl,
      buildPdfPreviewUrl(yardSignDesign.fileUrl),
      buildPdfPreviewUrl(reconstructedYardSign),
      yardSignDesign.fileUrl,
      reconstructedYardSign,
    );
  }

  const manifest = item.artwork_manifest || {};
  const reconstructed = buildCloudinaryUrlFromFileKey(item.file_key || manifest.publicId, item);
  const designRequest = parseObject(item.design_request_text) || {};
  const canvasState = parseObject(item.canvas_state_json) || {};
  const canvasSources = [
    canvasState.previewUrl,
    canvasState.webPreviewUrl,
    canvasState.finalRenderUrl,
  ];
  if (Array.isArray(canvasState.objects)) {
    for (const object of canvasState.objects) {
      if (!object || object.type !== 'image') continue;
      canvasSources.push(
        object.source?.previewUrl,
        object.source?.originalUrl,
        object.previewUrl,
        object.url,
        object.src,
      );
    }
  }

  const designAssets = Array.isArray(item.design_uploaded_assets)
    ? item.design_uploaded_assets.flatMap((asset) => [
        asset.url,
        buildCloudinaryUrlFromFileKey(asset.fileKey, { file_name: asset.name }),
      ])
    : [];

  const candidates = unique([
    ...yardSignSources,
    item.final_render_url,
    item.web_preview_url,
    item.thumbnail_url,
    item.aiDesign?.assets?.proofUrl,
    item.aiDesign?.assets?.finalUrl,
    designRequest.approvedProofUrl,
    designRequest.proofUrl,
    designRequest.thumbnailUrl,
    designRequest.previewUrl,
    ...canvasSources,
    buildPdfPreviewUrl(manifest.originalUrl),
    buildPdfPreviewUrl(item.file_url),
    buildPdfPreviewUrl(reconstructed),
    manifest.originalUrl,
    item.file_url,
    item.print_ready_url,
    reconstructed,
    ...designAssets,
  ]);

  return candidates.filter((url) => (
    isHttpUrl(url)
    && !isRawPdfUrl(url)
    && !isPdfUrl(url)
  ));
}

function getPermanentEmailPreviewSource(item) {
  return getPermanentEmailPreviewCandidates(item)[0] || null;
}

module.exports = {
  buildCloudinaryUrlFromFileKey,
  buildPdfPreviewUrl,
  getPermanentEmailPreviewCandidates,
  getPermanentEmailPreviewSource,
  isCloudinaryUploadUrl,
  isHttpUrl,
};
