const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('all major commerce and builder preview imports route through stable renderers', () => {
  const viteConfig = read('vite.config.ts');

  assert.match(viteConfig, /StableArtworkPreviewEditor\.tsx/);
  assert.match(viteConfig, /StableYardSignConfigurator\.tsx/);
  assert.match(viteConfig, /StableBannerPreview\.tsx/);
  assert.match(viteConfig, /StableThumbnailPreviewWrapper\.tsx/);
  assert.match(viteConfig, /@\\\/components\\\/design\\\/ArtworkPreviewEditor/);
  assert.match(viteConfig, /@\\\/components\\\/design\\\/YardSignConfigurator/);
  assert.match(viteConfig, /@\\\/components\\\/cart\\\/BannerPreview/);
});

test('cart thumbnails render immediately without an idle skeleton swap', () => {
  const cartModal = read('src/components/CartModal.tsx');

  assert.equal(cartModal.includes('enableHeavyPreviews'), false);
  assert.equal(cartModal.includes('requestIdleCallback'), false);
  assert.equal(cartModal.includes('animate-pulse'), false);
  assert.match(cartModal, /<BannerPreview/);
});

test('preview images are decoded, double-buffered, and loaded concurrently', () => {
  const cache = read('src/lib/previewImageCache.ts');
  const stableImage = read('src/components/preview/StablePreviewImage.tsx');

  assert.match(cache, /await image\.decode\(\)/);
  assert.match(cache, /previewImageCache/);
  assert.match(stableImage, /retainPreviousWhileLoading/);
  assert.match(stableImage, /layers\.map/);
  assert.match(stableImage, /targetUrlRef/);
  assert.match(stableImage, /buffering/);
  assert.match(stableImage, /candidatesToLoad\.forEach/);
  assert.equal(stableImage.includes('for (const candidate of usableCandidates)'), false);
});

test('selected thumbnail URLs carry automatic artwork fallbacks', () => {
  const selection = read('src/lib/previewSelection.ts');
  const registry = read('src/lib/previewSourceRegistry.ts');
  const banner = read('src/components/cart/StableBannerPreview.tsx');

  assert.match(selection, /registerPreviewSourceCandidates/);
  assert.match(registry, /getRegisteredPreviewSourceCandidates/);
  assert.match(banner, /getRegisteredPreviewSourceCandidates/);
});

test('enlarged previews no longer depend on zero-scale JavaScript measurement', () => {
  const lightbox = read('src/components/preview/StableProductPreviewLightbox.tsx');

  assert.equal(lightbox.includes('ResizeObserver'), false);
  assert.equal(lightbox.includes('scale(0'), false);
  assert.match(lightbox, /68dvh/);
  assert.match(lightbox, /maxHeight: 'calc\(100dvh - 16px\)'/);
});

test('Design and Google Ads use the shared artwork editor import covered by the stable alias', () => {
  const design = read('src/pages/Design.tsx');
  const googleAds = read('src/pages/GoogleAdsBanner.tsx');
  const editor = read('src/components/design/StableArtworkPreviewEditor.tsx');

  assert.match(design, /@\/components\/design\/ArtworkPreviewEditor/);
  assert.match(googleAds, /@\/components\/design\/ArtworkPreviewEditor/);
  assert.match(editor, /StablePreviewImage/);
  assert.match(editor, /retainDuringHandoff/);
  assert.match(editor, /touchAction: 'none'/);
});
