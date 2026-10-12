/** A restored cart has a permanent original but no browser-local File ref. */
export async function getPdfPreviewFile(
  localFile: File | null,
  artwork: { name: string; productionUrl?: string; url: string },
): Promise<File> {
  if (localFile) return localFile;
  const originalUrl = artwork.productionUrl || artwork.url;
  if (!/^https?:\/\//i.test(originalUrl)) throw new Error('The saved PDF original is unavailable.');
  const response = await fetch(originalUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`The saved PDF could not be loaded (${response.status}).`);
  return new File([await response.blob()], artwork.name, { type: 'application/pdf' });
}
