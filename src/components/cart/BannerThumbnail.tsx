import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TextElement } from '@/store/quote';
import PdfImagePreview from '@/components/preview/PdfImagePreview';

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
 * BannerThumbnail component - MOBILE-OPTIMIZED VERSION
 * Displays a thumbnail of the banner design with maximum reliability
 * 
 * Key improvements:
 * - Mobile-specific canvas rendering optimizations
 * - Better dimension calculations for small screens
 * - Improved image loading detection
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
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    console.log('🔄 BannerThumbnail URL changed:', { imageUrl, isPdf, hasTextLayers, isMobile });
    if (mountedRef.current) {
      setStatus('loading');
    }
  }, [imageUrl, isPdf, hasTextLayers, isMobile]);

  // Render text layers on canvas when image loads
  useEffect(() => {
    if (status !== 'loaded' || !hasTextLayers || !canvasRef.current || !imgRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { 
      // Mobile optimization: use lower quality for better performance
      alpha: true,
      desynchronized: isMobile // Better performance on mobile
    });
    const img = imgRef.current;

    if (!ctx || !img.complete || !img.naturalWidth) {
      console.log('⏭️ Canvas render skipped - image not ready');
      return;
    }

    try {
      console.log('🎨 Rendering canvas with text layers (mobile:', isMobile, ')');

      // MOBILE FIX: Use requestAnimationFrame for smoother rendering
      const renderCanvas = () => {
        // Set canvas size to match the container
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          console.log('⏭️ Canvas render skipped - zero dimensions');
          return;
        }

        // MOBILE FIX: Use lower pixel ratio on mobile for better performance
        const pixelRatio = isMobile ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio;
        
        canvas.width = rect.width * pixelRatio;
        canvas.height = rect.height * pixelRatio;
        
        // MOBILE FIX: Ensure canvas is visible with explicit CSS
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        canvas.style.display = 'block';
        
        ctx.scale(pixelRatio, pixelRatio);

        // Draw the base image
        ctx.drawImage(img, 0, 0, rect.width, rect.height);

        // Calculate scale factor for text positioning
        const scaleX = rect.width / widthIn;
        const scaleY = rect.height / heightIn;

        // Draw text layers
        textElements.forEach((textEl) => {
          if (!textEl.content || textEl.content.trim() === '') return;

          // Use the same conversion logic as BannerPreview
          const LIVE_PREVIEW_PIXELS_PER_INCH = 400 / 24;
          const DRAGGABLE_TEXT_PADDING_PX = 4;
          
          const fontSizeInInches = textEl.fontSize / LIVE_PREVIEW_PIXELS_PER_INCH;
          const paddingInches = DRGGABLE_TEXT_PADDING_PX / LIVE_PREVIEW_PIXELS_PER_INCH;
          
          const avgCharWidthRatio = 0.55;
          const estimatedTextWidthInches = textEl.content.length * fontSizeInInches * avgCharWidthRatio;
          
          const minWidthInches = 50 / LIVE_PREVIEW_PIXELS_PER_INCH;
          const divWidthInches = Math.max(minWidthInches, estimatedTextWidthInches + 2 * paddingInches);
          
          const scale = Math.min(scaleX, scaleY);
          const fontSize = fontSizeInInches * scaleX;
          const divWidthPx = divWidthInches * scaleX;
          const paddingPx = paddingInches * scaleX;
          
          let x = (textEl.xPercent / 100) * rect.width;
          const y = (textEl.yPercent / 100) * rect.height;
          
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
      };

      // MOBILE FIX: Use requestAnimationFrame for smoother rendering
      if (isMobile) {
        requestAnimationFrame(renderCanvas);
      } else {
        renderCanvas();
      }
    } catch (error) {
      console.error('❌ Canvas rendering error:', error);
    }

  }, [status, hasTextLayers, textElements, widthIn, heightIn, isMobile]);

  const handleImageLoad = () => {
    console.log('✅ Image loaded:', imageUrl);
    if (mountedRef.current) {
      setStatus('loaded');
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.log('❭ Image load error:', imageUrl, e);
    if (mountedRef.current) {
      setStatus('error');
    }
  };

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

  if (!imageUrl) {
    console.log('📦 No image URL - showing placeholder');
    return renderPlaceholder();
  }

  if (status === 'error') {
    console.log('📦 Image error - showing placeholder');
    return renderPlaceholder();
  }

  if (hasTextLayers) {
    return (
      <div className={`${className} relative flex-shrink-0`}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`Banner ${widthIn}x${heightIn}`}
          className="hidden"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        
        <canvas
          ref={canvasRef}
          className={`${className} object-cover rounded-lg border border-gray-200 ${status === 'loaded' ? 'block' : 'hidden'}`}
          style={{
            display: status === 'loaded' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            imageRendering: isMobile ? 'auto' : 'crisp-edges'
          }}
        />
        
        {status === 'loading' && renderPlaceholder(true)}
      </div>
    );
  }

  return (
    <div className={`${className} relative flex-shrink-0`}>
      {status === 'loading' && (
        <div className="absolute inset-0 z-10">
          {renderPlaceholder(true)}
        </div>
      )}
      <img
        src={imageUrl}
        alt={`Banner ${widthIn}x${heightIn}`}
        className={`${className} object-cover rounded-lg border border-gray-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          maxWidth: '100%'
        }}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </div>
  );
};

export default BannerThumbnail;
