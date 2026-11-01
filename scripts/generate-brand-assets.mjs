import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Approved November 1, 2026 upload: preserve its pixels and lettering exactly.
const root = path.join(process.cwd(), 'public');
const images = path.join(root, 'images');
const original = path.join(images, 'bof-logo-20261101.png');
const source = await readFile(original);
const metadata = await sharp(source).metadata();
if (metadata.width !== 1082 || metadata.height !== 255) {
  throw new Error('The approved BOF logo must be the original 1082 × 255 upload.');
}
await mkdir(path.join(images, 'homepage'), { recursive: true });

// Keep older direct links valid. New templates use the versioned PNG above.
for (const name of ['header-logo.png', 'homepage/header-logo-reverse.png']) {
  await copyFile(original, path.join(images, name));
}
const data = `data:image/png;base64,${source.toString('base64')}`;
const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1082" height="255" viewBox="0 0 1082 255" role="img" aria-label="Banners On The Fly"><image width="1082" height="255" href="${data}"/></svg>\n`;
for (const name of ['logo-full.svg', 'logo-compact.svg', 'logo-hero.svg', 'banners-on-the-fly-logo.svg']) {
  await writeFile(path.join(images, name), fullSvg);
}
await writeFile(path.join(images, 'logo-social.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Banners On The Fly"><rect width="1200" height="630" fill="white"/><image x="59" y="187.5" width="1082" height="255" href="${data}"/></svg>\n`);

// Crop only the supplied flag for square app/tab icons; never redraw it.
const flag = await sharp(source).extract({ left: 0, top: 0, width: 345, height: 255 }).png().toBuffer();
const icon = size => sharp(flag).resize(size, size, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
await writeFile(path.join(images, 'bof-icon-20261101.png'), await icon(512));
const iconData = `data:image/png;base64,${(await icon(512)).toString('base64')}`;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Banners On The Fly"><image width="512" height="512" href="${iconData}"/></svg>\n`;
await writeFile(path.join(images, 'logo-icon.svg'), iconSvg);
for (const name of ['favicon.svg', 'favicon-16x16.svg', 'favicon-32x32.svg']) {
  await writeFile(path.join(root, name), iconSvg);
}
for (const [name, size] of [['favicon-16x16', 16], ['favicon-32x32', 32], ['apple-touch-icon', 180]]) {
  const bytes = await icon(size);
  await writeFile(path.join(root, `${name}.png`), bytes);
  await writeFile(path.join(root, `${name}-20261101.png`), bytes);
}
await writeFile(path.join(root, 'favicon.png'), await icon(512));
await sharp(flag).resize(512, 512, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 95 }).toFile(path.join(root, 'favicon.jpg'));

// ICO directory with PNG entries, supported by modern browsers and Windows.
const sizes = [16, 32, 48];
const entries = await Promise.all(sizes.map(icon));
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((bytes, i) => {
  const at = 6 + 16 * i;
  header[at] = sizes[i]; header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(bytes.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
const ico = Buffer.concat([header, ...entries]);
await writeFile(path.join(root, 'favicon.ico'), ico);
await writeFile(path.join(root, 'favicon-20261101.ico'), ico);
console.log('Generated BOF logo compatibility assets and versioned browser/app icons.');
