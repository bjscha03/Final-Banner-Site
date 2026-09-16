const { PDFDocument } = require('pdf-lib');

async function prepareDoubleSidedBannerPdf(buffer, material) {
  if (material !== '18oz_double') return buffer;
  const pdf = await PDFDocument.load(buffer);
  if (pdf.getPageCount() !== 1) throw new Error('Double-sided banner artwork must contain one approved design.');
  const [back] = await pdf.copyPages(pdf, [0]);
  pdf.addPage(back);
  pdf.setTitle('Double-Sided Banner — Front and Back');
  pdf.setSubject('18 oz vinyl. Same approved artwork on both sides. Page 1: front. Page 2: back.');
  return Buffer.from(await pdf.save());
}
module.exports = { prepareDoubleSidedBannerPdf };
