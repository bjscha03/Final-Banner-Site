import fs from 'node:fs/promises';

function replaceOne(source, before, after, label) {
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

await update('src/lib/previewSelection.ts', (source) => replaceOne(
  source,
  `function getYardSignCandidates(item: PreviewableItem): Candidate[] {
  const designs = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const candidates: Candidate[] = [];

  for (const design of designs) {
    const reconstructed = buildCloudinaryUrlFromFileKey(design.fileKey, {
      fileName: design.fileUrl,
      isPdf: design.isPdf,
    });
    const pdfPreview = buildCloudinaryPdfPreviewUrl(design.fileUrl)
      || buildCloudinaryPdfPreviewUrl(reconstructed);

    candidates.push(
      { url: design.previewThumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: design.thumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: pdfPreview, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
      { url: design.fileUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
      { url: reconstructed, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    );
  }

  return candidates;
}`,
  `function getYardSignCandidates(item: PreviewableItem): Candidate[] {
  const designs = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const design = designs[0];
  if (!design) return [];

  // An item-level Yard Sign thumbnail represents the first uploaded design.
  // Never fall through to design two when design one's first derivative fails;
  // that would make the expanded view show different customer artwork.
  const reconstructed = buildCloudinaryUrlFromFileKey(design.fileKey, {
    fileName: design.fileUrl,
    isPdf: design.isPdf,
  });
  const pdfPreview = buildCloudinaryPdfPreviewUrl(design.fileUrl)
    || buildCloudinaryPdfPreviewUrl(reconstructed);

  return [
    { url: design.previewThumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: design.thumbnailUrl, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: pdfPreview, source: 'yard_sign_preview', exactComposition: true, lowResolution: false },
    { url: design.fileUrl, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
    { url: reconstructed, source: 'yard_sign_preview', exactComposition: false, lowResolution: false },
  ];
}`,
  'previewSelection Yard Sign identity',
));

await update('netlify/functions/_shared/legacy/email-preview-source.cjs', (source) => replaceOne(
  source,
  `  const yardSignDesigns = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const yardSignSources = [];
  for (const design of yardSignDesigns) {
    const reconstructed = buildCloudinaryUrlFromFileKey(design.fileKey, {
      file_name: design.fileName || design.fileUrl,
      is_pdf: design.isPdf,
    });
    yardSignSources.push(
      design.previewThumbnailUrl,
      design.thumbnailUrl,
      buildPdfPreviewUrl(design.fileUrl),
      buildPdfPreviewUrl(reconstructed),
      design.fileUrl,
      reconstructed,
    );
  }`,
  `  const yardSignDesigns = Array.isArray(item.yard_sign_designs) ? item.yard_sign_designs : [];
  const yardSignSources = [];
  const yardSignDesign = yardSignDesigns[0];
  if (yardSignDesign) {
    const reconstructedYardSign = buildCloudinaryUrlFromFileKey(yardSignDesign.fileKey, {
      file_name: yardSignDesign.fileName || yardSignDesign.fileUrl,
      is_pdf: yardSignDesign.isPdf,
    });
    yardSignSources.push(
      yardSignDesign.previewThumbnailUrl,
      yardSignDesign.thumbnailUrl,
      buildPdfPreviewUrl(yardSignDesign.fileUrl),
      buildPdfPreviewUrl(reconstructedYardSign),
      yardSignDesign.fileUrl,
      reconstructedYardSign,
    );
  }`,
  'email Yard Sign identity',
));
