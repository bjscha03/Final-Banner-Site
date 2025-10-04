// renderPdfToDataUrl.ts - Simple PDF placeholder generator
// Creates a visual placeholder for PDF files instead of trying to parse them

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

    console.log('Creating PDF placeholder preview...');
    
    // Create canvas for PDF placeholder
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    
    const scale = opts.scale ?? 1;
    const deviceScale = opts.deviceScale ?? 1;
    
    // Set canvas size (banner proportions)
    canvas.width = 800 * scale * deviceScale;
    canvas.height = 400 * scale * deviceScale;
    
    // Scale context for high DPI
    context.scale(deviceScale, deviceScale);
    
    // Fill with white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width / deviceScale, canvas.height / deviceScale);
    
    // Add subtle border
    context.strokeStyle = '#e5e7eb';
    context.lineWidth = 2;
    context.strokeRect(1, 1, (canvas.width / deviceScale) - 2, (canvas.height / deviceScale) - 2);
    
    // Add PDF icon background
    const iconSize = 80 * scale;
    const iconX = (canvas.width / deviceScale) / 2 - iconSize / 2;
    const iconY = (canvas.height / deviceScale) / 2 - iconSize / 2 - 30 * scale;
    
    context.fillStyle = '#fee2e2';
    context.fillRect(iconX, iconY, iconSize, iconSize);
    
    // Add PDF icon
    context.fillStyle = '#dc2626';
    context.font = `${40 * scale}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.fillText('PDF', (canvas.width / deviceScale) / 2, iconY + iconSize / 2 + 15 * scale);
    
    // Add file name
    context.fillStyle = '#374151';
    context.font = `${14 * scale}px Arial, sans-serif`;
    context.textAlign = 'center';
    
    // Truncate long file names
    let displayName = file.name;
    if (displayName.length > 30) {
      displayName = displayName.substring(0, 27) + '...';
    }
    
    context.fillText(displayName, (canvas.width / deviceScale) / 2, iconY + iconSize + 30 * scale);
    
    // Add file size
    const fileSizeKB = Math.round(file.size / 1024);
    const fileSizeText = fileSizeKB > 1024 ? 
      `${(fileSizeKB / 1024).toFixed(1)} MB` : 
      `${fileSizeKB} KB`;
    
    context.fillStyle = '#6b7280';
    context.font = `${12 * scale}px Arial, sans-serif`;
    context.fillText(`PDF • ${fileSizeText}`, (canvas.width / deviceScale) / 2, iconY + iconSize + 50 * scale);
    
    const dataUrl = canvas.toDataURL('image/png', 0.95);
    
    console.log('✅ PDF placeholder generated successfully');
    
    return dataUrl;

  } catch (error) {
    console.error('PDF placeholder error:', error);
    throw error;
  }
}
