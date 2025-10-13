import React, { useState, useRef, useEffect } from 'react';
import { TextElement } from '@/store/quote';
import PdfImagePreview from '@/components/preview/PdfImagePreview';

interface BannerThumbnailProps {
  fileUrl?: string;
  aiDesignUrl?: string;
  isPdf?: boolean;
  textElements?: TextElement[];
  widthIn: number;
  heightIn: number;
  className?: string;
}

/**
 * BannerThumbnail component
 * Displays a thumbnail of the banner design including:
 * - Base image (uploaded file or AI-generated)
 * - Text layers overlaid on the image
 * - Fallback placeholder with dimensions
 */
const BannerThumbnail: React.FC<BannerThumbnailProps> = ({
  fileUrl,
  aiDesignUrl,
  isPdf = false,
  textElements = [],
  widthIn,
  heightIn,
  className = 'w-20 h-20 sm:w-24 sm:h-24'
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const imageUrl = fileUrl || aiDesignUrl;
  const hasTextLayers = textElements && textElements.length > 0;

  // Reset image state when URL changes
  useEffect(() => {
    console.log('🔄 Image URL changed, resetting state:', imageUrl);
    setImageError(false);
    setImageLoaded(false);
  }, [imageUrl]);

  // Debug logging
  useEffect(() => {
    console.log('🖼️ BannerThumbnail render:', {
      imageUrl,
      hasTextLayers,
      textElementsCount: textElements?.length || 0,
      widthIn,
      heightIn,
      imageLoaded,
      imageError
    });
  }, [imageUrl, hasTextLayers, textElements, widthIn, heightIn, imageLoaded, imageError]);

  // Render text layers on canvas when image loads
  useEffect(() => {
    if (!imageLoaded || !hasTextLayers || !canvasRef.current || !imgRef.current) {
      console.log('⏭️ Skipping canvas render:', { imageLoaded, hasTextLayers, hasCanvas: !!canvasRef.current, hasImg: !!imgRef.current });
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;

    if (!ctx || !img.complete) {
      console.log('⏭️ Canvas or image not ready:', { hasCtx: !!ctx, imgComplete: img?.complete });
      return;
    }

    console.log('🎨 Rendering canvas with text layers:', textElements);

    // Set canvas size to match the container
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Draw the base image
    ctx.drawImage(img, 0, 0, rect.width, rect.height);

    // Calculate scale factor for text positioning
    // Text positions are in inches, we need to scale to canvas pixels
    const scaleX = rect.width / widthIn;
    const scaleY = rect.height / heightIn;

    console.log('📐 Canvas scale factors:', { scaleX, scaleY, canvasSize: { width: rect.width, height: rect.height }, bannerSize: { widthIn, heightIn } });

    // Draw text layers
    textElements.forEach((textEl, index) => {
      if (!textEl.text || textEl.text.trim() === '') {
        console.log(`⏭️ Skipping empty text element ${index}`);
        return;
      }

      const x = textEl.x * scaleX;
      const y = textEl.y * scaleY;
      const fontSize = (textEl.fontSize || 24) * Math.min(scaleX, scaleY) / 72; // Convert from points to pixels

      console.log(`✍️ Drawing text ${index}:`, { text: textEl.text, x, y, fontSize, color: textEl.color });

      ctx.save();
      
      // Set text properties
      ctx.font = `${textEl.fontWeight || 'normal'} ${fontSize}px ${textEl.fontFamily || 'Arial'}`;
      ctx.fillStyle = textEl.color || '#000000';
      ctx.textAlign = (textEl.align as CanvasTextAlign) || 'left';
      ctx.textBaseline = 'top';

      // Add text shadow for better visibility
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Draw the text
      ctx.fillText(textEl.text, x, y);
      
      ctx.restore();
    });

    console.log('✅ Canvas rendering complete');
  }, [imageLoaded, hasTextLayers, textElements, widthIn, heightIn]);

  // Handle image load error
  const handleImageError = () => {
    console.log('❌ Image load error:', imageUrl);
    setImageError(true);
    setImageLoaded(false);
  };

  // Handle image load success
  const handleImageLoad = () => {
    console.log('✅ Image loaded successfully:', imageUrl);
    setImageError(false);
    setImageLoaded(true);
  };

  // Handle PDF files with PdfImagePreview
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

  // Show placeholder if no image or image failed to load
  if (!imageUrl || imageError) {
    console.log('📦 Showing placeholder:', { imageUrl, imageError });
    return (
      <div className={`${className} bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0`}>
        <div className="text-center">
          <div className="text-xs font-medium text-gray-600">{widthIn}"</div>
          <div className="text-xs text-gray-400">×</div>
          <div className="text-xs font-medium text-gray-600">{heightIn}"</div>
        </div>
      </div>
    );
  }

  // If we have text layers, use canvas to composite them
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
          crossOrigin="anonymous"
        />
        
        {/* Canvas for rendering image + text */}
        <canvas
          ref={canvasRef}
          className={`${className} object-cover rounded-lg border border-gray-200 ${imageLoaded ? 'block' : 'hidden'}`}
        />
        
        {/* Loading placeholder */}
        {!imageLoaded && !imageError && (
          <div className={`${className} bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-200 flex items-center justify-center animate-pulse`}>
            <div className="text-xs text-gray-400">Loading...</div>
          </div>
        )}
      </div>
    );
  }

  // Simple image without text layers
  return (
    <div className={`${className} relative flex-shrink-0`}>
      <img
        src={imageUrl}
        alt={`Banner ${widthIn}x${heightIn}`}
        className={`${className} object-cover rounded-lg border border-gray-200`}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
      
      {/* Loading placeholder */}
      {!imageLoaded && !imageError && (
        <div className={`${className} absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-200 flex items-center justify-center animate-pulse`}>
          <div className="text-xs text-gray-400">Loading...</div>
        </div>
      )}
    </div>
  );
};

export default BannerThumbnail;
