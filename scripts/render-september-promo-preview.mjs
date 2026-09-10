import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSeptemberPromoEmail } from '../src/lib/marketing/septemberPromoEmail.mjs';

const outputPath = resolve(process.argv[2] || 'public/september-promo-email-preview.html');
const previewToken = `p1.${'A'.repeat(43)}`;
const email = buildSeptemberPromoEmail({
  unsubscribeUrl: `https://bannersonthefly.com/.netlify/functions/marketing-email-unsubscribe?token=${previewToken}`,
});
const localPreviewHtml = email.html.replaceAll('https://bannersonthefly.com/images/', '/images/');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, localPreviewHtml, 'utf8');
console.log(outputPath);
