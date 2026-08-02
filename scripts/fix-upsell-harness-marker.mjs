import fs from 'node:fs/promises';

const path = 'tests/browser/upsell-preview-handoff.jsx';
const source = await fs.readFile(path, 'utf8');

const helperAnchor = `function visibleSource(scope) {
  const images = paintedImages(scope);
  return images.find((image) => image.dataset.previewImageState === 'ready')?.src
    || images.find((image) => image.dataset.previewImageState === 'target')?.src
    || images.at(-1)?.src
    || '';
}
`;

const helperReplacement = `${helperAnchor}
function decodedSource(source) {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}
`;

if (!source.includes(helperAnchor)) {
  throw new Error('Upsell harness visibleSource helper anchor was not found.');
}

let updated = source.replace(helperAnchor, helperReplacement);
updated = updated.replace(
  "if (!smallSource.includes('UPSELL-APPROVED-COMPOSITION')) {",
  "if (!decodedSource(smallSource).includes('UPSELL-APPROVED-COMPOSITION')) {",
);
updated = updated.replace(
  "if (!expandedSource.includes('UPSELL-APPROVED-COMPOSITION')) {",
  "if (!decodedSource(expandedSource).includes('UPSELL-APPROVED-COMPOSITION')) {",
);

if (updated === source) {
  throw new Error('Upsell harness marker patch produced no change.');
}
if (!updated.includes("decodedSource(smallSource).includes('UPSELL-APPROVED-COMPOSITION')")) {
  throw new Error('Small Upsell marker assertion was not patched.');
}
if (!updated.includes("decodedSource(expandedSource).includes('UPSELL-APPROVED-COMPOSITION')")) {
  throw new Error('Expanded Upsell marker assertion was not patched.');
}

await fs.writeFile(path, updated, 'utf8');
console.log('[upsell-harness] data URL marker assertions now decode before matching');

// The handoff generator writes source-code assertions inside a JavaScript
// template literal. Backslashes in regex literals are consumed while that
// template is evaluated, so use exact string assertions for JSX/import checks.
const previewTestPath = 'netlify/functions/__tests__/preview-pipeline.test.cjs';
let previewTestSource = await fs.readFile(previewTestPath, 'utf8');

const replacements = [
  [
    "  assert.match(design, /thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}/);",
    "  assert.equal(design.includes('thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}'), true);",
    'generated exact-composition prop assertion',
  ],
  [
    "  assert.match(upsell, /from './StableBannerPreview'/);",
    "  assert.equal(upsell.includes(\"from './StableBannerPreview'\"), true);",
    'generated stable-renderer import assertion',
  ],
];

for (const [brokenAssertion, fixedAssertion, label] of replacements) {
  if (!previewTestSource.includes(brokenAssertion)) {
    throw new Error(`${label} was not found.`);
  }
  previewTestSource = previewTestSource.replace(brokenAssertion, fixedAssertion);
  if (!previewTestSource.includes(fixedAssertion)) {
    throw new Error(`${label} was not repaired.`);
  }
}

await fs.writeFile(previewTestPath, previewTestSource, 'utf8');
console.log('[upsell-harness] generated JSX/import assertions now use literal string checks');
