import type { PreviewableItem } from './previewSelection';

/**
 * True when the resolver's first-choice source is already a baked snapshot of
 * the customer's product placement. Commerce renderers must not apply the
 * original image position/scale a second time to these sources.
 */
export function hasExactCompositionPreview(item: PreviewableItem): boolean {
  const yardSignDesigns = Array.isArray(item.yard_sign_designs)
    ? item.yard_sign_designs
    : [];
  const hasYardSignSnapshot = yardSignDesigns.some((design) => Boolean(
    String(design.previewThumbnailUrl || design.thumbnailUrl || '').trim(),
  ));

  let hasDesignRequestSnapshot = false;
  if (item.design_request_text) {
    try {
      const parsed = JSON.parse(item.design_request_text);
      hasDesignRequestSnapshot = Boolean(
        parsed?.approvedProofUrl
        || parsed?.proofUrl
        || parsed?.thumbnailUrl
        || parsed?.previewUrl,
      );
    } catch {
      hasDesignRequestSnapshot = false;
    }
  }

  return Boolean(
    hasYardSignSnapshot
    || item.placement_preview?.url
    || item.final_render_url
    || item.web_preview_url
    || item.thumbnail_url
    || item.aiDesign?.assets?.proofUrl
    || item.aiDesign?.assets?.finalUrl
    || hasDesignRequestSnapshot,
  );
}
