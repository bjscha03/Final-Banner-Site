import fs from 'node:fs/promises';

function replaceOne(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: target is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceRegexOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one match, found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: patch produced no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`[exact-upsell-finish] updated ${path}`);
}

await update('src/components/cart/UpsellModal.tsx', (source) => {
  let next = source;

  // Upsell previously used a relative import of the legacy preview component.
  // Vite's alias cannot be relied on for this relative specifier after importer
  // normalization, so route Upsell explicitly through the decoded, fallback-
  // aware renderer used by cart and checkout.
  next = replaceOne(
    next,
    "import BannerPreview from './BannerPreview';",
    "import BannerPreview from './StableBannerPreview';",
    'Upsell stable renderer import',
  );

  next = replaceOne(
    next,
    '  thumbnailUrl?: string; // Canvas thumbnail for preview',
    `  thumbnailUrl?: string; // Exact positioned canvas thumbnail for preview
  thumbnailIsExactComposition?: boolean;`,
    'Upsell exact thumbnail prop type',
  );

  next = replaceOne(
    next,
    `  thumbnailUrl,
  onContinue,`,
    `  thumbnailUrl,
  thumbnailIsExactComposition = false,
  onContinue,`,
    'Upsell exact thumbnail prop default',
  );

  next = replaceOne(
    next,
    `  const copy = getProductCopy(productType);
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);`,
    `  const copy = getProductCopy(productType);
  const effectiveThumbnailUrl = thumbnailUrl || quote.thumbnailUrl || quote.file?.url;
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);`,
    'Upsell deterministic effective thumbnail',
  );

  const rawImageExpression = 'imageUrl={thumbnailUrl || quote.file?.url}';
  const sourceOccurrences = next.split(rawImageExpression).length - 1;
  if (sourceOccurrences !== 2) {
    throw new Error(`Upsell image source replacement: expected 2 occurrences, found ${sourceOccurrences}`);
  }
  next = next.split(rawImageExpression).join('imageUrl={effectiveThumbnailUrl}');

  const fitPattern = /^(\s*)fitMode=\{quote\.fitMode \|\| "fill"\}$/gm;
  const fitMatches = [...next.matchAll(fitPattern)];
  if (fitMatches.length !== 2) {
    throw new Error(`Upsell exact flag insertion: expected 2 fitMode lines, found ${fitMatches.length}`);
  }
  next = next.replace(
    fitPattern,
    (_match, indent) => `${indent}fitMode={quote.fitMode || "fill"}\n${indent}isFinalizedSnapshot={thumbnailIsExactComposition}`,
  );

  next = replaceOne(
    next,
    '<div className="bg-gray-50 rounded-xl p-4">',
    `<div
            className="bg-gray-50 rounded-xl p-4"
            data-upsell-preview-source={thumbnailIsExactComposition ? 'exact-composition' : 'fallback'}
          >`,
    'Upsell exact source diagnostic',
  );

  return next;
});

await update('src/components/cart/StableBannerPreview.tsx', (source) => {
  let next = source;

  next = replaceRegexOne(
    next,
    /  \/\*\*[\s\S]*?Centering the original with `contain` guarantees the correct artwork is[\s\S]*?const previewTransformMode = visibleSourceIsExact\n    \? 'exact-snapshot'\n    : 'centered-original-fallback';/,
    `  /**
   * Exact snapshots already contain the approved placement and must never be
   * transformed twice. When the renderer falls back to the original artwork,
   * reconstruct the designer's fit/fill/drag/resize transform on the full-frame
   * layer. The saved position is container-relative percent, so translating the
   * full-frame layer by that percentage matches ArtworkPreviewEditor.
   */
  const imageObjectFit: React.CSSProperties['objectFit'] = fitMode === 'stretch'
    ? 'fill'
    : 'contain';
  const previewTransform = visibleSourceIsExact
    ? undefined
    : \`translate(\${requestedX}%, \${requestedY}%) scale(\${requestedScaleX}, \${requestedScaleY})\`;
  const previewTransformMode = visibleSourceIsExact
    ? 'exact-snapshot'
    : 'reconstructed-original';`,
    'StableBannerPreview reconstruct original composition',
  );

  next = replaceOne(
    next,
    '          ) : imageUrl && !baseFailed ? (\n            <div className="absolute inset-0 h-full w-full">',
    `          ) : imageUrl && !baseFailed ? (
            <div
              className="absolute inset-0 h-full w-full"
              style={{
                transform: previewTransform,
                transformOrigin: 'center center',
              }}
            >`,
    'StableBannerPreview apply reconstructed transform',
  );

  return next;
});

await update('tests/browser/run-preview-handoff-cdp.mjs', (source) => {
  let next = source;
  next = replaceOne(
    next,
    "const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';",
    "const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';\nconst upsellHarnessUrl = process.env.UPSELL_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/upsell-preview-handoff.html';",
    'CDP Upsell harness URL',
  );

  next = replaceOne(
    next,
    `  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
  { name: 'order-confirmation-my-orders-admin', url: orderSurfaceHarnessUrl },`,
    `  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
  { name: 'upsell-exact-composition', url: upsellHarnessUrl },
  { name: 'order-confirmation-my-orders-admin', url: orderSurfaceHarnessUrl },`,
    'CDP run actual Upsell preview',
  );
  return next;
});

await update('netlify/functions/__tests__/preview-pipeline.test.cjs', (source) => {
  let next = source;

  next = replaceOne(
    next,
    `test('Design and Google Ads use the shared session-stable artwork editor alias', () => {`,
    `test('Upsell receives a baked designer composition before it opens', () => {
  const design = read('src/pages/Design.tsx');
  const upsell = read('src/components/cart/UpsellModal.tsx');
  const banner = read('src/components/cart/StableBannerPreview.tsx');
  const runner = read('tests/browser/run-preview-handoff-cdp.mjs');
  const harness = read('tests/browser/upsell-preview-handoff.jsx');

  assert.match(design, /prepareExactCompositionPreview/);
  assert.match(design, /openUpsellWithExactComposition/);
  assert.match(design, /pendingUpsellThumbnailUrl/);
  assert.match(design, /thumbnailIsExactComposition=\{Boolean\(pendingUpsellThumbnailUrl\)\}/);
  assert.match(design, /preparedDataUrl: approvedThumbnailUrl\.startsWith/);
  assert.equal(design.includes('thumbnailUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url}'), false);
  assert.match(upsell, /from '\.\/StableBannerPreview'/);
  assert.match(upsell, /thumbnailIsExactComposition/);
  assert.match(upsell, /isFinalizedSnapshot=\{thumbnailIsExactComposition\}/);
  assert.match(upsell, /effectiveThumbnailUrl/);
  assert.match(banner, /reconstructed-original/);
  assert.match(banner, /transform: previewTransform/);
  assert.match(runner, /upsell-exact-composition/);
  assert.match(harness, /UPSELL-APPROVED-COMPOSITION/);
});

test('Design and Google Ads use the shared session-stable artwork editor alias', () => {`,
    'Preview pipeline exact Upsell source guards',
  );

  return next;
});

console.log('[exact-upsell-finish] resilient source patch complete');
