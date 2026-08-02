import fs from 'node:fs/promises';

function count(source, needle) {
  if (!needle) return 0;
  return source.split(needle).length - 1;
}

function replaceExact(source, before, after, expected, label) {
  const matches = count(source, before);
  if (matches !== expected) {
    throw new Error(`${label}: expected ${expected} occurrence(s), found ${matches}`);
  }
  return source.split(before).join(after);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: patch produced no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`[thumbnail-composition] updated ${path}`);
}

await update('src/components/CartModal.tsx', (source) => {
  let next = replaceExact(
    source,
    "import { getExpandedPreviewSelection, getSmallPreviewUrl } from '@/lib/previewSelection';",
    "import { getExpandedPreviewSelection, getSmallPreviewSelection } from '@/lib/previewSelection';",
    1,
    'CartModal selection import',
  );
  next = replaceExact(
    next,
    `                  const smallPreviewUrl = getSmallPreviewUrl(item);
                  const expandedPreview = getExpandedPreviewSelection(item);`,
    `                  const smallPreview = getSmallPreviewSelection(item);
                  const smallPreviewUrl = smallPreview.url;
                  const expandedPreview = getExpandedPreviewSelection(item);`,
    1,
    'CartModal small selection',
  );
  next = replaceExact(
    next,
    "isFinalizedSnapshot={expandedPreview.source === 'web_preview' || expandedPreview.source === 'final_render'}",
    'isFinalizedSnapshot={expandedPreview.isExactComposition}',
    1,
    'CartModal expanded exact flag',
  );
  next = replaceExact(
    next,
    'isFinalizedSnapshot={Boolean(item.thumbnail_url)}',
    'isFinalizedSnapshot={smallPreview.isExactComposition}',
    1,
    'CartModal small exact flag',
  );
  return next;
});

await update('src/pages/Checkout.tsx', (source) => {
  let next = replaceExact(
    source,
    "import { getExpandedPreviewSelection, getSmallPreviewUrl } from '@/lib/previewSelection';",
    "import { getExpandedPreviewSelection, getSmallPreviewSelection } from '@/lib/previewSelection';",
    1,
    'Checkout selection import',
  );
  next = replaceExact(
    next,
    `                    const smallPreviewUrl = getSmallPreviewUrl(item);
                    const expandedPreview = getExpandedPreviewSelection(item);`,
    `                    const smallPreview = getSmallPreviewSelection(item);
                    const smallPreviewUrl = smallPreview.url;
                    const expandedPreview = getExpandedPreviewSelection(item);`,
    1,
    'Checkout small selection',
  );
  next = replaceExact(
    next,
    "isFinalizedSnapshot={expandedPreview.source === 'web_preview' || expandedPreview.source === 'final_render'}",
    'isFinalizedSnapshot={expandedPreview.isExactComposition}',
    2,
    'Checkout expanded exact flags',
  );
  next = replaceExact(
    next,
    'isFinalizedSnapshot={!!item.thumbnail_url}',
    'isFinalizedSnapshot={smallPreview.isExactComposition}',
    2,
    'Checkout small exact flags',
  );
  return next;
});

await update('netlify/functions/__tests__/preview-pipeline.test.cjs', (source) => {
  let next = replaceExact(
    source,
    '  assert.match(cartModal, /getSmallPreviewUrl/);',
    '  assert.match(cartModal, /getSmallPreviewSelection/);',
    1,
    'preview pipeline CartModal selection guard',
  );
  next = replaceExact(
    next,
    '  assert.match(checkout, /getSmallPreviewUrl/);',
    '  assert.match(checkout, /getSmallPreviewSelection/);',
    1,
    'preview pipeline Checkout selection guard',
  );
  next = replaceExact(
    next,
    `  assert.match(checkout, /<BannerPreview/);
});`,
    `  assert.match(checkout, /<BannerPreview/);
  assert.match(cartModal, /smallPreview\\.isExactComposition/);
  assert.match(checkout, /smallPreview\\.isExactComposition/);
  assert.match(checkout, /expandedPreview\\.isExactComposition/);
  assert.equal(cartModal.includes('isFinalizedSnapshot={Boolean(item.thumbnail_url)}'), false);
  assert.equal(checkout.includes('isFinalizedSnapshot={!!item.thumbnail_url}'), false);
});`,
    1,
    'preview pipeline exact composition guards',
  );
  next = replaceExact(
    next,
    `  assert.match(harness, /extreme-wide/);
  assert.match(harness, /fallback-chain/);`,
    `  assert.match(harness, /wide-positioned-data-priority/);
  assert.match(harness, /wide-positioned-exact/);
  assert.match(harness, /extreme-wide/);
  assert.match(harness, /fallback-chain/);`,
    1,
    'preview pipeline wide composition browser case',
  );
  return next;
});

console.log('[thumbnail-composition] deterministic surface patch complete');
