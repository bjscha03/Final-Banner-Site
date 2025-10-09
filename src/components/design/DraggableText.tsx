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
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPos, setInitialPos] = useState({ x: 0, y: 0 });
  const textRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const inchesToPx = (inches: number) => inches * 96 * scale;
  const pxToInches = (px: number) => px / (96 * scale);

  const left = inchesToPx(element.x);
  const top = inchesToPx(element.y);
  const fontSize = element.fontSize * scale;

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

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = pxToInches(e.clientX - dragStart.x);
    const deltaY = pxToInches(e.clientY - dragStart.y);
    let newX = Math.max(0, Math.min(initialPos.x + deltaX, bannerWidthIn - 1));
    let newY = Math.max(0, Math.min(initialPos.y + deltaY, bannerHeightIn - 1));
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

  return (
    <div
      ref={textRef}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${fontSize}px`,
        fontFamily: element.fontFamily,
        color: element.color,
        fontWeight: element.fontWeight,
        textAlign: element.textAlign,
        cursor: isDragging ? 'grabbing' : isEditing ? 'text' : 'grab',
        userSelect: isEditing ? 'text' : 'none',
        whiteSpace: 'pre-wrap',
        minWidth: '50px',
        outline: isSelected ? '2px solid #3b82f6' : 'none',
        padding: '4px',
        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
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
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default DraggableText;
