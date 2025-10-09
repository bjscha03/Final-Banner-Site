import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { TextElement } from '@/store/quote';

interface DraggableTextProps {
  element: TextElement;
  bannerWidthIn: number;
  bannerHeightIn: number;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TextElement>) => void;
  onDelete: () => void;
  onDeselect?: () => void;
}

const DraggableText: React.FC<DraggableTextProps> = ({
  element,
  bannerWidthIn,
  bannerHeightIn,
  scale,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDeselect,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPos, setInitialPos] = useState({ x: 0, y: 0 });
  const [initialFontSize, setInitialFontSize] = useState(48);
  const textRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Convert position from inches to percentage of banner dimensions
  const leftPercent = (element.x / bannerWidthIn) * 100;
  const topPercent = (element.y / bannerHeightIn) * 100;
  const fontSize = element.fontSize; // Don't scale font size - parent container handles scaling

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
    setInitialPos({ x: element.x, y: element.y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(); // Select the text when starting resize
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialFontSize(element.fontSize);
  };
  
  const handleResizeMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const direction = deltaX + deltaY > 0 ? 1 : -1;
    const newFontSize = Math.max(12, Math.min(200, initialFontSize + (delta * direction * 0.5)));
    onUpdate({ fontSize: newFontSize });
  };
  
  const handleResizeMouseUp = () => {
    setIsResizing(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    // Get the container element to calculate relative movement
    if (!textRef.current) return;
    const container = textRef.current.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // Convert pixel delta to inches based on container size
    const deltaXInches = (deltaX / containerRect.width) * bannerWidthIn;
    const deltaYInches = (deltaY / containerRect.height) * bannerHeightIn;
    
    let newX = Math.max(0, Math.min(initialPos.x + deltaXInches, bannerWidthIn - 1));
    let newY = Math.max(0, Math.min(initialPos.y + deltaYInches, bannerHeightIn - 1));
    onUpdate({ x: newX, y: newY });
  };

  const handleMouseUp = () => setIsDragging(false);

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
        cursor: isDragging ? 'grabbing' : isEditing ? 'text' : 'grab',
        userSelect: isEditing ? 'text' : 'none',
        whiteSpace: 'pre-wrap',
        minWidth: '50px',
        outline: (isSelected && !isEditing) ? '2px solid #3b82f6' : 'none',
        padding: '4px',
        backgroundColor: (isSelected && !isEditing) ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        zIndex: 9999,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={element.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setIsEditing(false); }
            if (e.key === 'Escape') setIsEditing(false);
          }}
          style={{
            fontSize: `${fontSize}px`,
            fontFamily: element.fontFamily,
            color: element.color,
            fontWeight: element.fontWeight,
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
          {/* Resize handle - bottom right corner */}
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: 'absolute',
              bottom: '-8px',
              right: '-10px',
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              zIndex: 10,
            }}
            title="Drag to resize text"
          />
        </>
      )}
    </div>
  );
};

export default DraggableText;
