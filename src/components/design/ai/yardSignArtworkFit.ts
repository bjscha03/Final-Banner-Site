import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import type { YardSignDesign } from '@/lib/yard-sign-pricing';

/** Use the original upload/page image, never a thumbnail with placement baked in. */
export function yardSignFitArtwork(design: YardSignDesign): UploadedArtworkFile {
  return {
    editorIdentity: `${design.id}|${design.fileKey}|${design.fileUrl}`,
    name: design.fileName, url: design.fileUrl, fileKey: design.fileKey,
    size: 0, isPdf: design.isPdf,
    previewUrl: design.thumbnailUrl, permanentPreviewUrl: design.thumbnailUrl,
    mimeType: design.isPdf ? 'application/pdf' : undefined,
  };
}

/** Keep the row and its quantity; invalidate every preview of the old source. */
export function applyYardSignFit(design: YardSignDesign, artwork: UploadedArtworkFile): YardSignDesign {
  return {
    ...design, fileName: artwork.name, fileUrl: artwork.productionUrl || artwork.url,
    fileKey: artwork.fileKey, isPdf: artwork.isPdf,
    thumbnailUrl: artwork.permanentPreviewUrl || artwork.previewUrl || artwork.url,
    imgPos: { x: 0, y: 0 }, imgScale: 1, imgScaleY: 1, imgConstrain: true,
    previewThumbnailUrl: undefined, placementPreview: undefined,
  };
}
