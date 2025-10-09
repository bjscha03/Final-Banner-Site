import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { TextElement } from '@/store/quote';

interface DraggableTextProps {
  element: TextElement;
  bannerWidthIn: number;
  bannerHeightIn: number;
  scale: number;
  previewScale: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TextElement>) => void;
  onDelete: () => void;
  onDeselect?: () => void;
  // Alignment guide callbacks
  onShowVerticalCenterGuide?: (show: boolean) => void;
  onShowHorizontalCenterGuide?: (show: boolean) => void;
}

const DraggableText: React.FC<DraggableTextProps> = ({
  element,
  bannerWidthIn,
  bannerHeightIn,
  scale,
  previewScale,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDeselect,
  onShowVerticalCenterGuide,
  onShowHorizontalCenterGuide,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPos, setInitialPos] = useState({ x: 0, y: 0 });
  const [initialSize, setInitialSize] = useState({ width: 0, height: 0 });
  const [initialFontSize, setInitialFontSize] = useState(48);
  // Alignment guide states managed by parent component
  const textRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Use percentage-based positioning (with legacy support)
  const leftPercent = element.xPercent ?? ((element.x ?? 50) / bannerWidthIn) * 100;
  const topPercent = element.yPercent ?? ((element.y ?? 50) / bannerHeightIn) * 100;
  const fontSize = element.fontSize * (previewScale / 100);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialPos({ x: leftPercent, y: topPercent });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(); // Select the text when starting resize
    setIsResizing(true);
    setResizeDirection(direction);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialFontSize(element.fontSize);
    
    // Get current element dimensions
    if (textRef.current) {
      const rect = textRef.current.getBoundingClientRect();
      setInitialSize({ width: rect.width, height: rect.height });
    }
  };
  
  const handleResizeMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // Calculate font size change based on resize direction
    let fontSizeChange = 0;
    
    if (resizeDirection.includes('e')) {
      fontSizeChange += deltaX * 0.3;
    }
    if (resizeDirection.includes('w')) {
      fontSizeChange -= deltaX * 0.3;
    }
    if (resizeDirection.includes('s')) {
      fontSizeChange += deltaY * 0.3;
    }
    if (resizeDirection.includes('n')) {
      fontSizeChange -= deltaY * 0.3;
    }
    
    const newFontSize = Math.max(12, Math.min(200, initialFontSize + fontSizeChange));
    onUpdate({ fontSize: newFontSize });
  };
  
  const handleResizeMouseUp = () => {
    setIsResizing(false);
    setResizeDirection('');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    // Get the container element to calculate relative movement
    if (!textRef.current) return;
    const container = textRef.current.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const textRect = textRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // Convert pixel delta to percentage based on container size
    const deltaXPercent = (deltaX / containerRect.width) * 100;
    const deltaYPercent = (deltaY / containerRect.height) * 100;
    
    let newXPercent = initialPos.x + deltaXPercent;
    let newYPercent = initialPos.y + deltaYPercent;
    
    // Calculate the text element's dimensions as percentages
    const textWidthPercent = (textRect.width / containerRect.width) * 100;
    const textHeightPercent = (textRect.height / containerRect.height) * 100;
    
    // Calculate the CENTER position of the text element's bounding box
    // Simple geometric center - the guide appears at 50%, so we position text so its center is at 50%
    const textCenterXPercent = newXPercent + (textWidthPercent / 2);
    const textCenterYPercent = newYPercent + (textHeightPercent / 2);
    
    // ALIGNMENT SNAPPING - Canva-style smart guides
    const snapThreshold = 2; // 2% snap threshold (~10-20px depending on banner size)
    
    // Snap to horizontal center (50%) - check if TEXT CENTER aligns with banner center
    if (Math.abs(textCenterXPercent - 50) < snapThreshold) {
      // Adjust position so text CENTER is at 50%
      newXPercent = 50 - (textWidthPercent / 2);
      onShowVerticalCenterGuide?.(true);
    } else {
      onShowVerticalCenterGuide?.(false);
    }
    
    // Snap to vertical center (50%) - check if TEXT CENTER aligns with banner center
    if (Math.abs(textCenterYPercent - 50) < snapThreshold) {
      // Adjust position so text CENTER is at 50%
      newYPercent = 50 - (textHeightPercent / 2);
      onShowHorizontalCenterGuide?.(true);
    } else {
      onShowHorizontalCenterGuide?.(false);
    }
    
    // Snap to left edge (0%)
    if (Math.abs(newXPercent) < snapThreshold) {
      newXPercent = 0;
    }
    
    // Snap to right edge (100%)
    if (Math.abs(newXPercent + textWidthPercent - 100) < snapThreshold) {
      newXPercent = 100 - textWidthPercent;
    }
    
    // Snap to top edge (0%)
    if (Math.abs(newYPercent) < snapThreshold) {
      newYPercent = 0;
    }
    
    // Snap to bottom edge (100%)
    if (Math.abs(newYPercent + textHeightPercent - 100) < snapThreshold) {
      newYPercent = 100 - textHeightPercent;
    }
    
    // Clamp to valid range (0-100%)
    newXPercent = Math.max(0, Math.min(newXPercent, 100));
    newYPercent = Math.max(0, Math.min(newYPercent, 100));
    
    onUpdate({ xPercent: newXPercent, yPercent: newYPercent });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    onShowVerticalCenterGuide?.(false);
    onShowHorizontalCenterGuide?.(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, initialPos]);
  
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleResizeMouseMove);
        window.removeEventListener('mouseup', handleResizeMouseUp);
      };
    }
  }, [isResizing, dragStart, initialFontSize]);

  // Handle clicking outside to exit edit mode and deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is inside the text element
      if (textRef.current && textRef.current.contains(target)) {
        return;
      }
      
      // Check if click is inside the TextStylePanel (ignore clicks on the panel)
      const textStylePanel = document.querySelector('[data-text-style-panel="true"]');
      if (textStylePanel && textStylePanel.contains(target)) {
        return;
      }
      
      // Click is outside both text element and panel
      if (isEditing) {
        setIsEditing(false);
      }
      if (isSelected && onDeselect) {
        onDeselect();
      }
    };

    if (isEditing || isSelected) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isEditing, isSelected, onDeselect]);

  // Handle keyboard events for Delete/Backspace when selected
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace when selected but NOT editing
      if (isSelected && !isEditing && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        onDelete();
      }
    };

    if (isSelected && !isEditing) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isSelected, isEditing, onDelete]);

  
  return (
    <div
      ref={textRef}
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        fontSize: `${fontSize}px`,
        fontFamily: element.fontFamily,
        color: element.color,
        fontWeight: element.fontWeight,
        textAlign: element.textAlign,
        lineHeight: element.lineHeight || 1.5,
        cursor: isDragging ? 'grabbing' : isEditing ? 'text' : 'grab',
        userSelect: isEditing ? 'text' : 'none',
        whiteSpace: 'pre-wrap',
        minWidth: '50px',
        outline: (isSelected && !isEditing) ? '2px solid #3b82f6' : 'none',
        padding: '4px',
        boxSizing: 'border-box', // Ensure padding is included in dimensions
        backgroundColor: (isSelected && !isEditing) ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        zIndex: 9999,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      onTouchStart={(e) => {
        // Handle touch for mobile - detect double tap
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300; // ms
        if (lastTapTime && (now - lastTapTime) < DOUBLE_TAP_DELAY) {
          // Double tap detected - enter edit mode
          e.stopPropagation();
          setIsEditing(true);
          setLastTapTime(0);
        } else {
          // Single tap - select and start potential drag
          setLastTapTime(now);
          handleMouseDown(e as any);
        }
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={element.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsEditing(false);
          }}
          style={{
            fontSize: `${fontSize}px`,
            fontFamily: element.fontFamily,
            color: element.color,
            fontWeight: element.fontWeight,
            lineHeight: element.lineHeight || 1.5,
            border: 'none',
            background: 'transparent',
            resize: 'none',
            width: '100%',
            minWidth: '200px',
          }}
          rows={element.content.split('\n').length || 1}
        />
      ) : (
        <div>{element.content || 'Double-click to edit'}</div>
      )}
      {isSelected && !isEditing && (
        <>
          {/* Corner resize handles */}
          {/* Top-left corner */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
            style={{
              position: 'absolute',
              top: '-8px',
              left: '-8px',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Top-right corner */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nesw-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Bottom-left corner */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '-8px',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nesw-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Bottom-right corner */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
            style={{
              position: 'absolute',
              bottom: '-8px',
              right: '-8px',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Side resize handles */}
          {/* Top side */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
            style={{
              position: 'absolute',
              top: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'ns-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Bottom side */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 's')}
            style={{
              position: 'absolute',
              bottom: '-8px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'ns-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Left side */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
            style={{
              position: 'absolute',
              left: '-8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'ew-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
          
          {/* Right side */}
          <div
            onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
            style={{
              position: 'absolute',
              right: '-8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'ew-resize',
              zIndex: 10,
            }}
            title="Drag to resize"
          />
        </>
      )}
    </div>
  );
};

export default DraggableText;
