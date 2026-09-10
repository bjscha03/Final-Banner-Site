export type ArtworkUploadStatus = 'pending' | 'uploaded' | 'failed';

export type ArtworkFitMode = 'fill' | 'fit' | 'stretch';

/** Immutable metadata for the customer-supplied production source. */
export interface ArtworkManifest {
  originalUrl: string;
  publicId: string;
  assetId?: string | null;
  version?: number | null;
  resourceType: string;
  format: string;
  mimeType: string;
  originalFilename: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  uploadStatus: ArtworkUploadStatus;
  uploadedAt: string;
}

export interface PlacementPreviewManifest {
  /** Schema version for the immutable, baked placement artifact. */
  version?: number | null;
  /** Stable identity of the original production artwork (normally its public ID). */
  sourceIdentity?: string | null;
  /** Permanent browser-readable source used to render the artifact. */
  sourceUrl?: string | null;
  productType?: string | null;
  widthIn?: number | null;
  heightIn?: number | null;
  fitMode?: ArtworkFitMode | null;
  positionPct?: { x: number; y: number } | null;
  scaleX?: number | null;
  scaleY?: number | null;
  compositionRevision?: number | null;
  compositionSignature?: string | null;
  /** Compatibility aliases retained for existing order and email readers. */
  url?: string | null;
  publicId?: string | null;
  previewUrl?: string | null;
  previewPublicId?: string | null;
  previewWidthPx?: number | null;
  previewHeightPx?: number | null;
  uploadStatus: ArtworkUploadStatus;
  uploadedAt?: string | null;
  createdAt?: string | null;
  error?: string | null;
}
