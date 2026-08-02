import fs from 'node:fs/promises';

function replaceOne(source, before, after, label) {
  if (before instanceof RegExp) {
    const matches = [...source.matchAll(new RegExp(before.source, before.flags.includes('g') ? before.flags : `${before.flags}g`))];
    if (matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches.length}`);
    return source.replace(before, after);
  }
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: target is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`updated ${path}`);
}

await update('src/pages/admin/Orders.tsx', (source) => {
  let next = replaceOne(
    source,
    "import { getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';",
    "import { getFinalizedThumbnailCandidates, getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';",
    'admin candidate import',
  );
  next = replaceOne(
    next,
    "import GrommetOverlay from '@/components/preview/GrommetOverlay';",
    "import GrommetOverlay from '@/components/preview/GrommetOverlay';\nimport StablePreviewImage from '@/components/preview/StablePreviewImage';",
    'admin image import',
  );

  const framePattern = /const ProductPreviewFrame: React\.FC<\{ item: any; thumbUrl: string \| null; large\?: boolean; idSuffix: string \}> = \(\{ item, thumbUrl, large = false, idSuffix \}\) => \{[\s\S]*?\n\};\n\n\/\/ Compact payment-method descriptor/;
  const replacement = `const ProductPreviewFrame: React.FC<{ item: any; thumbUrl: string | null; large?: boolean; idSuffix: string }> = ({ item, thumbUrl, large = false, idSuffix }) => {
  const { width, height } = getPreviewDimensions(item);
  const grommets = item?.grommets || 'none';
  const candidates = useMemo(() => [
    thumbUrl,
    ...getFinalizedThumbnailCandidates(item, large ? 1200 : 320),
  ].filter((value): value is string => Boolean(value)), [item, thumbUrl, large]);
  const candidateSignature = candidates.join('\\n');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (candidates.length === 0) setReady(false);
    setFailed(false);
  }, [candidateSignature, candidates.length]);

  const loading = candidates.length > 0 && !ready && !failed;

  return (
    <div
      className={\`relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white ${'${large ? \'max-h-[66vh]\' : \'h-full\'}'}\`}
      style={{ aspectRatio: \`${'${width} / ${height}'}\` }}
      role="img"
      aria-label={\`${'${getProductTitleLabel(item)}'} finished preview\`}
      aria-busy={loading}
      data-admin-product-preview="true"
      data-preview-ready={ready ? 'true' : 'false'}
      data-preview-failed={failed ? 'true' : 'false'}
    >
      {candidates.length > 0 && !failed ? (
        <StablePreviewImage
          sources={candidates}
          alt={\`${'${getProductTitleLabel(item)}'} finished preview\`}
          className="absolute inset-0 block h-full w-full object-contain"
          retainPreviousWhileLoading
          loadTimeoutMs={25_000}
          onReady={() => {
            setReady(true);
            setFailed(false);
          }}
          onExhausted={() => {
            setReady(false);
            setFailed(true);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 px-2 text-center text-xs font-medium text-gray-500">
          Preview unavailable
        </div>
      )}

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-white/90 text-[10px] font-semibold text-gray-600">
          Loading preview…
        </div>
      ) : null}

      <svg
        viewBox={\`0 0 ${'${width} ${height}'}\`}
        className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        aria-hidden="true"
      >
        <GrommetOverlay widthIn={width} heightIn={height} option={grommets} idSuffix={idSuffix} />
      </svg>
    </div>
  );
};

// Compact payment-method descriptor`;

  return replaceOne(next, framePattern, replacement, 'admin ProductPreviewFrame');
});

await update('netlify/functions/_shared/legacy/email-template.cjs', (source) => {
  let next = replaceOne(
    source,
    `const {
  normalizeShippingAddress,
  hasShippingAddress,
  formatShippingAddress,
} = require('./shipping-address-helpers.cjs');`,
    `const {
  normalizeShippingAddress,
  hasShippingAddress,
  formatShippingAddress,
} = require('./shipping-address-helpers.cjs');
const {
  getPermanentEmailPreviewSource,
  isCloudinaryUploadUrl,
  isHttpUrl,
} = require('./email-preview-source.cjs');`,
    'email resolver import',
  );

  next = replaceOne(
    next,
    /function isCloudinaryUploadUrl\(url\) \{[\s\S]*?\n\}\n\nfunction isHttpUrl\(url\) \{[\s\S]*?\n\}\n\n/,
    '',
    'email duplicate helpers',
  );

  return replaceOne(
    next,
    `function getFinalizedThumbnailUrl(item, maxWidth = 240) {
  if (!item || !item.thumbnail_url) return null;
  const url = String(item.thumbnail_url);`,
    `function getFinalizedThumbnailUrl(item, maxWidth = 240) {
  if (!item) return null;
  const url = getPermanentEmailPreviewSource(item);
  if (!url) return null;`,
    'email source selection',
  );
});

await update('tests/browser/run-preview-handoff-cdp.mjs', (source) => replaceOne(
  source,
  `const harnesses = [
  { name: 'active-canvas', url: activeHarnessUrl },
  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
];`,
  `const orderSurfaceHarnessUrl = process.env.ORDER_SURFACE_PREVIEW_URL || 'http://127.0.0.1:4175/tests/browser/order-surface-preview.html';

const harnesses = [
  { name: 'active-canvas', url: activeHarnessUrl },
  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
  { name: 'order-confirmation-my-orders-admin', url: orderSurfaceHarnessUrl },
];`,
  'browser order-surface harness',
));

await update('.github/workflows/order-email-tracking-regressions.yml', (source) => {
  let next = replaceOne(
    source,
    `            netlify/functions/__tests__/preview-pipeline.test.cjs \\
            netlify/functions/__tests__/admin-order-visibility.test.cjs \\`,
    `            netlify/functions/__tests__/preview-pipeline.test.cjs \\
            netlify/functions/__tests__/sitewide-preview-surfaces.test.cjs \\
            netlify/functions/__tests__/email-preview-source.test.cjs \\
            netlify/functions/__tests__/admin-order-visibility.test.cjs \\`,
    'workflow Node tests',
  );

  return replaceOne(
    next,
    `            src/lib/order-thumbnail.test.ts \\
            --reporter=verbose`,
    `            src/lib/order-thumbnail.test.ts \\
            src/lib/sitewidePreviewSurfaces.test.ts \\
            --reporter=verbose`,
    'workflow Vitest tests',
  );
});
