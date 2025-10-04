// loadPdfToBitmap.ts
// Enhanced PDF rendering utility for banner design applications
// Converts PDF to high-resolution bitmap with print-ready quality

import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

let _pdfjsLib: typeof import('pdfjs-dist') | null = null;

export interface PdfRenderOptions {
  bannerWidthInches: number;
  bannerHeightInches: number;
  targetDPI?: number;           // Default 200 DPI for print quality
  maxDimension?: number;        // Max pixel dimension to prevent memory issues
  pageNumber?: number;          // Which page to render (1-based), default 1
  signal?: AbortSignal;         // Allow cancellation
}

export interface PdfBitmapResult {
  blobUrl: string;              // ObjectURL for the rendered bitmap
  width: number;                // Pixel width of rendered image
  height: number;               // Pixel height of rendered image
  pageCount: number;            // Total pages in PDF
  actualDPI: number;            // Actual DPI achieved
}

// Calculate optimal pixel dimensions based on banner size and target DPI
function calculateOptimalDimensions(
  bannerWidthInches: number,
  bannerHeightInches: number,
  targetDPI: number,
  maxDimension: number
): { width: number; height: number; actualDPI: number } {
  const targetWidth = bannerWidthInches * targetDPI;
  const targetHeight = bannerHeightInches * targetDPI;
  
  // Check if we need to scale down due to max dimension limit
  const maxTargetDimension = Math.max(targetWidth, targetHeight);
  
  if (maxTargetDimension <= maxDimension) {
    return {
      width: Math.round(targetWidth),
      height: Math.round(targetHeight),
      actualDPI: targetDPI
    };
  }
  
  // Scale down proportionally
  const scaleFactor = maxDimension / maxTargetDimension;
  const actualDPI = targetDPI * scaleFactor;
  
  return {
    width: Math.round(targetWidth * scaleFactor),
    height: Math.round(targetHeight * scaleFactor),
    actualDPI
  };
}

// Render PDF page to canvas with white background
async function renderPdfPageToCanvas(
  page: any,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): Promise<void> {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas 2D context');
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Fill with white background (important for print)
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, targetWidth, targetHeight);

  const viewport = page.getViewport({ scale: 1 });
  const scaleX = targetWidth / viewport.width;
  const scaleY = targetHeight / viewport.height;
  const scale = Math.min(scaleX, scaleY); // Maintain aspect ratio

  const scaledViewport = page.getViewport({ scale });
  
  // Center the PDF content
  const offsetX = (targetWidth - scaledViewport.width) / 2;
  const offsetY = (targetHeight - scaledViewport.height) / 2;

  context.save();
  context.translate(offsetX, offsetY);

  const renderContext = {
    canvasContext: context,
    viewport: scaledViewport
  };

  await page.render(renderContext).promise;
  context.restore();
}

export async function loadPdfToBitmap(
  file: File,
  options: PdfRenderOptions
): Promise<PdfBitmapResult> {
  const {
    bannerWidthInches,
    bannerHeightInches,
    targetDPI = 200,
    maxDimension = 8000,
    pageNumber = 1,
    signal
  } = options;

  try {
    console.log('PDF bitmap conversion started:', {
      fileName: file.name,
      bannerSize: `${bannerWidthInches}" x ${bannerHeightInches}"`,
      targetDPI,
      maxDimension
    });

    if (file.type !== 'application/pdf') {
      throw new Error(`Invalid file type: ${file.type}. Expected application/pdf.`);
    }

    // Load PDF.js library dynamically
    if (!_pdfjsLib) {
      _pdfjsLib = await import('pdfjs-dist');
    }

    // Calculate optimal dimensions
    const dimensions = calculateOptimalDimensions(
      bannerWidthInches,
      bannerHeightInches,
      targetDPI,
      maxDimension
    );

    console.log('Calculated dimensions:', dimensions);

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    if (signal?.aborted) {
      throw new Error('PDF processing was cancelled');
    }

    // Load PDF document
    const loadingTask = _pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true
    });

    const pdf = await loadingTask.promise;
    
    if (signal?.aborted) {
      throw new Error('PDF processing was cancelled');
    }

    // Validate page number
    const pageCount = pdf.numPages;
    const actualPageNumber = Math.min(Math.max(1, pageNumber), pageCount);

    // Get the specified page
    const page = await pdf.getPage(actualPageNumber);
    
    if (signal?.aborted) {
      throw new Error('PDF processing was cancelled');
    }

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    
    // Render PDF to canvas
    await renderPdfPageToCanvas(
      page,
      canvas,
      dimensions.width,
      dimensions.height
    );

    if (signal?.aborted) {
      throw new Error('PDF processing was cancelled');
    }

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png', 1.0);
    });

    // Create object URL
    const blobUrl = URL.createObjectURL(blob);

    console.log('PDF bitmap conversion completed:', {
      dimensions,
      pageCount,
      actualPageNumber,
      blobSize: blob.size
    });

    return {
      blobUrl,
      width: dimensions.width,
      height: dimensions.height,
      pageCount,
      actualDPI: dimensions.actualDPI
    };

  } catch (error) {
    console.error('PDF bitmap conversion failed:', error);
    throw error;
  }
}
