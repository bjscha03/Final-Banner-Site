/**
 * OptimizedImage Component
 * 
 * A reusable component for rendering optimized images via Cloudinary CDN.
 * 
 * Features:
 * - Automatic format selection (AVIF/WebP/JPEG)
 * - Automatic quality optimization
 * - Responsive srcset with multiple breakpoints
 * - Lazy loading with blur-up placeholder
 * - DPR (Device Pixel Ratio) awareness
 * - Proper SEO and accessibility attributes
 * - Performance tracking via data attributes
 * 
 * IMPORTANT: This component is for PREVIEW images only.
 * Print-ready originals use separate, untransformed URLs.
 */

import React, { useState, useEffect } from 'react';
import {
  isCloudinaryUrl,
  getOptimizedUrl,
  getLQIPUrl,
  generateSrcSet,
  generateSizes,
  RESPONSIVE_BREAKPOINTS,
  THUMBNAIL_BREAKPOINTS,
  type CloudinaryTransformOptions,
  type ResponsiveBreakpoint,
} from '@/lib/cloudinary-transforms';

export interface OptimizedImageProps {
  /** Image source URL (Cloudinary or regular URL) */
  src: string;
  
  /** Alt text for accessibility (required) */
  alt: string;
  
  /** Image width in pixels (for aspect ratio) */
  width?: number;
  
  /** Image height in pixels (for aspect ratio) */
  height?: number;
  
  /** CSS class name */
  className?: string;
  
  /** Whether to skip lazy loading (for above-the-fold images) */
  priority?: boolean;
  
  /** Image role for analytics tracking */
  role?: 'preview' | 'print' | 'thumbnail' | 'hero' | 'gallery';
  
  /** Custom Cloudinary transformation options */
  transformOptions?: CloudinaryTransformOptions;
  
  /** Custom responsive breakpoints */
  breakpoints?: ResponsiveBreakpoint[];
  
  /** Custom sizes attribute */
  sizes?: string;
  
  /** Callback when image loads */
  onLoad?: () => void;
  
  /** Callback when image fails to load */
  onError?: () => void;
  
  /** Whether to show blur placeholder */
  showPlaceholder?: boolean;
  
  /** Object fit CSS property */
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  
  /** Object position CSS property */
  objectPosition?: string;
}

/**
 * OptimizedImage Component
 * 
 * Usage:
 * ```tsx
 * <OptimizedImage
 *   src="https://res.cloudinary.com/.../banner.jpg"
 *   alt="Custom vinyl banner preview"
 *   width={960}
 *   height={540}
 *   className="rounded-xl shadow"
 *   role="preview"
 * />
 * ```
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  role = 'preview',
  transformOptions = {},
  breakpoints,
  sizes,
  onLoad,
  onError,
  showPlaceholder = true,
  objectFit = 'cover',
  objectPosition = 'center',
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showBlur, setShowBlur] = useState(showPlaceholder);

  // Reset state when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setShowBlur(showPlaceholder);
  }, [src, showPlaceholder]);

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
    setShowBlur(false);
    onLoad?.();
    
    // Performance tracking
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`image-loaded-${role}`);
    }
  };

  // Handle image error
  const handleError = () => {
    setHasError(true);
    setShowBlur(false);
    onError?.();
    console.error('OptimizedImage: Failed to load image:', src);
  };

  // If not a Cloudinary URL, render standard img tag
  if (!isCloudinaryUrl(src)) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleLoad}
        onError={handleError}
        data-img-role={role}
        style={{
          objectFit,
          objectPosition,
        }}
      />
    );
  }

  // Determine which breakpoints to use
  const imageBreakpoints = breakpoints || 
    (role === 'thumbnail' ? THUMBNAIL_BREAKPOINTS : RESPONSIVE_BREAKPOINTS);

  // Generate optimized URLs
  const optimizedSrc = getOptimizedUrl(src, {
    width: width || (role === 'thumbnail' ? 400 : 1600),
    height,
    ...transformOptions,
  });

  const srcSet = generateSrcSet(src, imageBreakpoints, transformOptions);
  
  const sizesAttr = sizes || generateSizes(
    imageBreakpoints,
    role === 'thumbnail' ? '200px' : '100vw'
  );

  const lqipSrc = showPlaceholder ? getLQIPUrl(src) : undefined;

  // Error state
  if (hasError) {
    return (
      <div
        className={`${className} bg-gray-100 flex items-center justify-center`}
        style={{
          width: width ? `${width}px` : '100%',
          height: height ? `${height}px` : 'auto',
        }}
        data-img-role={role}
        data-img-error="true"
      >
        <div className="text-center text-gray-400 text-sm">
          <svg
            className="w-8 h-8 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: width ? `${width}px` : '100%' }}>
      {/* LQIP Blur Placeholder */}
      {showBlur && lqipSrc && (
        <img
          src={lqipSrc}
          alt=""
          aria-hidden="true"
          className={`${className} absolute inset-0 blur-xl scale-110`}
          style={{
            objectFit,
            objectPosition,
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Main Optimized Image */}
      <img
        src={optimizedSrc}
        srcSet={srcSet}
        sizes={sizesAttr}
        alt={alt}
        width={width}
        height={height}
        className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleLoad}
        onError={handleError}
        data-img-role={role}
        style={{
          objectFit,
          objectPosition,
        }}
      />
    </div>
  );
};

export default OptimizedImage;
