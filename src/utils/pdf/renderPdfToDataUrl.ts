// renderPdfToDataUrl.ts - Robust PDF rendering with multiple fallback strategies
// Renders page 1 of a PDF File to a data URL for <img src="...">

import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

let _pdfjsLib: typeof import('pdfjs-dist') | null = null;

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
      console.log('PDF.js library loaded successfully');
    }

    console.log('Reading PDF file...');
    // Read file once to get the raw data
    const fileData = await file.arrayBuffer();
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (fileData.byteLength === 0) {
      throw new Error('PDF file contains no data');
    }

    console.log('PDF file read successfully, size:', fileData.byteLength, 'bytes');

    // Define multiple parsing strategies in order of preference
    // Each strategy gets a fresh copy of the ArrayBuffer to avoid detachment issues
    const strategies = [
      {
        name: 'Ultra Permissive',
        getConfig: () => ({
          data: fileData.slice(), // Create fresh copy
          verbosity: 0,
          isEvalSupported: true, // Allow eval for maximum compatibility
          disableFontFace: true, // Disable font rendering to avoid font issues
          useSystemFonts: false, // Don't use system fonts
          stopAtErrors: false,
          maxImageSize: -1, // No image size limit
          disableAutoFetch: true, // Disable auto-fetch
          disableStream: true, // Disable streaming
          disableRange: true, // Disable range requests
          ignoreErrors: true,
          useWorkerFetch: false,
          isOffscreenCanvasSupported: false,
        })
      },
      {
        name: 'No Streaming',
        getConfig: () => ({
          data: fileData.slice(), // Create fresh copy
          verbosity: 0,
          disableStream: true,
          disableRange: true,
          disableAutoFetch: true,
          ignoreErrors: true,
          stopAtErrors: false,
          isEvalSupported: false,
          disableFontFace: true,
          useSystemFonts: false,
        })
      },
      {
        name: 'Minimal Features',
        getConfig: () => ({
          data: fileData.slice(), // Create fresh copy
          verbosity: 0,
          isEvalSupported: false,
          disableFontFace: true,
          useSystemFonts: false,
          stopAtErrors: false,
          ignoreErrors: true,
          disableAutoFetch: true,
          disableStream: true,
          disableRange: true,
          useWorkerFetch: false,
        })
      }
    ];

    let pdf = null;
    let lastError = null;

    // Try each strategy until one works
    for (const strategy of strategies) {
      try {
        console.log(`Attempting PDF parsing with ${strategy.name} strategy...`);
        const config = strategy.getConfig(); // Get fresh config with new ArrayBuffer
        const loadingTask = (_pdfjsLib as any).getDocument(config);
        pdf = await loadingTask.promise;
        console.log(`✅ ${strategy.name} strategy succeeded!`);
        break;
      } catch (error) {
        console.warn(`${strategy.name} strategy failed:`, error);
        lastError = error;
        continue;
      }
    }

    if (!pdf) {
      throw lastError || new Error('All PDF parsing strategies failed');
    }

    console.log('PDF document loaded, pages:', pdf.numPages);

    if (pdf.numPages === 0) {
      throw new Error('PDF file contains no pages');
    }

    console.log('Getting first page...');
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: scale * deviceScale });

    console.log('PDF bitmap conversion started:', {
      scale,
      deviceScale,
      viewport: { width: viewport.width, height: viewport.height }
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    console.log('PDF rendering started...');
    await page.render({ canvasContext: context, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    console.log('PDF bitmap conversion completed:', {
      dataUrlLength: dataUrl.length,
      canvasSize: `${canvas.width}x${canvas.height}`
    });

    // Clean up
    await pdf.destroy();

    return dataUrl;

  } catch (error) {
    console.error('PDF rendering error:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('InvalidPDFException') || error.message.includes('Invalid PDF structure')) {
        throw new Error('PDF file format is not supported by this browser. Please try a different PDF or convert it to a standard format.');
      }
      if (error.message.includes('PasswordException')) {
        throw new Error('PDF file is password protected');
      }
      if (error.message.includes('memory') || error.message.includes('out of memory')) {
        throw new Error('PDF file is too large to render');
      }
      // Re-throw with original message if it's already descriptive
      throw error;
    }
    throw new Error('PDF file cannot be processed - may be corrupted, encrypted, or use unsupported features');
  }
}
