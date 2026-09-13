import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Pass the three approved standalone photos: banner, yard sign, car magnet.
const sources = process.argv.slice(2);
if (sources.length !== 3) throw new Error('Expected three approved photo paths');
const slugs = ['vinyl-banners', 'yard-signs', 'car-magnets'];
const output = resolve('public/images/product-editorial');
await mkdir(output, { recursive: true });
for (const [index, source] of sources.entries()) {
  for (const width of [640, 1440]) {
    await sharp(source).resize({ width }).webp({ quality: 85 }).toFile(resolve(output, `${slugs[index]}-${width}.webp`));
  }
}
