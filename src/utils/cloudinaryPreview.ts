/**
 * Cloudinary Preview URL Builder
 * 
 * Generates optimized Cloudinary URLs for web preview/display.
 * Uses auto-optimization for fast loading and responsive images.
 */

interface PreviewOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'scale';
  gravity?: string;
  quality?: 'auto' | 'auto:best' | 'auto:good' | 'auto:eco' | 'auto:low';
  format?: 'auto';
  dpr?: 'auto' | number;
  colorCorrection?: boolean;
  isLogo?: boolean;
}

/**
 * Build a preview URL for web display
 */
export function buildPreviewUrl(
  publicId: string,
  options: PreviewOptions = {}
): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  
  if (!cloudName) {
    console.warn('VITE_CLOUDINARY_CLOUD_NAME not set');
    return '';
  }

  const {
    width,
    height,
    crop = 'limit',
    gravity,
    quality = 'auto',
    format = 'auto',
    dpr = 'auto',
    colorCorrection = false,
    isLogo = false,
  } = options;

  const transformations: string[] = [];

  // Color correction (only for photos, NOT logos)
  if (colorCorrection && !isLogo) {
    transformations.push('e_viesus_correct');
  }

  // Dimensions
  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (crop) transformations.push(`c_${crop}`);
  if (gravity) transformations.push(`g_${gravity}`);

  // Format and quality
  transformations.push(`f_${format}`);
  
  // For logos, skip q_auto to preserve sharpness
  if (!isLogo) {
    transformations.push(`q_${quality}`);
  }
  
  transformations.push(`dpr_${dpr}`);

  const transformString = transformations.join(',');

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${publicId}`;
}

/**
 * Build a thumbnail URL
 */
export function buildThumbnailUrl(
  publicId: string,
  size: number = 200,
  isLogo: boolean = false
): string {
  return buildPreviewUrl(publicId, {
    width: size,
    height: size,
    crop: 'fill',
    gravity: 'center',
    isLogo,
  });
}

/**
 * Build a srcset for responsive images
 */
export function buildSrcSet(
  publicId: string,
  widths: number[] = [400, 800, 1200, 1600],
  options: PreviewOptions = {}
): string {
  return widths
    .map(width => {
      const url = buildPreviewUrl(publicId, { ...options, width });
      return `${url} ${width}w`;
    })
    .join(', ');
}

/**
 * Check if a URL is using preview optimization
 */
export function isPreviewOptimized(url: string): boolean {
  return url.includes('f_auto') && url.includes('q_auto');
}

/**
 * Check if a URL is print quality (NOT optimized for web)
 */
export function isPrintQuality(url: string): boolean {
  return url.includes('f_png') && url.includes('cs_srgb') && !url.includes('q_auto');
}
