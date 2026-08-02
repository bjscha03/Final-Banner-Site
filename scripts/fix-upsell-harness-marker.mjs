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
