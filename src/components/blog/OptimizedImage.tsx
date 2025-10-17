/**
 * Optimized Image Component with Cloudinary Support
 */

import React, { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

function getCloudinaryUrl(
  url: string,
  options: { width?: number; height?: number; quality?: string; format?: string }
): string {
  if (!url.includes('cloudinary.com')) {
    return url;
  }
  
  const { width, height, quality = 'auto', format = 'auto' } = options;
  
  const transformations = [
    `f_${format}`,
    `q_${quality}`,
    width ? `w_${width}` : null,
    height ? `h_${height}` : null,
    'c_fit',
    'dpr_auto',
  ].filter(Boolean).join(',');
  
  return url.replace('/upload/', `/upload/${transformations}/`);
}

function getLQIPUrl(url: string): string {
  if (!url.includes('cloudinary.com')) {
    return url;
  }
  
  return url.replace('/upload/', '/upload/e_blur:2000,q_10,w_40/');
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  
  const optimizedSrc = getCloudinaryUrl(src, { width, height });
  const lqipSrc = getLQIPUrl(src);
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* LQIP (Low Quality Image Placeholder) */}
      {!isLoaded && (
        <img
          src={lqipSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-sm"
          aria-hidden="true"
        />
      )}
      
      {/* Main Image */}
      <img
        src={optimizedSrc}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        onLoad={() => setIsLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
