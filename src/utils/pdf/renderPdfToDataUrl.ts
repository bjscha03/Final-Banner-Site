import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export type PdfPreviewResult = {
  previewUrl: string;
  width: number;
  height: number;
  blobSize: number;
  pageNumber: number;
  cleanup: () => void;
};

export type PdfRenderOptions = {
  /** 1-indexed PDF page number. Defaults to page 1. */
  pageNumber?: number;
  /** Baseline preview scale. Defaults to 1. */
  scale?: number;
  /** Device pixel ratio used for crisp browser previews. Defaults to 1. */
  deviceScale?: number;
  /** Target backing-canvas width in pixels. */
  targetWidth?: number;
  /** Target backing-canvas height in pixels. */
  targetHeight?: number;
  /** Minimum backing-canvas width in pixels. */
  minWidth?: number;
  /** Minimum backing-canvas height in pixels. */
  minHeight?: number;
  /** Maximum backing-canvas pixels to avoid exhausting browser memory. */
  maxPixels?: number;
  signal?: AbortSignal;
};

const DEFAULT_MAX_PIXELS = 16_000_000;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('PDF rendering aborted');
};

const getPasswordMessage = (error: unknown) => {
  const err = error as { name?: string; code?: number; message?: string };
  if (err?.name === 'PasswordException' || err?.code === 1 || err?.code === 2) {
    return 'Password-protected PDFs cannot be previewed. Please upload an unlocked PDF.';
  }
  return null;
};

const computeViewportScale = (
  baseWidth: number,
  baseHeight: number,
  options: PdfRenderOptions,
) => {
  const baseScale = Math.max(0.1, options.scale ?? 1) * Math.max(1, options.deviceScale ?? 1);
  const scaleCandidates = [baseScale];
  if (options.targetWidth && options.targetWidth > 0) scaleCandidates.push(options.targetWidth / baseWidth);
  if (options.targetHeight && options.targetHeight > 0) scaleCandidates.push(options.targetHeight / baseHeight);
  if (options.minWidth && options.minWidth > 0) scaleCandidates.push(options.minWidth / baseWidth);
  if (options.minHeight && options.minHeight > 0) scaleCandidates.push(options.minHeight / baseHeight);

  let scale = Math.max(...scaleCandidates.filter(Number.isFinite));
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  const pixels = baseWidth * scale * baseHeight * scale;
  if (pixels > maxPixels) {
    scale *= Math.sqrt(maxPixels / pixels);
  }
  return Math.max(0.1, scale);
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob || blob.size <= 0) {
      reject(new Error('PDF preview canvas produced an empty PNG blob'));
      return;
    }
    if (blob.type !== 'image/png') {
      reject(new Error(`PDF preview canvas produced ${blob.type || 'an unknown type'} instead of image/png`));
      return;
    }
    resolve(blob);
  }, 'image/png', 1);
});

export async function renderPdfToDataUrl(file: File, opts: PdfRenderOptions = {}): Promise<PdfPreviewResult> {
  if (!isPdfFile(file)) {
    throw new Error(`Not a PDF file: ${file.type || file.name}`);
  }
  if (file.size === 0) {
    throw new Error('PDF file is empty');
  }

  throwIfAborted(opts.signal);

  let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  let renderTask: pdfjsLib.RenderTask | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let abortHandler: (() => void) | null = null;

  try {
    const bytes = await file.arrayBuffer();
    throwIfAborted(opts.signal);

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    abortHandler = () => {
      renderTask?.cancel();
      void loadingTask.destroy();
    };
    opts.signal?.addEventListener('abort', abortHandler, { once: true });

    pdfDocument = await loadingTask.promise;
    throwIfAborted(opts.signal);

    if (!pdfDocument.numPages || pdfDocument.numPages < 1) {
      throw new Error('PDF has no pages');
    }

    const pageNumber = opts.pageNumber ?? 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(`PDF page ${pageNumber} is outside the document range 1-${pdfDocument.numPages}`);
    }

    const page = await pdfDocument.getPage(pageNumber);
    throwIfAborted(opts.signal);

    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) {
      throw new Error('PDF page has invalid dimensions');
    }

    const viewportScale = computeViewportScale(baseViewport.width, baseViewport.height, opts);
    const viewport = page.getViewport({ scale: viewportScale });

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Could not create a canvas context for PDF preview');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    renderTask = page.render({ canvasContext: context, viewport });
    await renderTask.promise;
    throwIfAborted(opts.signal);

    const width = canvas.width;
    const height = canvas.height;
    const blob = await canvasToPngBlob(canvas);
    throwIfAborted(opts.signal);

    const previewUrl = URL.createObjectURL(blob);
    return {
      previewUrl,
      width,
      height,
      blobSize: blob.size,
      pageNumber,
      cleanup: () => URL.revokeObjectURL(previewUrl),
    };
  } catch (error) {
    const passwordMessage = getPasswordMessage(error);
    if (passwordMessage) throw new Error(passwordMessage);
    if ((error as { name?: string })?.name === 'RenderingCancelledException') {
      throw new Error('PDF rendering aborted');
    }
    throw error;
  } finally {
    if (abortHandler) opts.signal?.removeEventListener('abort', abortHandler);
    renderTask = null;
    await pdfDocument?.destroy();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
