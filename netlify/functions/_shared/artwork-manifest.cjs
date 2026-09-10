'use strict';

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null;
}

function normalizeArtworkManifest(item = {}) {
  const input = item.artwork_manifest && typeof item.artwork_manifest === 'object'
    ? item.artwork_manifest
    : {};
  const originalUrl = first(input.originalUrl, item.original_artwork_url, item.file_url);
  const publicId = first(input.publicId, item.original_artwork_public_id, item.file_key);
  if (!originalUrl && !publicId) return null;
  return {
    originalUrl,
    publicId,
    assetId: first(input.assetId, item.original_artwork_asset_id),
    version: first(input.version, item.original_artwork_version),
    resourceType: first(input.resourceType, item.original_artwork_resource_type, 'image'),
    format: first(input.format, item.original_artwork_format, item.is_pdf ? 'pdf' : null),
    mimeType: first(input.mimeType, item.original_artwork_mime_type, item.is_pdf ? 'application/pdf' : null),
    originalFilename: first(input.originalFilename, item.original_filename, item.file_name),
    bytes: Number(first(input.bytes, item.original_artwork_bytes, 0)) || 0,
    width: first(input.width, item.original_artwork_width),
    height: first(input.height, item.original_artwork_height),
    sha256: first(input.sha256, item.original_artwork_sha256),
    uploadStatus: first(input.uploadStatus, item.original_artwork_upload_status, originalUrl || publicId ? 'uploaded' : 'failed'),
    uploadedAt: first(input.uploadedAt, item.original_artwork_uploaded_at),
  };
}

module.exports = { normalizeArtworkManifest };
