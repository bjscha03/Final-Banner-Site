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
  try {
    console.log('PDF rendering started:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    if (file.type !== 'application/pdf') {
      throw new Error(`Invalid file type: ${file.type}. Expected application/pdf.`);
    }

    if (file.size === 0) {
      throw new Error('PDF file is empty');
    }

    // Use a more conservative scale for banner-sized PDFs to avoid memory issues
    const scale = Math.max(0.1, Math.min(2.0, opts.scale ?? 1));
    const deviceScale = Math.max(1, Math.floor(opts.deviceScale ?? (globalThis.window?.devicePixelRatio ?? 1)));

    // Lazy import pdfjs and set worker
    if (!_pdfjsLib) {
      console.log('Loading PDF.js library...');
      _pdfjsLib = await import('pdfjs-dist');
      // Set worker source to match the installed version (5.4.149)
      (_pdfjsLib as any).GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.js";
      console.log('PDF.js library loaded successfully');
    }

    console.log('Reading PDF file...');
    const arrayBuffer = await file.arrayBuffer();
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (arrayBuffer.byteLength === 0) {
      throw new Error('PDF file contains no data');
    }

    console.log('PDF file read successfully, size:', arrayBuffer.byteLength, 'bytes');

    console.log('Loading PDF document...');
    const loadingTask = (_pdfjsLib as any).getDocument({
      data: arrayBuffer,
      // Add more robust PDF parsing options
      verbosity: 0, // Reduce console spam
      isEvalSupported: false, // Disable eval for security
      disableFontFace: false, // Allow font rendering
      useSystemFonts: true, // Use system fonts as fallback
    });

    const pdf = await loadingTask.promise;
    console.log('PDF document loaded, pages:', pdf.numPages);

    if (pdf.numPages === 0) {
      throw new Error('PDF file contains no pages');
    }

    console.log('Getting first page...');
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: scale * deviceScale });
    console.log('PDF viewport:', {
      width: viewport.width,
      height: viewport.height,
      scale: scale * deviceScale
    });

    // Limit canvas size to prevent memory issues with large banner PDFs
    const maxCanvasSize = 4096; // 4K max dimension
    let finalScale = scale * deviceScale;

    if (viewport.width > maxCanvasSize || viewport.height > maxCanvasSize) {
      const scaleDown = Math.min(maxCanvasSize / viewport.width, maxCanvasSize / viewport.height);
      finalScale = finalScale * scaleDown;
      console.log('Scaling down large PDF, new scale:', finalScale);
    }

    const finalViewport = page.getViewport({ scale: finalScale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    if (!ctx) {
      throw new Error('Failed to create canvas rendering context');
    }

    canvas.width = Math.floor(finalViewport.width);
    canvas.height = Math.floor(finalViewport.height);

    console.log('Canvas created:', { width: canvas.width, height: canvas.height });

    console.log('Rendering PDF to canvas...');
    const renderTask = page.render({ canvasContext: ctx as any, viewport: finalViewport });
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        console.log('PDF rendering aborted by signal');
        renderTask.cancel();
      }, { once: true });
    }
    await renderTask.promise;
    console.log('PDF rendered to canvas successfully');

    console.log('Converting canvas to data URL...');
    const dataUrl = canvas.toDataURL('image/png', 0.92);

    if (!dataUrl || dataUrl === 'data:,') {
      throw new Error('Failed to generate PDF preview image');
    }

    console.log('PDF preview generated successfully, data URL length:', dataUrl.length);

    // Clean up
    await pdf.destroy();
    return dataUrl;
  } catch (error) {
    console.error('PDF rendering error:', error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF structure') || error.message.includes('Invalid PDF')) {
        throw new Error('PDF file is corrupted or invalid');
      }
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('PDF file is password protected');
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('Network error loading PDF worker');
      }
      if (error.message.includes('Aborted')) {
        throw new Error('PDF rendering was cancelled');
      }
      if (error.message.includes('memory') || error.message.includes('out of memory')) {
        throw new Error('PDF file is too large to render');
      }
      // Re-throw with original message if it's already descriptive
      throw error;
    }
    throw new Error('Unknown error rendering PDF preview');
  }
}
