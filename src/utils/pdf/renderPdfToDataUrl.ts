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
  /** Hard timeout for parsing/rendering the PDF page. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_MAX_PIXELS = 16_000_000;
const CONSTRAINED_DEVICE_MAX_PIXELS = 2_500_000;
const CONSTRAINED_DEVICE_TIMEOUT_MS = 25_000;
const DEFAULT_TIMEOUT_MS = 45_000;
const PREVIEW_MIME_TYPE = 'image/jpeg';
const PREVIEW_QUALITY = 0.9;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

const isConstrainedBrowser = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return Boolean(
    window.matchMedia?.('(max-width: 768px)').matches
    || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4),
  );
};

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
  const constrained = isConstrainedBrowser();
  const requestedDeviceScale = Math.max(1, options.deviceScale ?? 1);
  const deviceScaleCap = constrained ? 1.15 : 2;
  const safeDeviceScale = Math.min(requestedDeviceScale, deviceScaleCap);
  const baseScale = Math.max(0.1, options.scale ?? 1) * safeDeviceScale;
  const scaleCandidates = [baseScale];

  if (options.targetWidth && options.targetWidth > 0) scaleCandidates.push(options.targetWidth / baseWidth);
  if (options.targetHeight && options.targetHeight > 0) scaleCandidates.push(options.targetHeight / baseHeight);
  if (options.minWidth && options.minWidth > 0) scaleCandidates.push(options.minWidth / baseWidth);
  if (options.minHeight && options.minHeight > 0) scaleCandidates.push(options.minHeight / baseHeight);

  let scale = Math.max(...scaleCandidates.filter(Number.isFinite));
  const requestedMaxPixels = options.maxPixels ?? DEFAULT_MAX_PIXELS;
  const maxPixels = constrained
    ? Math.min(requestedMaxPixels, CONSTRAINED_DEVICE_MAX_PIXELS)
    : requestedMaxPixels;
  const pixels = baseWidth * scale * baseHeight * scale;

  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  return Math.max(0.1, scale);
};

const dataUrlToBlob = (dataUrl: string) => {
  const [header, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || PREVIEW_MIME_TYPE;
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

const canvasToPreviewBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  let settled = false;

  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    callback();
  };

  const timeoutId = window.setTimeout(() => {
    try {
      const fallback = dataUrlToBlob(canvas.toDataURL(PREVIEW_MIME_TYPE, PREVIEW_QUALITY));
      if (!fallback.size) throw new Error('empty JPEG fallback');
      finish(() => resolve(fallback));
    } catch {
      finish(() => reject(new Error('PDF preview image encoding timed out')));
    }
  }, isConstrainedBrowser() ? 8_000 : 15_000);

  canvas.toBlob((blob) => {
    if (!blob || blob.size <= 0) {
      finish(() => reject(new Error('PDF preview canvas produced an empty image blob')));
      return;
    }
    if (blob.type !== PREVIEW_MIME_TYPE) {
      finish(() => reject(new Error(`PDF preview canvas produced ${blob.type || 'an unknown type'} instead of ${PREVIEW_MIME_TYPE}`)));
      return;
    }
    finish(() => resolve(blob));
  }, PREVIEW_MIME_TYPE, PREVIEW_QUALITY);
});

export async function renderPdfToDataUrl(
  file: File,
  opts: PdfRenderOptions = {},
): Promise<PdfPreviewResult> {
  if (!isPdfFile(file)) throw new Error(`Not a PDF file: ${file.type || file.name}`);
  if (file.size === 0) throw new Error('PDF file is empty');

  throwIfAborted(opts.signal);

  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
  let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  let page: pdfjsLib.PDFPageProxy | null = null;
  let renderTask: pdfjsLib.RenderTask | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let abortHandler: (() => void) | null = null;
  let renderTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  try {
    const bytes = await file.arrayBuffer();
    throwIfAborted(opts.signal);

    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    const cancelWork = () => {
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
    abortHandler = cancelWork;
    opts.signal?.addEventListener('abort', abortHandler, { once: true });

    const timeoutMs = opts.timeoutMs ?? (isConstrainedBrowser() ? CONSTRAINED_DEVICE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    renderTimeoutId = setTimeout(() => {
      timedOut = true;
      cancelWork();
    }, timeoutMs);

    pdfDocument = await loadingTask.promise;
    throwIfAborted(opts.signal);

    if (!pdfDocument.numPages || pdfDocument.numPages < 1) throw new Error('PDF has no pages');

    const pageNumber = opts.pageNumber ?? 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(`PDF page ${pageNumber} is outside the document range 1-${pdfDocument.numPages}`);
    }

    page = await pdfDocument.getPage(pageNumber);
    throwIfAborted(opts.signal);

    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport.width || !baseViewport.height) throw new Error('PDF page has invalid dimensions');

    const viewportScale = computeViewportScale(baseViewport.width, baseViewport.height, opts);
    const viewport = page.getViewport({ scale: viewportScale });

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not create a canvas context for PDF preview');

    // Keep transparent PDF regions white before encoding to JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    renderTask = page.render({ canvasContext: context, viewport });
    await renderTask.promise;
    throwIfAborted(opts.signal);

    const width = canvas.width;
    const height = canvas.height;
    const blob = await canvasToPreviewBlob(canvas);
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
    if (timedOut) throw new Error('PDF preview timed out on this device. Please try the upload again.');

    const passwordMessage = getPasswordMessage(error);
    if (passwordMessage) throw new Error(passwordMessage);
    if ((error as { name?: string })?.name === 'RenderingCancelledException') {
      throw new Error('PDF rendering aborted');
    }
    throw error;
  } finally {
    if (renderTimeoutId) clearTimeout(renderTimeoutId);
    if (abortHandler) opts.signal?.removeEventListener('abort', abortHandler);
    renderTask = null;
    try { page?.cleanup(); } catch { /* no-op */ }
    try { await pdfDocument?.destroy(); } catch { /* no-op */ }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
