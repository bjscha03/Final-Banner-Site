type ArtworkIdentity = {
  editorIdentity?: string | null;
  productionPublicId?: string | null;
  fileKey?: string | null;
  name?: string | null;
};

/**
 * The key must remain stable while a customer changes banner dimensions.
 * Canvas size is geometry, not artwork identity; including it here discards
 * the editor's normalized position and makes mobile artwork jump or distort.
 */
export function buildArtworkCompositionKey(
  artwork: ArtworkIdentity,
  productType: string,
): string {
  const identity = artwork.editorIdentity
    || artwork.productionPublicId
    || artwork.fileKey
    || artwork.name
    || 'artwork';
  return `${identity}|${productType}`;
}
