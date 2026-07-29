const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('all major commerce and builder preview imports route through stable renderers', () => {
  const viteConfig = read('vite.config.ts');

  assert.match(viteConfig, /SessionStableArtworkPreviewEditor\.tsx/);
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

test('a decoded target is visible immediately and clears the parent loading state', () => {
  const stableImage = read('src/components/preview/StablePreviewImage.tsx');

  assert.match(stableImage, /announceReady\(best\)/);
  assert.match(stableImage, /const target = !active && layer\.url === targetUrl/);
  assert.match(stableImage, /target \? \{/);
  assert.match(stableImage, /opacity: 1/);
  assert.match(stableImage, /visibility: 'visible'/);
});

test('active design canvases never swap a healthy local preview merely because upload completed', () => {
  const sessionEditor = read('src/components/design/SessionStableArtworkPreviewEditor.tsx');
  const policy = read('src/lib/sessionArtworkPreviewSource.ts');

  assert.match(sessionEditor, /decideSessionArtworkPreviewSource/);
  assert.match(sessionEditor, /pendingPermanentSourceRef/);
  assert.match(sessionEditor, /productionUrl=\{effectiveSource\}/);
  assert.match(policy, /if \(isTransientPreviewImageUrl\(current\)\)/);
  assert.match(policy, /displaySource: current/);
  assert.match(policy, /switchAfterDecode: false/);
  assert.equal(sessionEditor.includes('setInterval('), false);
});

test('active design canvas uses one persistent DOM image instead of commerce image layers', () => {
  const originalEditor = read('src/components/design/ArtworkPreviewEditor.tsx');
  const sessionEditor = read('src/components/design/SessionStableArtworkPreviewEditor.tsx');

  assert.match(sessionEditor, /OriginalArtworkPreviewEditor/);
  assert.equal(sessionEditor.includes("from './StableArtworkPreviewEditor'"), false);
  assert.equal(originalEditor.includes('StablePreviewImage'), false);
  assert.match(originalEditor, /<img/);
  assert.match(originalEditor, /key=\{`\$\{imageSrc\}-\$\{retryNonce\}`\}/);
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

test('Design and Google Ads use the shared session-stable artwork editor alias', () => {
  const design = read('src/pages/Design.tsx');
  const googleAds = read('src/pages/GoogleAdsBanner.tsx');
  const originalEditor = read('src/components/design/ArtworkPreviewEditor.tsx');
  const sessionEditor = read('src/components/design/SessionStableArtworkPreviewEditor.tsx');

  assert.match(design, /@\/components\/design\/ArtworkPreviewEditor/);
  assert.match(googleAds, /@\/components\/design\/ArtworkPreviewEditor/);
  assert.match(originalEditor, /touchAction: 'none'/);
  assert.match(sessionEditor, /OriginalArtworkPreviewEditor/);
});
