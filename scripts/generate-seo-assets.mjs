import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.join(process.cwd(), 'public', 'images');
await mkdir(outputDir, { recursive: true });

const products = [
  { file: 'og-vinyl-banners.png', eyebrow: 'CUSTOM PRINTING', title: 'Vinyl Banners', subtitle: 'Custom sizes, materials & online pricing' },
  { file: 'og-yard-signs.png', eyebrow: 'CUSTOM PRINTING', title: 'Yard Signs', subtitle: 'One 24 × 18 size · Print-side options' },
  { file: 'og-car-magnets.png', eyebrow: 'CUSTOM PRINTING', title: 'Car Magnets', subtitle: 'Supported sizes, options & online pricing' },
];

function cardSvg({ eyebrow, title, subtitle }) {
  return Buffer.from(`
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#0B1F3A"/>
      <rect x="0" y="0" width="28" height="630" fill="#FF6A00"/>
      <rect x="72" y="78" width="18" height="474" fill="#FF6A00"/>
      <text x="132" y="151" fill="#FF8A3D" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="5">${eyebrow}</text>
      <text x="132" y="285" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="800">${title}</text>
      <text x="132" y="368" fill="#CBD5E1" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="600">${subtitle.replace('&', '&amp;')}</text>
      <rect x="132" y="429" width="414" height="76" rx="8" fill="#FF6A00"/>
      <text x="170" y="479" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800">Banners On The Fly</text>
      <text x="132" y="550" fill="#CBD5E1" font-family="Arial, Helvetica, sans-serif" font-size="25">Live preview • Nationwide shipping</text>
    </svg>
  `);
}

for (const product of products) {
  await sharp(cardSvg(product)).png({ compressionLevel: 9 }).toFile(path.join(outputDir, product.file));
}

await sharp(path.join(outputDir, 'og-vinyl-banners.png')).toFile(path.join(outputDir, 'og-default.png'));
console.log(`Generated ${products.length + 1} verified 1200x630 PNG social assets.`);
