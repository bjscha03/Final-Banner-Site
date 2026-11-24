// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { File as NativeFile } from 'node:buffer';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import YardSignConfigurator from './YardSignConfigurator';
import YardSignDesignList from '@/components/orders/YardSignDesignList';
import { type YardSignDesign } from '@/lib/yard-sign-pricing';
import { buildCompositionSignature, isReadyPlacementPreview } from '@/lib/previewLifecycle';
import { uploadArtworkFile } from '@/utils/uploadArtworkFile';
import { yardSignPageFiles } from '@/utils/yardSignPdfPages';
import { yardSignCopiesMatch } from '@/lib/yardSignDesigns';

vi.mock('@/lib/featureFlags', () => ({ ENABLE_AI: false }));
vi.mock('@/lib/uxAnalytics', () => ({ logUx: vi.fn() }));
vi.mock('@/utils/uploadArtworkFile', async original => ({
  ...await original<typeof import('@/utils/uploadArtworkFile')>(), uploadArtworkFile: vi.fn(),
}));
vi.mock('@/components/design/ArtworkPreviewEditor', () => ({
  default: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ getCompositionSnapshot: () => ({
      transform: { xPct: 0, yPct: 0, scaleX: 1, scaleY: 1 }, revision: 0, canvasWidthPx: 240, canvasHeightPx: 180,
    }) }));
    return null;
  }),
}));
vi.mock('@/lib/previewArtifactCoordinator', () => ({
  createPermanentPlacementPreview: async (spec: any) => ({
    ...spec, url: spec.sourceUrl + '?approved', previewUrl: spec.sourceUrl + '?approved', publicId: spec.sourceIdentity,
    positionPct: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, previewWidthPx: 240, previewHeightPx: 180,
    compositionSignature: buildCompositionSignature(spec), compositionRevision: 0, uploadStatus: 'uploaded',
  }),
}));
vi.mock('@/components/preview/StablePreviewImage', () => ({
  default: ({ sources, alt }: { sources: string[]; alt: string }) => <img src={sources[0]} alt={alt} />,
}));

let root: ReturnType<typeof createRoot>, host: HTMLDivElement, saved: YardSignDesign[];
const upload = vi.mocked(uploadArtworkFile);
function Harness() {
  const [designs, setDesigns] = useState<YardSignDesign[]>([]);
  saved = designs;
  return <YardSignConfigurator designs={designs} onDesignsChange={setDesigns} orderQuantity={10}
    onOrderQuantityChange={vi.fn()} orderTotalCents={12000} sidedness="single" onSidednessChange={vi.fn()}
    addStepStakes={false} stepStakeQuantity={0} onStepStakesChange={vi.fn()} onStepStakeQuantityChange={vi.fn()}
    promoCode="" promoApplied={false} onPromoCodeChange={vi.fn()} onPromoApply={vi.fn()} onPromoRemove={vi.fn()} />;
}
async function pdfFile(widths: number[]) {
  const pdf = await PDFDocument.create();
  for (const width of widths) pdf.addPage([width, 180]).drawText('Artwork ' + width);
  return new File([new Uint8Array(await pdf.save()).buffer], 'signs.pdf', { type: 'application/pdf' });
}
async function choose(file: File) {
  const input = host.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label);
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(async () => {
  vi.stubGlobal('File', NativeFile);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  upload.mockReset().mockImplementation(async file => {
    const publicId = 'uploads/page' + (file.name.includes('page 2') ? 2 : 1);
    const url = 'https://res.cloudinary.com/example/image/upload/v1/' + publicId;
    return { fileKey: publicId, secureUrl: url + '.pdf', previewUrl: url + '.jpg',
      artworkManifest: { publicId, originalUrl: url + '.pdf' } } as Awaited<ReturnType<typeof uploadArtworkFile>>;
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('keeps both pages, saves each approved preview, and displays the paid quantities with their print pages', async () => {
  await choose(await pdfFile([240, 300]));
  expect(saved.map(d => [d.fileName, d.quantity])).toEqual([['signs - page 1.pdf', 5], ['signs - page 2.pdf', 5]]);
  const pages = await Promise.all(upload.mock.calls.map(async ([file]) => {
    const pdf = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
    return pdf.getPages().map(page => page.getWidth());
  }));
  expect(pages).toEqual([[240], [300]]);
  await click('Save and review next design');
  expect(host.textContent).toContain('Design 2 of 2 · 5 copies');
  await click('Done');
  expect(saved.every(d => isReadyPlacementPreview(d.placementPreview))).toBe(true);
  const item = { product_type: 'yard_sign', quantity: 10, yard_sign_designs: saved, yard_sign_design_count: 2 };
  expect(yardSignCopiesMatch(item)).toBe(true);
  expect(yardSignCopiesMatch({ ...item, quantity: 20 })).toBe(false);
  await act(async () => root.render(<YardSignDesignList item={item} production />));
  const rows = [...host.querySelectorAll('li')];
  expect(rows).toHaveLength(2);
  rows.forEach((row, i) => {
    expect(row.textContent).toContain(`Design ${i + 1} · 5 copies`);
    expect(row.textContent).toContain(`Print PDF page ${i + 1}`);
    expect(row.querySelector('img')?.src).toBe(saved[i].placementPreview?.previewUrl);
    expect(row.querySelector('a')?.href).toBe(saved[i].fileUrl);
  });
  // Older orders can have only the saved designer snapshot.
  await act(async () => root.render(<YardSignDesignList item={{ ...item, yard_sign_designs: null,
    canvas_state_json: JSON.stringify({ yardSignMetadata: { designs: saved } }) }} />));
  expect(host.textContent).toContain('Design 2 · 5 copies');
});
it('keeps one-page originals and rejects unreadable or over-capacity PDFs before uploading pages', async () => {
  const single = await pdfFile([240]);
  expect((await yardSignPageFiles(single, 1))[0]).toBe(single);
  await expect(yardSignPageFiles(await pdfFile([240, 300]), 1)).rejects.toThrow('2 pages');
  await expect(yardSignPageFiles(new File(['broken'], 'broken.pdf'), 10)).rejects.toThrow('read the PDF pages');
  expect(upload).not.toHaveBeenCalled();
});
it('does not add a partial design set when the second page fails to upload', async () => {
  const success = upload.getMockImplementation()!;
  upload.mockImplementationOnce(success).mockRejectedValueOnce(new Error('upload interrupted'));
  await choose(await pdfFile([240, 300]));
  expect(saved).toEqual([]);
  expect(host.textContent).toContain('retry');
});
