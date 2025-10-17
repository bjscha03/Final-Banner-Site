/**
 * Cloudinary Image Optimization Utilities
 * 
 * Provides functions to generate optimized Cloudinary URLs with:
 * - Automatic format selection (AVIF/WebP/JPEG)
 * - Automatic quality optimization
 * - Responsive image sizing with srcset
 * - Low-Quality Image Placeholders (LQIP) for blur-up effect
 * - DPR (Device Pixel Ratio) awareness
 * 
 * IMPORTANT: These transformations are for PREVIEW ONLY.
 * Print-ready originals remain untouched and use signed/direct URLs.
 */

export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  crop?: 'fit' | 'fill' | 'scale' | 'limit' | 'pad';
  quality?: 'auto' | 'auto:best' | 'auto:good' | 'auto:eco' | 'auto:low' | number;
  format?: 'auto' | 'jpg' | 'png' | 'webp' | 'avif';
  dpr?: 'auto' | number;
  gravity?: 'auto' | 'center' | 'face' | 'faces';
  background?: string;
}

export interface ResponsiveBreakpoint {
  width: number;
  maxWidth?: string; // CSS max-width for sizes attribute
}

// Standard responsive breakpoints for banner previews
export const RESPONSIVE_BREAKPOINTS: ResponsiveBreakpoint[] = [
  { width: 360, maxWidth: '480px' },
  { width: 640, maxWidth: '768px' },
  { width: 960, maxWidth: '1024px' },
  { width: 1280, maxWidth: '1440px' },
  { width: 1920 },
];

// Thumbnail breakpoints (smaller sizes)
export const THUMBNAIL_BREAKPOINTS: ResponsiveBreakpoint[] = [
  { width: 96 },   // Mobile
  { width: 128 },  // Tablet
  { width: 160 },  // Desktop
];

/**
 * Extract Cloudinary public ID from a Cloudinary URL
 */
export function extractPublicId(cloudinaryUrl: string): string | null {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('cloudinary.com')) {
    return null;
  }

  try {
    const url = new URL(cloudinaryUrl);
    const pathParts = url.pathname.split('/');
    const uploadIndex = pathParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1 || uploadIndex === pathParts.length - 1) {
      return null;
    }

    // Get everything after 'upload' and any transformation parameters
    const afterUpload = pathParts.slice(uploadIndex + 1);
    
    // Skip transformation parameters (they start with letters like 'f_', 'q_', 'w_', etc.)
    const publicIdParts = afterUpload.filter(part => !part.match(/^[a-z]_/));
    
    // Join and remove file extension
    const publicIdWithExt = publicIdParts.join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public ID from Cloudinary URL:', error);
    return null;
  }
}

/**
 * Get the base Cloudinary URL (everything before the public ID)
 */
export function getCloudinaryBaseUrl(cloudinaryUrl: string): string | null {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('cloudinary.com')) {
    return null;
  }

  try {
    const url = new URL(cloudinaryUrl);
    const pathParts = url.pathname.split('/');
    const uploadIndex = pathParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) {
      return null;
    }

    const basePath = pathParts.slice(0, uploadIndex + 1).join('/');
    return `${url.protocol}//${url.host}${basePath}`;
  } catch (error) {
    console.error('Error getting Cloudinary base URL:', error);
    return null;
  }
}

/**
 * Build transformation string from options
 */
export function buildTransformationString(options: CloudinaryTransformOptions): string {
  const parts: string[] = [];

  // Format (f_auto for automatic format selection)
  if (options.format) {
    parts.push(`f_${options.format}`);
  } else {
    parts.push('f_auto');
  }

  // Quality (q_auto for automatic quality)
  if (options.quality) {
    parts.push(`q_${options.quality}`);
  } else {
    parts.push('q_auto');
  }

  // Width
  if (options.width) {
    parts.push(`w_${options.width}`);
  }

  // Height
  if (options.height) {
    parts.push(`h_${options.height}`);
  }

  // Crop mode (default: fit to preserve aspect ratio)
  if (options.crop) {
    parts.push(`c_${options.crop}`);
  } else if (options.width || options.height) {
    parts.push('c_fit');
  }

  // DPR (Device Pixel Ratio)
  if (options.dpr) {
    parts.push(`dpr_${options.dpr}`);
  }

  // Gravity (for cropping)
  if (options.gravity) {
    parts.push(`g_${options.gravity}`);
  }

  // Background (for padding)
  if (options.background) {
    parts.push(`b_${options.background}`);
  }

  return parts.join(',');
}

/**
 * Generate optimized Cloudinary URL for preview images
 */
export function getOptimizedUrl(
  originalUrl: string,
  options: CloudinaryTransformOptions = {}
): string {
  // If not a Cloudinary URL, return as-is
  if (!originalUrl || !originalUrl.includes('cloudinary.com')) {
    return originalUrl;
  }

  // Don't transform SVG files
  if (originalUrl.toLowerCase().endsWith('.svg')) {
    return originalUrl;
  }

  const baseUrl = getCloudinaryBaseUrl(originalUrl);
  const publicId = extractPublicId(originalUrl);

  if (!baseUrl || !publicId) {
    console.warn('Could not parse Cloudinary URL:', originalUrl);
    return originalUrl;
  }

  const transformation = buildTransformationString(options);
  
  // Get file extension from original URL or default to jpg
  const extension = originalUrl.match(/\.(jpg|jpeg|png|webp|avif)$/i)?.[1] || 'jpg';
  
  return `${baseUrl}/${transformation}/${publicId}.${extension}`;
}

/**
 * Generate LQIP (Low-Quality Image Placeholder) URL for blur-up effect
 */
export function getLQIPUrl(originalUrl: string): string {
  return getOptimizedUrl(originalUrl, {
    width: 40,
    quality: 10,
    format: 'auto',
  });
}

/**
 * Generate srcset string for responsive images
 */
export function generateSrcSet(
  originalUrl: string,
  breakpoints: ResponsiveBreakpoint[] = RESPONSIVE_BREAKPOINTS,
  options: Omit<CloudinaryTransformOptions, 'width'> = {}
): string {
  if (!originalUrl || !originalUrl.includes('cloudinary.com')) {
    return '';
  }

  return breakpoints
    .map(bp => {
      const url = getOptimizedUrl(originalUrl, {
        ...options,
        width: bp.width,
        dpr: 'auto',
      });
      return `${url} ${bp.width}w`;
    })
    .join(', ');
}

/**
 * Generate sizes attribute for responsive images
 */
export function generateSizes(
  breakpoints: ResponsiveBreakpoint[] = RESPONSIVE_BREAKPOINTS,
  defaultSize: string = '100vw'
): string {
  const sizeRules = breakpoints
    .filter(bp => bp.maxWidth)
    .map(bp => `(max-width: ${bp.maxWidth}) ${bp.width}px`);
  
  sizeRules.push(defaultSize);
  
  return sizeRules.join(', ');
}

/**
 * Get optimized thumbnail URL
 */
export function getThumbnailUrl(
  originalUrl: string,
  width: number = 400,
  height: number = 250
): string {
  return getOptimizedUrl(originalUrl, {
    width,
    height,
    crop: 'fit',
    quality: 'auto',
    format: 'auto',
    dpr: 'auto',
  });
}

/**
 * Get optimized banner preview URL (capped at 1600px for performance)
 */
export function getBannerPreviewUrl(
  originalUrl: string,
  maxWidth: number = 1600
): string {
  return getOptimizedUrl(originalUrl, {
    width: maxWidth,
    crop: 'fit',
    quality: 'auto',
    format: 'auto',
    dpr: 'auto',
  });
}

/**
 * Check if a URL is a Cloudinary URL
 */
export function isCloudinaryUrl(url: string): boolean {
  return url && url.includes('cloudinary.com');
}

/**
 * Get print-ready URL (original, untransformed)
 * This ensures we never apply preview optimizations to print downloads
 */
export function getPrintReadyUrl(originalUrl: string): string {
  // Return the original URL without any transformations
  // This is used for PDF generation and downloads
  return originalUrl;
}
