export type OriginalArtworkSelection = { url: string; source: 'manifest_url' | 'manifest_public_id' | 'legacy_file_url' | 'legacy_file_key' };

/** Resolves only immutable customer artwork. Derivatives are never candidates. */
export function getOriginalArtworkSelection(item: any): OriginalArtworkSelection | null {
  if (item?.artwork_manifest?.originalUrl) return { url: item.artwork_manifest.originalUrl, source: 'manifest_url' };
  if (item?.artwork_manifest?.publicId) return { url: item.artwork_manifest.publicId, source: 'manifest_public_id' };
  if (item?.file_url) return { url: item.file_url, source: 'legacy_file_url' };
  if (item?.file_key) return { url: item.file_key, source: 'legacy_file_key' };
  return null;
}

/** AI fit uploads its accepted result as the order's immutable production source.
 * Recognize the saved filename (including existing orders); never use a preview.
 */
export function getAIResizedArtworkSelection(item: any): OriginalArtworkSelection | null {
  const filename = item?.artwork_manifest?.originalFilename || item?.original_filename || item?.file_name;
  if (typeof filename !== 'string' || !/^ai-fit-\d+(?:\.\d+)?x\d+(?:\.\d+)?-.+\.(?:jpe?g|png)$/i.test(filename)) return null;
  return getOriginalArtworkSelection(item);
}
