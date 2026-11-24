import { ArtworkUploadError, isPdfArtwork } from './uploadArtworkFile';

export async function yardSignPageFiles(file: File, available: number): Promise<File[]> {
  if (!isPdfArtwork(file)) return [file];
  const { PDFDocument } = await import('pdf-lib');
  let pdf;
  try {
    pdf = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ArtworkUploadError('We could not read the PDF pages. Export an unlocked PDF or upload each design as an image.', { phase: 'validation' });
  }
  const count = pdf.getPageCount();
  if (!count || count > available) {
    throw new ArtworkUploadError(count
      ? `This PDF has ${count} pages. You have room for ${available} more designs. Upload a PDF with only the pages you want to print.`
      : 'This PDF has no pages. Choose a PDF with at least one design.', { phase: 'validation' });
  }
  if (count === 1) return [file];

  // Each page gets its own original file so editing, AI fit, and production
  // all use the same page, including when the file is reopened from the cart.
  const pages: File[] = [];
  for (const index of pdf.getPageIndices()) {
    const one = await PDFDocument.create();
    const [page] = await one.copyPages(pdf, [index]);
    one.addPage(page);
    const bytes = await one.save();
    pages.push(new File([new Uint8Array(bytes).buffer], `${file.name.replace(/\.pdf$/i, '')} - page ${index + 1}.pdf`, { type: 'application/pdf' }));
  }
  return pages;
}
