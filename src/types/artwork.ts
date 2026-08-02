export type ArtworkUploadStatus = 'pending' | 'uploaded' | 'failed';

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

/**
 * Immutable browser proof of the exact customer-approved composition.
 * Version 2 manifests contain enough identity and geometry to prove that a
 * cart/checkout thumbnail belongs to this source file, size, crop, and scale.
 */
export interface PlacementPreviewManifest {
  url?: string | null;
  publicId?: string | null;
  uploadStatus: ArtworkUploadStatus;
  uploadedAt?: string | null;
  error?: string | null;
  version?: number | null;
  signature?: string | null;
  sourceIdentity?: string | null;
  widthIn?: number | null;
  heightIn?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  fitMode?: 'fill' | 'fit' | 'stretch' | null;
  positionPct?: { x: number; y: number } | null;
  scaleX?: number | null;
  scaleY?: number | null;
}
