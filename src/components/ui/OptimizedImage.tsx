/**
 * OptimizedImage Component
 * 
 * Simple wrapper for Cloudinary image optimization
 */

import React from 'react';

export interface CloudinaryOptions {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
  dpr?: string;
}

export interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
}

/**
 * Get optimized Cloudinary URL with transformations
 */
export function getOptimizedCloudinaryUrl(
  url: string,
  options: CloudinaryOptions = {}
): string {
  // Only optimize Cloudinary URLs
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  const { width = 1600, height, quality = 'auto', format = 'auto', dpr = 'auto' } = options;
  
  // Build transformation string
  const transformations = [
    `f_${format}`,
    `q_${quality}`,
    width ? `w_${width}` : null,
    height ? `h_${height}` : null,
    width && !height ? 'c_fit' : null,
    `dpr_${dpr}`,
  ].filter(Boolean).join(',');
  
  // Insert transformations into URL
  return url.replace('/upload/', `/upload/${transformations}/`);
}

/**
 * OptimizedImage Component
 * 
 * Automatically applies Cloudinary optimizations to images
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  quality = 'auto',
  format = 'auto',
  ...props
}) => {
  const optimizedSrc = getOptimizedCloudinaryUrl(src, { width, height, quality, format });
  
  return (
    <img
      src={optimizedSrc}
      alt={alt}
      className={className}
      loading="lazy"
      {...props}
    />
  );
};

export default OptimizedImage;
