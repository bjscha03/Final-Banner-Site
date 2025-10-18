/**
 * Print Pipeline Feature Flag Utilities
 * 
 * Centralized feature flag checking for the print pipeline.
 */

/**
 * Check if print pipeline is enabled
 */
export function isPrintPipelineEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_PRINT_PIPELINE === 'true';
}

/**
 * Get print pipeline configuration
 */
export function getPrintPipelineConfig() {
  return {
    enabled: isPrintPipelineEnabled(),
    defaultDpi: parseInt(import.meta.env.VITE_PRINT_DEFAULT_DPI || '150', 10),
    bleedInches: parseFloat(import.meta.env.VITE_PRINT_BLEED_IN || '0.25'),
    colorSpace: import.meta.env.VITE_PRINT_COLOR_SPACE || 'srgb',
    format: import.meta.env.VITE_PRINT_FORMAT || 'png',
  };
}
