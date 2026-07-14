import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

export type PdfRenderOptions = {
  scale?: number;
  deviceScale?: number;
  signal?: AbortSignal;
  targetCssWidth?: number;
  targetCssHeight?: number;
  qualityMultiplier?: number;
  maxPixels?: number;
  minLongEdge?: number;
};

const waitForAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('PDF preview rendering was cancelled', 'AbortError');
};

export async function renderPdfToDataUrl(file: File, opts: PdfRenderOptions = {}): Promise<string> {
  if (file.type !== 'application/pdf') {
    throw new Error(`Invalid file type: ${file.type}. Expected application/pdf.`);
  }
  if (file.size === 0) throw new Error('PDF file is empty');
  waitForAbort(opts.signal);

  if (!pdfjsLib) pdfjsLib = await import('pdfjs-dist');

  const arrayBuffer = await file.arrayBuffer();
  waitForAbort(opts.signal);

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages < 1) throw new Error('PDF has no pages to preview');
    const page = await pdf.getPage(1);
    waitForAbort(opts.signal);

    const baseViewport = page.getViewport({ scale: 1 });
    const deviceScale = Math.max(1, opts.deviceScale ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
    const qualityMultiplier = opts.qualityMultiplier ?? 2;
    const minLongEdge = opts.minLongEdge ?? 2400;
    const maxPixels = opts.maxPixels ?? 24_000_000;
    const cssW = Math.max(opts.targetCssWidth || 0, baseViewport.width);
    const cssH = Math.max(opts.targetCssHeight || 0, baseViewport.height);
    const desiredLongEdge = Math.max(cssW, cssH, minLongEdge) * deviceScale * qualityMultiplier;
    let renderScale = desiredLongEdge / Math.max(baseViewport.width, baseViewport.height);
    let viewport = page.getViewport({ scale: renderScale });
    const pixels = viewport.width * viewport.height;
    if (pixels > maxPixels) {
      renderScale *= Math.sqrt(maxPixels / pixels);
      viewport = page.getViewport({ scale: renderScale });
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not create PDF preview canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.width = `${Math.floor(viewport.width / deviceScale)}px`;
    canvas.style.height = `${Math.floor(viewport.height / deviceScale)}px`;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    console.info('[PDF_PREVIEW] rendering page 1', {
      fileName: file.name,
      fileSize: file.size,
      pdfViewport: `${Math.round(baseViewport.width)}x${Math.round(baseViewport.height)}`,
      canvasPixels: `${canvas.width}x${canvas.height}`,
      renderScale: Number(renderScale.toFixed(3)),
      deviceScale,
      qualityMultiplier,
      maxPixels,
    });

    await page.render({ canvasContext: context, viewport }).promise;
    waitForAbort(opts.signal);
    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 1;
    canvas.height = 1;
    return dataUrl;
  } finally {
    await pdf.destroy();
  }
}
