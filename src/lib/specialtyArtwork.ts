import type { UploadedArtworkFile } from './cartArtworkForEditor';
import type { ArtworkCompositionSpec, ReadyPlacementPreviewManifest } from './previewLifecycle';
import type { SpecialtyTemplate } from './specialtyProducts';
import { uploadArtworkFile } from '@/utils/uploadArtworkFile';

export interface SpecialtySavedPanel {
  id: string;
  label: string;
  templateId: string;
  artwork: UploadedArtworkFile;
  originalArtwork?: UploadedArtworkFile;
  composition: ArtworkCompositionSpec;
  preview: ReadyPlacementPreviewManifest;
  productionUrl: string;
  productionFileKey: string;
  effectivePpi: number | null;
}
export interface SpecialtyConfiguration {
  version: 1;
  productSlug: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  materialLabel: string;
  panels: SpecialtySavedPanel[];
  approvedAt: string;
}

/** Resolution after placement; a PDF may contain vectors, so it needs separate preflight. */
export function specialtyArtworkPpi(artwork: UploadedArtworkFile, composition: Pick<ArtworkCompositionSpec,'widthIn'|'heightIn'|'transform'>): number | null {
  if(artwork.isPdf || !artwork.originalWidth || !artwork.originalHeight) return null;
  const inchesPerPixel=Math.min(composition.widthIn/artwork.originalWidth,composition.heightIn/artwork.originalHeight);
  const ppi=1/inchesPerPixel/Math.max(composition.transform.scaleX,composition.transform.scaleY);
  return Number.isFinite(ppi)&&ppi>0?ppi:null;
}

/** Export the original artwork at the exact saved placement, never the small cart image. */
export async function exportSpecialtyPanel(artwork: UploadedArtworkFile, composition: ArtworkCompositionSpec, template: SpecialtyTemplate) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const response = await fetch(artwork.productionUrl || artwork.url);
  if (!response.ok) throw new Error('The original artwork could not be read for production. Please retry.');
  const bytes = await response.arrayBuffer();
  const pdf = await PDFDocument.create();
  const scale = template.exportScale || 1;
  const w = composition.widthIn * 72 * scale, h = composition.heightIn * 72 * scale;
  const page = pdf.addPage([w, h]);
  // Acrylic uses transparent unprinted areas. Other products have a white substrate.
  if (!composition.productType.includes('acrylic-signs')) page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(1, 1, 1) });
  let graphic: any;
  if (artwork.isPdf) {
    const source = await PDFDocument.load(bytes);
    if (source.getPageCount() !== 1) throw new Error('Upload one PDF page for each print panel. Split this PDF into separate files first.');
    [graphic] = await pdf.embedPages([source.getPage(0)]);
  } else {
    const signature = new Uint8Array(bytes);
    graphic = signature[0] === 137 && signature[1] === 80 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  }
  const fit = Math.min(w / graphic.width, h / graphic.height);
  const width = graphic.width * fit * composition.transform.scaleX;
  const height = graphic.height * fit * composition.transform.scaleY;
  const position = { x: w / 2 + w * composition.transform.xPct / 100 - width / 2, y: h / 2 - h * composition.transform.yPct / 100 - height / 2, width, height };
  if (artwork.isPdf) page.drawPage(graphic, position); else page.drawImage(graphic, position);
  pdf.setTitle(`${template.id} — approved artwork`);
  pdf.setSubject(`Full-size artwork ${composition.widthIn} x ${composition.heightIn} inches; file scale ${scale}. No preview hardware or template guides included.`);
  const data = await pdf.save();
  const saved = await uploadArtworkFile(new File([new Uint8Array(data)], `${template.id}-print.pdf`, { type: 'application/pdf' }));
  return { productionUrl: saved.productionUrl || saved.secureUrl, productionFileKey: saved.fileKey };
}
