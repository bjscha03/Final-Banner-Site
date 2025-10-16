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
 * BannerThumbnail component - ROBUST VERSION
 * Displays a thumbnail of the banner design with maximum reliability
 * 
 * Key improvements:
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

        // Convert percentage position to pixels
        const x = (textEl.xPercent / 100) * rect.width;
        const y = (textEl.yPercent / 100) * rect.height;
        // Calculate font size to match preview canvas rendering
        // The scale represents how much the banner is scaled down to fit the thumbnail
        // This matches DraggableText which uses: fontSize * (previewScale / 100)
        const scale = Math.min(scaleX, scaleY);
        const fontSize = (textEl.fontSize || 24) * scale;

        ctx.save();
        ctx.font = `${textEl.fontWeight || 'normal'} ${fontSize}px ${textEl.fontFamily || 'Arial'}`;
        ctx.fillStyle = textEl.color || '#000000';
        ctx.textAlign = (textEl.textAlign as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
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
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
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
        {/* Hidden image for loading */}
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

  // Simple image without text layers
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
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </div>
  );
};

export default BannerThumbnail;
