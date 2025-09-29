import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Move } from 'lucide-react';

interface ImageTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface InteractiveImageEditorProps {
  imageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  onTransformChange?: (transform: ImageTransform) => void;
  className?: string;
}

const InteractiveImageEditor: React.FC<InteractiveImageEditorProps> = ({
  imageUrl,
  canvasWidth,
  canvasHeight,
  onTransformChange,
  className = ''
}) => {
  const [isSelected, setIsSelected] = useState(true) // Start selected so handles are visible;
  const [isDragging, setIsDragging] = useState(true) // Start selected so handles are visible;
  const [isResizing, setIsResizing] = useState(true) // Start selected so handles are visible;
  const [transform, setTransform] = useState<ImageTransform>({
    x: 0,
    y: 0,
    scale: 0.5,
    rotation: 0
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; startScale: number } | null>(null);

  // Auto-fit image when it loads
  const handleImageLoad = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;
    
    const img = imageRef.current;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // Calculate scale to fit image within 70% of container (leave room for grommets)
    const targetWidth = containerRect.width * 0.7;
    const targetHeight = containerRect.height * 0.7;
    
    const scaleX = targetWidth / img.naturalWidth;
    const scaleY = targetHeight / img.naturalHeight;
    const fitScale = Math.min(scaleX, scaleY, 2); // Allow up to 2x scaling
    
    const newTransform = {
      x: 0,
      y: 0,
      scale: Math.max(fitScale, 0.2), // Minimum 20% scale
      rotation: 0
    };
    
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  }, [onTransformChange]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setIsSelected(true);
    
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startScale: transform.scale
    };
  }, [transform.scale]);

  // Handle mouse/touch start for dragging
  const handlePointerStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsSelected(true);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startX: transform.x,
      startY: transform.y
    };
  }, [transform]);

  // Handle mouse/touch move
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    if (isResizing && resizeStartRef.current) {
      e.preventDefault();
      
      const deltaY = clientY - resizeStartRef.current.y;
      const scaleFactor = 1 + (deltaY / 100);
      const newScale = Math.max(0.1, Math.min(3, resizeStartRef.current.startScale * scaleFactor));
      
      const newTransform = {
        ...transform,
        scale: newScale
      };
      
      setTransform(newTransform);
      onTransformChange?.(newTransform);
    } else if (isDragging && dragStartRef.current) {
      e.preventDefault();
      
      const deltaX = clientX - dragStartRef.current.x;
      const deltaY = clientY - dragStartRef.current.y;
      
      const newTransform = {
        ...transform,
        x: dragStartRef.current.startX + deltaX,
        y: dragStartRef.current.startY + deltaY
      };
      
      setTransform(newTransform);
      onTransformChange?.(newTransform);
    }
  }, [isDragging, isResizing, transform, onTransformChange]);

  // Handle mouse/touch end
  const handlePointerEnd = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  }, []);

  // Add global event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleMouseMove = (e: MouseEvent) => handlePointerMove(e);
      const handleTouchMove = (e: TouchEvent) => handlePointerMove(e);
      const handleMouseUp = () => handlePointerEnd();
      const handleTouchEnd = () => handlePointerEnd();

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, isResizing, handlePointerMove, handlePointerEnd]);

  // Handle clicks outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Control functions
  const handleZoomIn = () => {
    const newTransform = { ...transform, scale: Math.min(3, transform.scale + 0.1) };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  };

  const handleZoomOut = () => {
    const newTransform = { ...transform, scale: Math.max(0.1, transform.scale - 0.1) };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  };

  const handleRotate = () => {
    const newTransform = { ...transform, rotation: (transform.rotation + 90) % 360 };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  };

  const handleReset = () => {
    const newTransform = { x: 0, y: 0, scale: 0.5, rotation: 0 };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  };

  const handleAutoFit = () => {
    handleImageLoad();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Image */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Editable artwork"
        className={`absolute cursor-move select-none transition-all duration-200 ${
          isSelected ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
          transformOrigin: 'center center',
          left: '50%',
          top: '50%',
          marginLeft: '-50%',
          marginTop: '-50%',
          maxWidth: 'none',
          maxHeight: 'none',
          zIndex: 1
        }}
        onMouseDown={handlePointerStart}
        onTouchStart={handlePointerStart}
        onLoad={handleImageLoad}
        draggable={false}
      />

      {/* Corner resize handles */}
      {isSelected && (
        <>
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize shadow-lg hover:bg-blue-600 transition-colors"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(${transform.x - 50}px, ${transform.y - 50}px)`,
              zIndex: 10
            }}
            onMouseDown={handleResizeStart}
          />
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize shadow-lg hover:bg-blue-600 transition-colors"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(${transform.x + 50}px, ${transform.y - 50}px)`,
              zIndex: 10
            }}
            onMouseDown={handleResizeStart}
          />
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize shadow-lg hover:bg-blue-600 transition-colors"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(${transform.x - 50}px, ${transform.y + 50}px)`,
              zIndex: 10
            }}
            onMouseDown={handleResizeStart}
          />
          <div
            className="absolute w-6 h-6 bg-blue-500 border-2 border-white rounded-full cursor-se-resize shadow-lg hover:bg-blue-600 transition-colors"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(${transform.x + 50}px, ${transform.y + 50}px)`,
              zIndex: 10
            }}
            onMouseDown={handleResizeStart}
          />
        </>
      )}

      {/* Control toolbar */}
      {isSelected && (
        <div className="absolute top-2 left-2 flex gap-1 bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-lg z-20">
          <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded transition-colors" title="Zoom In">
            <ZoomIn className="w-6 h-6" />
          </button>
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded transition-colors" title="Zoom Out">
            <ZoomOut className="w-6 h-6" />
          </button>
          <button onClick={handleRotate} className="p-2 hover:bg-gray-100 rounded transition-colors" title="Rotate 90°">
            <RotateCw className="w-6 h-6" />
          </button>
          <button onClick={handleAutoFit} className="p-2 hover:bg-green-100 rounded transition-colors text-green-600 font-bold" title="Auto Fit">
            <Move className="w-6 h-6" />
          </button>
          <button onClick={handleReset} className="p-2 hover:bg-red-100 rounded transition-colors text-red-600" title="Reset">
            <Move className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveImageEditor;
