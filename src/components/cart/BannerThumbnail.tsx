import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextElement } from '@/store/quote';
import PdfImagePreview from '@/components/preview/PdfImagePreview';
import OptimizedImage from '@/components/ui/OptimizedImage';

interface BannerThumbnailProps {
  fileUrl?: string;
  aiDesignUrl?: string;
  webPreviewUrl?: string;
  printReadyUrl?: string;
  isPdf?: boolean;
  textElements?: TextElement[];
  widthIn: number;
  heightIn: number;
  className?: string;
}

/**
 * BannerThumbnail component - OPTIMIZED VERSION with Cloudinary CDN
 * Displays a thumbnail of the banner design with maximum reliability
 * 
 * Key improvements:
 * - Cloudinary CDN optimization for fast loading
 * - Simplified state management
 * - Better error handling
 * - Proper image loading detection
 * - Fallback to placeholder on any issue
 */
const BannerThumbnail: React.FC<BannerThumbnailProps> = ({
  fileUrl,
  aiDesignUrl,
  webPreviewUrl,
  printReadyUrl,
  isPdf = false,
  textElements = [],
  widthIn,
  heightIn,
  className = 'w-20 h-20 sm:w-24 sm:h-24'
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const mountedRef = useRef(true);

  // Memoize the image URL - prioritize permanent URLs over temporary blob URLs
  const imageUrl = useMemo(() => {
    // For AI images, use permanent Cloudinary URLs
    if (webPreviewUrl) return webPreviewUrl;
    if (printReadyUrl) return printReadyUrl;
    if (aiDesignUrl) return aiDesignUrl;
    // For uploaded files, use the file URL (may be blob or Cloudinary)
    return fileUrl || null;
  }, [webPreviewUrl, printReadyUrl, aiDesignUrl, fileUrl]);
  
  const hasTextLayers = textElements && textElements.length > 0;

  // Track component mount status
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset status when URL changes
  useEffect(() => {
    console.log('🔄 BannerThumbnail URL changed:', { imageUrl, isPdf, hasTextLayers });
    if (mountedRef.current) {
      setStatus('loading');
    }
  }, [imageUrl, isPdf, hasTextLayers]);

  // Render text layers on canvas when image loads
  useEffect(() => {
    if (status !== 'loaded' || !hasTextLayers || !canvasRef.current || !imgRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;

    if (!ctx || !img.complete || !img.naturalWidth) {
      console.log('⏭️ Canvas render skipped - image not ready');
      return;
    }

    try {
      console.log('🎨 Rendering canvas with text layers');

      // Set canvas size to match the container
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.log('⏭️ Canvas render skipped - zero dimensions');
        return;
      }

      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Draw the base image
      ctx.drawImage(img, 0, 0, rect.width, rect.height);

      // Calculate scale factor for text positioning
      const scaleX = rect.width / widthIn;
      const scaleY = rect.height / heightIn;

      // Draw text layers
      textElements.forEach((textEl) => {
        if (!textEl.content || textEl.content.trim() === '') return;

        // Use the same conversion logic as BannerPreview
        const LIVE_PREVIEW_PIXELS_PER_INCH = 400 / 24; // ~16.67 px/inch
        const DRAGGABLE_TEXT_PADDING_PX = 4;
        
        // Calculate font size in inches, then convert to thumbnail pixels
        const fontSizeInInches = textEl.fontSize / LIVE_PREVIEW_PIXELS_PER_INCH;
        const paddingInches = DRAGGABLE_TEXT_PADDING_PX / LIVE_PREVIEW_PIXELS_PER_INCH;
        
        // Estimate text width in inches
        const avgCharWidthRatio = 0.55;
        const estimatedTextWidthInches = textEl.content.length * fontSizeInInches * avgCharWidthRatio;
        
        // Div width in inches = max(minWidth, textWidth + 2*padding)
        const minWidthInches = 50 / LIVE_PREVIEW_PIXELS_PER_INCH;
        const divWidthInches = Math.max(minWidthInches, estimatedTextWidthInches + 2 * paddingInches);
        
        // Convert to thumbnail pixels
        const scale = Math.min(scaleX, scaleY);
        const fontSize = fontSizeInInches * scaleX; // Use scaleX for horizontal measurements
        const divWidthPx = divWidthInches * scaleX;
        const paddingPx = paddingInches * scaleX;
        
        // Position calculation - xPercent is the left edge of the div
        let x = (textEl.xPercent / 100) * rect.width;
        const y = (textEl.yPercent / 100) * rect.height;
        
        // Adjust x position based on alignment (same logic as BannerPreview)
        if (textEl.textAlign === 'center') {
          x += divWidthPx / 2;
        } else if (textEl.textAlign === 'right') {
          x += divWidthPx - paddingPx;
        } else {
          x += paddingPx;
        }

        ctx.save();
        ctx.font = `${textEl.fontWeight || 'normal'} ${fontSize}px ${textEl.fontFamily || 'Arial'}`;
        ctx.fillStyle = textEl.color || '#000000';
        
        // Set text alignment for canvas rendering
        if (textEl.textAlign === 'center') {
          ctx.textAlign = 'center';
        } else if (textEl.textAlign === 'right') {
          ctx.textAlign = 'right';
        } else {
          ctx.textAlign = 'left';
        }
        
        ctx.textBaseline = 'top';
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(textEl.content, x, y);
        ctx.restore();
      });

      console.log('✅ Canvas rendering complete');
    } catch (error) {
      console.error('❌ Canvas rendering error:', error);
    }

  }, [status, hasTextLayers, textElements, widthIn, heightIn]);

  // Handle image load success
  const handleImageLoad = () => {
    console.log('✅ Image loaded:', imageUrl);
    if (mountedRef.current) {
      setStatus('loaded');
    }
  };

  // Handle image load error
  const handleImageError = (e?: React.SyntheticEvent<HTMLImageElement>) => {
    console.log('❌ Image load error:', imageUrl, e);
    if (mountedRef.current) {
      setStatus('error');
    }
  };

  // Render placeholder
  const renderPlaceholder = (isLoading = false) => (
    <div className={`${className} bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0 ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="text-center">
        {isLoading ? (
          <div className="text-xs text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="text-xs font-medium text-gray-600">{widthIn}"</div>
            <div className="text-xs text-gray-400">×</div>
            <div className="text-xs font-medium text-gray-600">{heightIn}"</div>
          </>
        )}
      </div>
    </div>
  );

  // Handle PDF files
  if (isPdf && fileUrl) {
    console.log('📄 Rendering PDF thumbnail:', fileUrl);
    return (
      <div className={`${className} relative flex-shrink-0`}>
        <PdfImagePreview
          fileUrl={fileUrl}
          fileName="Banner PDF"
          className={`${className} object-cover rounded-lg border border-gray-200`}
        />
      </div>
    );
  }

  // Show placeholder if no image URL
  if (!imageUrl) {
    console.log('📦 No image URL - showing placeholder');
    return renderPlaceholder();
  }

  // Show placeholder if error
  if (status === 'error') {
    console.log('📦 Image error - showing placeholder');
    return renderPlaceholder();
  }

  // Render with text layers (canvas)
  if (hasTextLayers) {
    return (
      <div className={`${className} relative flex-shrink-0`}>
        {/* Hidden OptimizedImage for loading - uses Cloudinary optimization */}
        <div className="hidden">
          <OptimizedImage
            src={imageUrl}
            alt={`Banner ${widthIn}x${heightIn}`}
            role="thumbnail"
            width={160}
            height={160}
            onLoad={handleImageLoad}
            onError={handleImageError}
            showPlaceholder={false}
          />
        </div>
        
        {/* Also keep hidden img ref for canvas drawing */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`Banner ${widthIn}x${heightIn}`}
          className="hidden"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        
        {/* Canvas for rendering image + text */}
        <canvas
          ref={canvasRef}
          className={`${className} object-cover rounded-lg border border-gray-200 ${status === 'loaded' ? 'block' : 'hidden'}`}
        />
        
        {/* Loading placeholder */}
        {status === 'loading' && renderPlaceholder(true)}
      </div>
    );
  }

  // Simple image without text layers - use OptimizedImage
  return (
    <div className={`${className} relative flex-shrink-0`}>
      {status === 'loading' && (
        <div className="absolute inset-0 z-10">
          {renderPlaceholder(true)}
        </div>
      )}
      <OptimizedImage
        src={imageUrl}
        alt={`Banner ${widthIn}x${heightIn}`}
        role="thumbnail"
        width={160}
        height={160}
        className={`${className} object-cover rounded-lg border border-gray-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={handleImageLoad}
        onError={handleImageError}
        showPlaceholder={false}
      />
    </div>
  );
};

export default BannerThumbnail;
