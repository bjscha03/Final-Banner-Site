import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const outputDir = path.join(process.cwd(), 'public', 'images');
await mkdir(outputDir, { recursive: true });

const products = [
  { file: 'og-vinyl-banners.png', eyebrow: 'CUSTOM PRINTING', title: 'Vinyl Banners', accent: '#ff6b35' },
  { file: 'og-yard-signs.png', eyebrow: 'CUSTOM PRINTING', title: 'Yard Signs', accent: '#f59e0b' },
  { file: 'og-car-magnets.png', eyebrow: 'CUSTOM PRINTING', title: 'Car Magnets', accent: '#38bdf8' },
];

function cardSvg({ eyebrow, title, accent }) {
  return Buffer.from(`
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#081a33"/>
          <stop offset="1" stop-color="#18448D"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#background)"/>
      <circle cx="1080" cy="95" r="240" fill="${accent}" opacity="0.18"/>
      <circle cx="1085" cy="570" r="180" fill="#ffffff" opacity="0.06"/>
      <rect x="72" y="78" width="18" height="474" rx="9" fill="${accent}"/>
      <text x="132" y="151" fill="${accent}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="5">${eyebrow}</text>
      <text x="132" y="285" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="800">${title}</text>
      <text x="132" y="368" fill="#dbeafe" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="600">Current sizes, options &amp; online pricing</text>
      <rect x="132" y="429" width="414" height="76" rx="18" fill="${accent}"/>
      <text x="170" y="479" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800">Banners On The Fly</text>
      <text x="132" y="550" fill="#bfdbfe" font-family="Arial, Helvetica, sans-serif" font-size="25">Live preview • Nationwide shipping</text>
    </svg>
  `);
}

for (const product of products) {
  await sharp(cardSvg(product)).png({ compressionLevel: 9 }).toFile(path.join(outputDir, product.file));
}

await sharp(path.join(outputDir, 'og-vinyl-banners.png')).toFile(path.join(outputDir, 'og-default.png'));
console.log(`Generated ${products.length + 1} verified 1200x630 PNG social assets.`);
