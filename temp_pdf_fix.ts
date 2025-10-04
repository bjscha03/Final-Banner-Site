// loadPdfToBitmap.ts
// Enhanced PDF rendering utility for banner design applications
// Converts PDF to high-resolution bitmap with print-ready quality and optimized file size

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
  compressionQuality?: number;  // JPEG compression quality (0.1-1.0), default 0.85
  maxUploadSize?: number;       // Max file size for upload in bytes, default 50MB
}

export interface PdfBitmapResult {
  blobUrl: string;              // ObjectURL for the rendered bitmap
  width: number;                // Pixel width of rendered image
  height: number;               // Pixel height of rendered image
  pageCount: number;            // Total pages in PDF
  actualDPI: number;            // Actual DPI achieved
  fileSize: number;             // Final file size in bytes
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

// Convert canvas to optimized blob with size constraints
async function canvasToOptimizedBlob(
  canvas: HTMLCanvasElement,
  maxUploadSize: number,
  compressionQuality: number
): Promise<{ blob: Blob; fileSize: number }> {
  // Try JPEG first for better compression
  let blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to JPEG blob'));
      }
    }, 'image/jpeg', compressionQuality);
  });

  console.log(`Initial JPEG blob size: ${blob.size} bytes (${Math.round(blob.size / 1024 / 1024 * 100) / 100}MB)`);

  // If still too large, try with lower quality
  if (blob.size > maxUploadSize && compressionQuality > 0.3) {
    const lowerQuality = Math.max(0.3, compressionQuality - 0.2);
    console.log(`File too large, trying lower quality: ${lowerQuality}`);
    
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to lower quality JPEG blob'));
        }
      }, 'image/jpeg', lowerQuality);
    });
    
    console.log(`Lower quality JPEG blob size: ${blob.size} bytes (${Math.round(blob.size / 1024 / 1024 * 100) / 100}MB)`);
  }

  // If still too large, scale down the canvas
  if (blob.size > maxUploadSize) {
    console.log('File still too large, scaling down canvas...');
    const scaleFactor = Math.sqrt(maxUploadSize / blob.size * 0.8); // 80% of target to be safe
    const newWidth = Math.round(canvas.width * scaleFactor);
    const newHeight = Math.round(canvas.height * scaleFactor);
    
    const scaledCanvas = document.createElement('canvas');
    const scaledContext = scaledCanvas.getContext('2d');
    if (!scaledContext) {
      throw new Error('Could not get scaled canvas 2D context');
    }
    
    scaledCanvas.width = newWidth;
    scaledCanvas.height = newHeight;
    
    // Fill with white background
    scaledContext.fillStyle = '#FFFFFF';
    scaledContext.fillRect(0, 0, newWidth, newHeight);
    
    // Draw scaled image
    scaledContext.drawImage(canvas, 0, 0, newWidth, newHeight);
    
    blob = await new Promise<Blob>((resolve, reject) => {
      scaledCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert scaled canvas to blob'));
        }
      }, 'image/jpeg', compressionQuality);
    });
    
    console.log(`Scaled JPEG blob size: ${blob.size} bytes (${Math.round(blob.size / 1024 / 1024 * 100) / 100}MB)`);
  }

  return { blob, fileSize: blob.size };
}

export async function loadPdfToBitmap(
  file: File,
  options: PdfRenderOptions
): Promise<PdfBitmapResult> {
  const {
    bannerWidthInches,
    bannerHeightInches,
    targetDPI = 200,
    maxDimension = 6000, // Reduced from 8000 to help with file size
    pageNumber = 1,
    signal,
    compressionQuality = 0.85, // Good balance of quality vs size
    maxUploadSize = 50 * 1024 * 1024 // 50MB max for upload
  } = options;

  try {
    console.log('PDF bitmap conversion started:', {
      fileName: file.name,
      bannerSize: `${bannerWidthInches}" x ${bannerHeightInches}"`,
      targetDPI,
      maxDimension,
      maxUploadSize: `${Math.round(maxUploadSize / 1024 / 1024)}MB`
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

    // Convert canvas to optimized blob
    const { blob, fileSize } = await canvasToOptimizedBlob(
      canvas,
      maxUploadSize,
      compressionQuality
    );

    // Create object URL
    const blobUrl = URL.createObjectURL(blob);

    console.log('PDF bitmap conversion completed:', {
      dimensions,
      pageCount,
      actualPageNumber,
      finalFileSize: `${Math.round(fileSize / 1024 / 1024 * 100) / 100}MB`,
      compressionUsed: blob.type
    });

    return {
      blobUrl,
      width: dimensions.width,
      height: dimensions.height,
      pageCount,
      actualDPI: dimensions.actualDPI,
      fileSize
    };

  } catch (error) {
    console.error('PDF bitmap conversion failed:', error);
    throw error;
  }
}
