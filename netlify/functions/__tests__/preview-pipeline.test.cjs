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

test('cart and checkout thumbnails render immediately without an idle skeleton swap', () => {
  const cartModal = read('src/components/CartModal.tsx');
  const checkout = read('src/pages/Checkout.tsx');

  assert.equal(cartModal.includes('enableHeavyPreviews'), false);
  assert.equal(cartModal.includes('requestIdleCallback'), false);
  assert.equal(cartModal.includes('animate-pulse'), false);
  assert.match(cartModal, /getSmallPreviewSelection/);
  assert.match(cartModal, /getExpandedPreviewSelection/);
  assert.match(cartModal, /<BannerPreview/);
  assert.match(checkout, /getSmallPreviewSelection/);
  assert.match(checkout, /getExpandedPreviewSelection/);
  assert.match(checkout, /<BannerPreview/);
  assert.match(cartModal, /smallPreview\.isExactComposition/);
  assert.match(checkout, /smallPreview\.isExactComposition/);
  assert.match(checkout, /expandedPreview\.isExactComposition/);
  assert.equal(cartModal.includes('isFinalizedSnapshot={Boolean(item.thumbnail_url)}'), false);
  assert.equal(checkout.includes('isFinalizedSnapshot={!!item.thumbnail_url}'), false);
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
  const banner = read('src/components/cart/StableBannerPreview.tsx');

  assert.match(stableImage, /announceReady\(best\)/);
  assert.match(stableImage, /const target = !active && layer\.url === targetUrl/);
  assert.match(stableImage, /target \? \{/);
  assert.match(stableImage, /opacity: 1/);
  assert.match(stableImage, /visibility: 'visible'/);
  assert.match(banner, /data-preview-loading-overlay="true"/);
  assert.match(banner, /Loading preview…/);
  assert.match(banner, /data-preview-ready/);
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

test('selected URLs carry automatic persistent artwork fallbacks and exact-composition metadata', () => {
  const selection = read('src/lib/previewSelection.ts');
  const registry = read('src/lib/previewSourceRegistry.ts');
  const banner = read('src/components/cart/StableBannerPreview.tsx');

  assert.match(selection, /placement_preview/);
  assert.match(selection, /artwork_manifest/);
  assert.match(selection, /yard_sign_designs/);
  assert.match(selection, /buildCloudinaryUrlFromFileKey/);
  assert.match(selection, /registerPreviewSourceCandidates/);
  assert.match(registry, /getRegisteredPreviewSourceCandidates/);
  assert.match(registry, /isRegisteredExactComposition/);
  assert.match(banner, /getRegisteredPreviewSourceCandidates/);
  assert.match(banner, /isRegisteredExactComposition/);
});

test('commerce previews never stretch or crop baked artwork snapshots', () => {
  const banner = read('src/components/cart/StableBannerPreview.tsx');

  assert.match(banner, /fitMode === 'stretch'/);
  assert.match(banner, /: 'contain'/);
  assert.match(banner, /data-preview-exact/);
  assert.doesNotMatch(banner, /isApprovedSnapshot\s*\?\s*'fill'/);
});

test('commerce preview frames use the product ratio instead of containing-block padding math', () => {
  const banner = read('src/components/cart/StableBannerPreview.tsx');

  assert.match(banner, /aspectRatio:\s*`\$\{safeWidth\} \/ \$\{safeHeight\}`/);
  assert.equal(banner.includes('paddingBottom: framePaddingBottom'), false);
  assert.equal(banner.includes('const framePaddingBottom'), false);
});

test('enlarged previews use safe-area-aware dynamic viewport sizing without zero-scale measurement', () => {
  const lightbox = read('src/components/preview/StableProductPreviewLightbox.tsx');

  assert.equal(lightbox.includes('ResizeObserver'), false);
  assert.equal(lightbox.includes('scale(0'), false);
  assert.match(lightbox, /100dvh/);
  assert.match(lightbox, /safe-area-inset-top/);
  assert.match(lightbox, /safe-area-inset-bottom/);
  assert.match(lightbox, /data-expanded-product-preview/);
  assert.match(lightbox, /overflow-x-hidden/);
});

test('real-browser commerce matrix loads production CSS and validates all core shapes', () => {
  const harness = read('tests/browser/commerce-preview-handoff.jsx');

  assert.match(harness, /@\/index\.css/);
  assert.match(harness, /handoff-landscape/);
  assert.match(harness, /portrait/);
  assert.match(harness, /square/);
  assert.match(harness, /wide-positioned-data-priority/);
  assert.match(harness, /wide-positioned-exact/);
  assert.match(harness, /extreme-wide/);
  assert.match(harness, /fallback-chain/);
  assert.match(harness, /yard-sign-identity/);
  assert.match(harness, /hasExpectedRatio/);
});

test('Upsell receives a baked designer composition before it opens', () => {
  const design = read('src/pages/Design.tsx');
  const upsell = read('src/components/cart/UpsellModal.tsx');
  const banner = read('src/components/cart/StableBannerPreview.tsx');
  const runner = read('tests/browser/run-preview-handoff-cdp.mjs');
  const harness = read('tests/browser/upsell-preview-handoff.jsx');

  assert.match(design, /prepareExactCompositionPreview/);
  assert.match(design, /openUpsellWithExactComposition/);
  assert.match(design, /pendingUpsellThumbnailUrl/);
  assert.equal(design.includes('thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}'), true);
  assert.match(design, /preparedDataUrl: approvedThumbnailUrl.startsWith/);
  assert.equal(design.includes('thumbnailUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url}'), false);
  assert.equal(upsell.includes("from './StableBannerPreview'"), true);
  assert.match(upsell, /thumbnailIsExactComposition/);
  assert.match(upsell, /isFinalizedSnapshot={thumbnailIsExactComposition}/);
  assert.match(upsell, /effectiveThumbnailUrl/);
  assert.match(banner, /reconstructed-original/);
  assert.match(banner, /transform: previewTransform/);
  assert.match(runner, /upsell-exact-composition/);
  assert.match(harness, /UPSELL-APPROVED-COMPOSITION/);
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

test('diagnose the exact 120x48 customer artwork source shown in the failed preview', async () => {
  const sharp = require('sharp');
  const url = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778430298/8072d966-0283-4b44-b972-4964edf3351a_n2fxia.png';
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const input = Buffer.from(await response.arrayBuffer());
  assert.ok(input.length > 0);

  const metadata = await sharp(input, { failOn: 'none' }).metadata();
  const { data, info } = await sharp(input, { failOn: 'none' })
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let nonWhitePixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (Math.max(255 - r, 255 - g, 255 - b) <= 10) continue;
      nonWhitePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bbox = maxX >= minX && maxY >= minY
    ? {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        widthFraction: (maxX - minX + 1) / info.width,
        heightFraction: (maxY - minY + 1) / info.height,
      }
    : null;
  console.log('[ACTUAL_WIDE_ARTWORK_DIAGNOSTIC]', JSON.stringify({
    url,
    bytes: input.length,
    metadata,
    analysisWidth: info.width,
    analysisHeight: info.height,
    nonWhiteFraction: nonWhitePixels / (info.width * info.height),
    bbox,
  }));
  assert.ok(nonWhitePixels > 0);
});
