/**
 * Cloudinary Print URL Builder
 * 
 * Generates lossless, color-managed URLs for print-ready assets.
 * NO auto-optimization - exact pixels, sRGB color space, PNG format.
 */

interface PrintOptions {
  widthInches: number;
  heightInches: number;
  dpi?: number;
  colorSpace?: 'srgb' | 'cmyk';
  format?: 'png' | 'tiff';
  crop?: 'fill' | 'fit' | 'limit';
  gravity?: string;
}

interface PrintAssetInfo {
  url: string;
  widthPixels: number;
  heightPixels: number;
  effectiveDPI: number;
  colorSpace: string;
  format: string;
}

interface QualityResult {
  pass: boolean;
  effectiveDPI: number;
  status: 'excellent' | 'acceptable' | 'warning' | 'fail';
  message: string;
}

/**
 * Build a print-quality URL
 */
export function buildPrintUrl(
  publicId: string,
  options: PrintOptions
): PrintAssetInfo {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  
  if (!cloudName) {
    console.warn('VITE_CLOUDINARY_CLOUD_NAME not set');
    return {
      url: '',
      widthPixels: 0,
      heightPixels: 0,
      effectiveDPI: 0,
      colorSpace: 'unknown',
      format: 'unknown',
    };
  }

  const {
    widthInches,
    heightInches,
    dpi = 150,
    colorSpace = 'srgb',
    format = 'png',
    crop = 'fill',
    gravity = 'center',
  } = options;

  // Calculate exact pixel dimensions
  const widthPixels = Math.round(widthInches * dpi);
  const heightPixels = Math.round(heightInches * dpi);

  const transformations: string[] = [];

  // Exact dimensions
  transformations.push(`w_${widthPixels}`);
  transformations.push(`h_${heightPixels}`);
  transformations.push(`c_${crop}`);
  transformations.push(`g_${gravity}`);

  // Color space
  transformations.push(`cs_${colorSpace}`);

  // Lossless format
  transformations.push(`f_${format}`);

  // NO q_auto - we want maximum quality
  // NO dpr_auto - we want exact pixels

  const transformString = transformations.join(',');

  const url = `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${publicId}`;

  return {
    url,
    widthPixels,
    heightPixels,
    effectiveDPI: dpi,
    colorSpace,
    format,
  };
}

/**
 * Calculate effective DPI from pixel dimensions and physical size
 */
export function calculateEffectiveDPI(
  widthPixels: number,
  heightPixels: number,
  widthInches: number,
  heightInches: number
): number {
  const dpiWidth = widthPixels / widthInches;
  const dpiHeight = heightPixels / heightInches;
  
  // Return the minimum DPI (most conservative)
  return Math.min(dpiWidth, dpiHeight);
}

/**
 * Check if an image meets print quality standards
 */
export function checkPrintQuality(
  widthPixels: number,
  heightPixels: number,
  widthInches: number,
  heightInches: number,
  minDPI: number = 100
): QualityResult {
  const effectiveDPI = calculateEffectiveDPI(
    widthPixels,
    heightPixels,
    widthInches,
    heightInches
  );

  if (effectiveDPI >= 150) {
    return {
      pass: true,
      effectiveDPI,
      status: 'excellent',
      message: `Excellent print quality (${Math.round(effectiveDPI)} DPI)`,
    };
  } else if (effectiveDPI >= 100) {
    return {
      pass: true,
      effectiveDPI,
      status: 'acceptable',
      message: `Acceptable print quality (${Math.round(effectiveDPI)} DPI)`,
    };
  } else if (effectiveDPI >= 80) {
    return {
      pass: false,
      effectiveDPI,
      status: 'warning',
      message: `May show pixelation (${Math.round(effectiveDPI)} DPI)`,
    };
  } else {
    return {
      pass: false,
      effectiveDPI,
      status: 'fail',
      message: `Insufficient resolution (${Math.round(effectiveDPI)} DPI)`,
    };
  }
}

/**
 * Check if a URL is a print-quality URL
 */
export function isPrintQualityUrl(url: string): boolean {
  return (
    url.includes('cs_srgb') &&
    url.includes('f_png') &&
    !url.includes('q_auto') &&
    !url.includes('dpr_auto')
  );
}

/**
 * Get recommended DPI based on banner size
 */
export function getRecommendedDPI(widthInches: number, heightInches: number): number {
  const area = widthInches * heightInches;
  
  // Larger banners can use lower DPI (viewed from farther away)
  if (area > 100) return 100; // Large banners (e.g., 10' x 10')
  if (area > 50) return 120;  // Medium banners (e.g., 6' x 8')
  return 150;                 // Small banners (e.g., 2' x 4')
}
