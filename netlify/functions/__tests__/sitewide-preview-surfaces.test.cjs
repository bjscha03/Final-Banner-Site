const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('payment confirmation uses the stable order-item thumbnail and lightbox', () => {
  const source = read('src/pages/PaymentSuccess.tsx');
  assert.match(source, /OrderItemPreview/);
  assert.doesNotMatch(source, /src=\{normalized\.thumbnailUrl\}/);
});

test('customer order detail uses the stable order-item thumbnail and lightbox', () => {
  const source = read('src/pages/OrderDetail.tsx');
  assert.match(source, /OrderItemPreview/);
  assert.doesNotMatch(source, /getFinalizedThumbnailUrl/);
});

test('shared My Orders and Admin order detail modal uses the stable order-item preview', () => {
  const source = read('src/components/orders/OrderDetails.tsx');
  assert.match(source, /OrderItemPreview/);
  assert.doesNotMatch(source, /getFinalizedThumbnailUrl\(item/);
});

test('Admin order rows and enlarged previews use decoded fallback candidates', () => {
  const source = read('src/pages/admin/Orders.tsx');
  assert.match(source, /getFinalizedThumbnailCandidates/);
  assert.match(source, /StablePreviewImage/);
  assert.match(source, /data-admin-product-preview/);
  assert.doesNotMatch(source, /<image href=\{thumbUrl\}/);
});

test('product display normalization no longer depends on thumbnail_url alone', () => {
  const source = read('src/lib/product-display.ts');
  assert.match(source, /getSmallPreviewUrl/);
  assert.match(source, /getExpandedPreviewSelection/);
  assert.doesNotMatch(source, /thumbnailUrl:\s*String\(item\.thumbnail_url/);
});

test('Resend templates keep their HTML while using the permanent preview source resolver', () => {
  const template = read('netlify/functions/_shared/legacy/email-template.cjs');
  const resolver = read('netlify/functions/_shared/legacy/email-preview-source.cjs');

  assert.match(template, /getPermanentEmailPreviewSource/);
  assert.match(template, /email-banner-thumbnail/);
  assert.match(resolver, /yard_sign_designs/);
  assert.match(resolver, /placement_preview/);
  assert.match(resolver, /artwork_manifest/);
  assert.match(resolver, /buildCloudinaryUrlFromFileKey/);
});
