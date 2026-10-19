import sharp from 'sharp';

/** Make only a display derivative; the stored production chunks stay intact. */
export async function renderLargeArtworkPreview(original) {
  const source = sharp(original, { sequentialRead: true });
  const metadata = await source.metadata();
  const { data, info } = await source.rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .png().toBuffer({ resolveWithObject: true });
  const stats = await sharp(data).stats();
  if (info.channels === 4 && stats.channels[3].max === 0) {
    throw new Error('Artwork has no visible pixels. Please upload a visible design.');
  }
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    data,
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}
