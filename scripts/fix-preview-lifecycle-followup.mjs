import fs from 'node:fs/promises';

const DESIGN_PATH = 'src/pages/Design.tsx';
const TEST_PATH = 'netlify/functions/__tests__/preview-pipeline.test.cjs';
const MARKER = '// PREVIEW_LIFECYCLE_FOLLOWUP_V1';

function countOccurrences(source, token) {
  if (!token) return 0;
  return source.split(token).length - 1;
}

function replaceOne(source, before, after, label) {
  const count = countOccurrences(source, before);
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceFirstWithCount(source, before, after, expectedCount, label) {
  const count = countOccurrences(source, before);
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} matches, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceAllWithCount(source, before, after, expectedCount, label) {
  const count = countOccurrences(source, before);
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} matches, found ${count}`);
  }
  return source.split(before).join(after);
}

function replaceRegexWithCount(source, pattern, replacement, expectedCount, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches = [...source.matchAll(matcher)];
  if (matches.length !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} matches, found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

let design = await fs.readFile(DESIGN_PATH, 'utf8');
let test = await fs.readFile(TEST_PATH, 'utf8');

if (design.includes(MARKER)) {
  console.log('[preview-lifecycle-followup] already applied');
  process.exit(0);
}

// The shared lifecycle signature accepts an ArtworkCompositionSpec. Remove the
// unused helper import and eliminate the undefined local fitMode reference.
design = replaceOne(
  design,
  `  placementPreviewMatches,\n  toCheckoutTransform,\n} from '@/lib/previewLifecycle';`,
  `  placementPreviewMatches,\n} from '@/lib/previewLifecycle';\n${MARKER}`,
  'remove unused checkout transform import and add marker',
);
design = replaceOne(
  design,
  `      fitMode: fitMode || 'fill',`,
  `      fitMode: 'fill',`,
  'use deterministic composition fit mode',
);
design = replaceOne(
  design,
  `  }, [widthIn, heightIn, fitMode]);`,
  `  }, [widthIn, heightIn]);`,
  'remove undefined fitMode dependency',
);

// Yard signs use their own multi-design pipeline. Do not force them through the
// single-artwork permanent-preview coordinator before their existing branch.
design = replaceOne(
  design,
  `    const checkoutData = directData || pendingCheckoutData;\n    if (!checkoutData) {\n      throw new PreviewLifecycleError('PREVIEW_GEOMETRY_NOT_READY', 'No canonical artwork composition is available.');\n    }\n    const placementPreview = await prepareExactCompositionPreview(checkoutData);\n    const approvedThumbnailUrl = placementPreview.url;\n    let checkoutArtwork = uploadedFileRef.current;`,
  `    const checkoutData = directData || pendingCheckoutData;\n    let placementPreview: PreparedCompositionPreview | null = null;\n    let approvedThumbnailUrl = '';\n    if (!isYardSign) {\n      if (!checkoutData) {\n        throw new PreviewLifecycleError('PREVIEW_GEOMETRY_NOT_READY', 'No canonical artwork composition is available.');\n      }\n      placementPreview = await prepareExactCompositionPreview(checkoutData);\n      approvedThumbnailUrl = placementPreview.url;\n    }\n    let checkoutArtwork = uploadedFileRef.current;`,
  'bypass single-artwork preview for yard signs',
);

// The first generated patch changed scale references in the car-magnet actions
// but missed the matching canonical-data declaration. Replace both remaining
// action-time DOM conversions with the editor-emitted normalized transform.
const staleMeasurementPattern = /          const container = previewContainerRef\.current;\n          const containerWidth = container\?\.offsetWidth \|\| 1;\n          const containerHeight = container\?\.offsetHeight \|\| 1;\n          const posPercent = \{\n            x: \(imgPos\.x \/ containerWidth\) \* 100,\n            y: \(imgPos\.y \/ containerHeight\) \* 100,\n          \};/g;
const canonicalActionBlock = [
  '          let canonicalCheckoutData;',
  '          try {',
  '            canonicalCheckoutData = getCanonicalCheckoutData();',
  '          } catch (error) {',
  '            const explained = explainPreviewLifecycleError(error);',
  "            toast({ title: explained.title, description: `${explained.description} (${explained.code})`, variant: 'destructive' });",
  '            return;',
  '          }',
  '          const posPercent = canonicalCheckoutData.pos;',
].join('\n');
design = replaceRegexWithCount(
  design,
  staleMeasurementPattern,
  canonicalActionBlock,
  2,
  'replace stale car-magnet action measurements',
);

// Remove the obsolete in-function data-URL thumbnail renderer. The permanent
// placement artifact created above is now the only approved thumbnail source.
design = replaceRegexWithCount(
  design,
  /    \/\/ Generate the approved thumbnail \(single source of truth\)[\s\S]*?\n    const updatedTotals = calcTotals\(\{/,
  '    const updatedTotals = calcTotals({',
  1,
  'remove legacy banner data-url thumbnail block',
);

// The legacy baseImageUrl variable lived inside the block removed above.
// Background web previews may still be generated as fallbacks, but they must
// read the artwork source directly and must never overwrite placementPreview.
design = replaceAllWithCount(
  design,
  '      imageUrl: baseImageUrl,',
  '      imageUrl: checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || checkoutArtwork.url,',
  2,
  'replace removed baseImageUrl references',
);
design = replaceOne(
  design,
  `          cartStore.updatePlacementPreviewStatus(itemId, {\n            url: positioned.url,\n            publicId: positioned.fileKey,\n            uploadStatus: 'uploaded',\n            uploadedAt: new Date().toISOString(),\n          });\n`,
  '',
  'prevent successful web preview from overwriting exact placement artifact',
);
design = replaceOne(
  design,
  `        cartStore.updatePlacementPreviewStatus(itemId, {\n          uploadStatus: 'failed',\n          error: err instanceof Error ? err.message : 'Placement preview upload failed',\n        });\n`,
  '',
  'prevent web preview failure from invalidating exact placement artifact',
);

// Persist the exact manifest on car-magnet items too. The first occurrence is
// the magnet quote; the second is the banner quote, which already stores the
// manifest later in its object.
design = replaceFirstWithCount(
  design,
  `        thumbnailUrl: approvedThumbnailUrl,\n        file:`,
  `        thumbnailUrl: approvedThumbnailUrl,\n        placementPreview,\n        file:`,
  2,
  'persist car-magnet placement preview manifest',
);

// Update the regression test to assert the permanent manifest contract rather
// than the deleted temporary data-URL implementation.
test = replaceOne(
  test,
  `  assert.match(design, /preparedDataUrl: approvedThumbnailUrl.startsWith/);`,
  `  assert.match(design, /placementPreview = await prepareExactCompositionPreview/);\n  assert.match(design, /approvedThumbnailUrl = placementPreview\\.url/);\n  assert.match(design, /placementPreview,/);\n  assert.doesNotMatch(design, /preparedDataUrl:/);\n  assert.doesNotMatch(design, /preparedComposition\\.dataUrl/);\n  assert.doesNotMatch(design, /updatePlacementPreviewStatus\\(itemId/);`,
  'update exact-composition regression assertion',
);

const forbiddenDesignFragments = [
  "fitMode: fitMode || 'fill'",
  'preparedComposition.dataUrl',
  'imageUrl: baseImageUrl',
  'buildCompositionSignature(\n      baseImageUrl',
  'cartStore.updatePlacementPreviewStatus(itemId',
];
for (const fragment of forbiddenDesignFragments) {
  if (design.includes(fragment)) {
    throw new Error(`forbidden generated Design fragment remains: ${fragment}`);
  }
}

if (!design.includes('placementPreview = await prepareExactCompositionPreview(checkoutData);')) {
  throw new Error('permanent placement preview is not prepared before cart insertion');
}
if (!design.includes('thumbnailUrl: approvedThumbnailUrl,\n        placementPreview,')) {
  throw new Error('car-magnet item is missing its permanent placement manifest');
}
if (!test.includes('assert.doesNotMatch(design, /updatePlacementPreviewStatus')) {
  throw new Error('preview regression test was not upgraded');
}

await fs.writeFile(DESIGN_PATH, design, 'utf8');
await fs.writeFile(TEST_PATH, test, 'utf8');
console.log('[preview-lifecycle-followup] corrected generated source and regression coverage');
