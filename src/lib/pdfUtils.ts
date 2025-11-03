import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - use the version-specific CDN URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs`;

export interface PDFPreview {
  imageUrl: string;
  width: number;
  height: number;
}

/**
 * Convert the first page of a PDF to an image data URL
 * @param pdfUrl - URL or blob URL of the PDF file
 * @param scale - Scale factor for rendering (default: 2 for good quality)
 * @returns Promise with image data URL and dimensions
 */
export async function convertPDFToImage(pdfUrl: string, scale: number = 2): Promise<PDFPreview> {
  try {
    console.log('[PDF Utils] Loading PDF from:', pdfUrl.substring(0, 50) + '...');
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    
    console.log('[PDF Utils] PDF loaded, pages:', pdf.numPages);
    
    // Get the first page
    const page = await pdf.getPage(1);
    
    // Get viewport at desired scale
    const viewport = page.getViewport({ scale });
    
    console.log('[PDF Utils] Page viewport:', viewport.width, 'x', viewport.height);
    
    // Create canvas to render PDF page
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
    
    console.log('[PDF Utils] PDF page rendered to canvas');
    
    // Convert canvas to data URL
    const imageUrl = canvas.toDataURL('image/png');
    
    console.log('[PDF Utils] Converted to image URL:', imageUrl.substring(0, 50) + '...');
    
    return {
      imageUrl,
      width: viewport.width / scale, // Return actual dimensions at scale 1
      height: viewport.height / scale,
    };
  } catch (error) {
    console.error('[PDF Utils] Error converting PDF to image:', error);
    throw error;
  }
}
