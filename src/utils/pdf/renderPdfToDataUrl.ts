// renderPdfToDataUrl.ts
// Renders page 1 of a PDF File to a data URL for <img src="...">

let _pdfjsLib: typeof import('pdfjs-dist') | null = null;
let _pdfjsWorker: any | null = null;

export type PdfRenderOptions = {
  scale?: number;                 // UI preview scale (1 = 100%)
  deviceScale?: number;           // window.devicePixelRatio, default 1
  signal?: AbortSignal;           // allow cancellation when user replaces file
};

export async function renderPdfToDataUrl(file: File, opts: PdfRenderOptions = {}): Promise<string> {
  if (file.type !== 'application/pdf') {
    throw new Error('Not a PDF file');
  }
  const scale = Math.max(0.1, opts.scale ?? 1);
  const deviceScale = Math.max(1, Math.floor(opts.deviceScale ?? (globalThis.window?.devicePixelRatio ?? 1)));

  // Lazy import pdfjs and set worker
  if (!_pdfjsLib) {
    _pdfjsLib = await import('pdfjs-dist');
    // Set worker source to match the installed version (5.4.149)
    (_pdfjsLib as any).GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
  }

  const arrayBuffer = await file.arrayBuffer();
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const loadingTask = (_pdfjsLib as any).getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: scale * deviceScale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderTask = page.render({ canvasContext: ctx as any, viewport });
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => renderTask.cancel(), { once: true });
  }
  await renderTask.promise;

  const dataUrl = canvas.toDataURL('image/png', 0.92);
  // Clean up
  await pdf.destroy();
  return dataUrl;
}
