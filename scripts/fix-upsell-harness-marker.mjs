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

// The preceding handoff generator writes this source-code assertion inside a
// JavaScript template literal. Its single backslashes are consumed while that
// template is evaluated, turning the intended literal-parentheses regex into a
// different regex that cannot match the valid JSX. Replace it with an exact
// string assertion so CI verifies the real prop without regex escaping hazards.
const previewTestPath = 'netlify/functions/__tests__/preview-pipeline.test.cjs';
const previewTestSource = await fs.readFile(previewTestPath, 'utf8');
const brokenAssertion = "  assert.match(design, /thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}/);";
const fixedAssertion = "  assert.equal(design.includes('thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}'), true);";

if (!previewTestSource.includes(brokenAssertion)) {
  throw new Error('Generated Upsell exact-composition assertion was not found.');
}

const updatedPreviewTest = previewTestSource.replace(brokenAssertion, fixedAssertion);
if (!updatedPreviewTest.includes(fixedAssertion)) {
  throw new Error('Generated Upsell exact-composition assertion was not repaired.');
}

await fs.writeFile(previewTestPath, updatedPreviewTest, 'utf8');
console.log('[upsell-harness] exact-composition source assertion now uses a literal string check');
