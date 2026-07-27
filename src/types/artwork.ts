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

export interface PlacementPreviewManifest {
  url?: string | null;
  publicId?: string | null;
  uploadStatus: ArtworkUploadStatus;
  uploadedAt?: string | null;
  error?: string | null;
}
