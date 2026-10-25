type SavedArtwork = {
  fileKey?: string;
  productionPublicId?: string;
  url?: string;
  fileUrl?: string;
  productionUrl?: string;
};

// A local preview is not proof that the order has durable artwork. Upload
// handlers also resolve on validation, cancellation and network failure.
export function requireSavedAIArtwork(artwork: SavedArtwork | null | undefined): void {
  const url = artwork?.productionUrl || artwork?.fileUrl || artwork?.url || '';
  if (!artwork || !(artwork.productionPublicId || artwork.fileKey) || !/^https?:\/\//i.test(url)) {
    throw new Error('Your design is still here, but we could not save it to your order. Please try Approve design & continue again.');
  }
}
