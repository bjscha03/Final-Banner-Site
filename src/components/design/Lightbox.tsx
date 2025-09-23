import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title: string;
}

const Lightbox: React.FC<LightboxProps> = ({ isOpen, onClose, src, alt, title }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the close button when opened
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      setImageLoaded(false);
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
      
      // Restore focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements && focusableElements.length > 0) {
          const firstElement = focusableElements[0] as HTMLElement;
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  // Check if this is an SVG file that might need special handling
  const isSvgFile = src.endsWith('.svg');
  const isMaterialSvg = src.includes('/materials/') && isSvgFile;
  
  // Check specifically for the problematic SVG files with embedded images
  const isEmbeddedImageSvg = isMaterialSvg && (src.includes('18oz.svg') || src.includes('mesh.svg'));

  // Calculate responsive dimensions for embedded image SVGs
  const getResponsiveDimensions = () => {
    if (!isEmbeddedImageSvg) return {};
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Base size calculation - aim for consistent visual size across devices
    let targetSize: number;
    
    if (viewportWidth < 640) {
      // Mobile: Use most of screen width, but ensure minimum size
      targetSize = Math.max(viewportWidth * 0.85, 320);
    } else if (viewportWidth < 1024) {
      // Tablet: Balanced size
      targetSize = Math.min(viewportWidth * 0.6, 600);
    } else {
      // Desktop: Larger size for better detail
      targetSize = Math.min(viewportWidth * 0.5, 800);
    }
    
    // Ensure we don't exceed viewport height
    const maxHeight = viewportHeight * 0.7; // Account for header
    targetSize = Math.min(targetSize, maxHeight);
    
    return {
      width: `${targetSize}px`,
      height: `${targetSize}px`,
      minWidth: '280px',
      minHeight: '280px'
    };
  };

  const responsiveDimensions = getResponsiveDimensions();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      ref={dialogRef}
    >
      <div className="relative w-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 id="lightbox-title" className="text-lg font-semibold text-gray-900 truncate">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
            aria-label="Close lightbox"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Image Container - Enhanced for responsive embedded SVGs */}
        <div className="p-2 flex items-center justify-center">
          <div 
            className={`relative flex items-center justify-center ${
              isEmbeddedImageSvg ? 'bg-gray-50' : ''
            }`}
            style={isEmbeddedImageSvg ? responsiveDimensions : {}}
          >
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              onLoad={handleImageLoad}
              className={`
                transition-opacity duration-300
                ${imageLoaded ? 'opacity-100' : 'opacity-0'}
                ${isEmbeddedImageSvg 
                  ? 'w-full h-full object-contain' 
                  : 'max-w-full max-h-[calc(95vh-80px)] object-contain mx-auto'
                }
              `}
              style={isEmbeddedImageSvg ? {
                imageRendering: 'crisp-edges',
                WebkitImageRendering: 'crisp-edges',
                MozImageRendering: 'crisp-edges',
                msImageRendering: 'crisp-edges'
              } : {
                maxWidth: '95vw',
                maxHeight: 'calc(95vh - 80px)'
              }}
            />
            
            {/* Loading indicator for embedded SVGs */}
            {isEmbeddedImageSvg && !imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Lightbox;
