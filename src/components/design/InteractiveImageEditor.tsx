import React, { useState, useRef, useCallback, useEffect } from 'react';
console.log("InteractiveImageEditor loaded");import { ZoomIn, ZoomOut, RotateCw, Move } from 'lucide-react';

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
  const [isSelected, setIsSelected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [transform, setTransform] = useState<ImageTransform>({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  // Handle mouse/touch start
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
    if (!isDragging || !dragStartRef.current) return;
    
    e.preventDefault();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    
    const newTransform = {
      ...transform,
      x: dragStartRef.current.startX + deltaX,
      y: dragStartRef.current.startY + deltaY
    };
    
    setTransform(newTransform);
    onTransformChange?.(newTransform);
  }, [isDragging, transform, onTransformChange]);

  // Handle mouse/touch end
  const handlePointerEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Add global event listeners
  useEffect(() => {
    if (isDragging) {
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
  }, [isDragging, handlePointerMove, handlePointerEnd]);

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
    const newTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
    setTransform(newTransform);
    onTransformChange?.(newTransform);
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
          zIndex: isSelected ? 10 : 1
        }}
        onMouseDown={handlePointerStart}
        onTouchStart={handlePointerStart}
        draggable={false}
      />

      {/* Control toolbar */}
      {isSelected && (
        <div className="absolute top-2 left-2 flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-lg z-20">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors text-red-600"
            title="Reset Position"
          >
            <Move className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default InteractiveImageEditor;
