import React from 'react';

interface AlignmentGuidesProps {
  showVerticalCenter: boolean;
  showHorizontalCenter: boolean;
}

/**
 * AlignmentGuides - Canva-style alignment guides for text positioning
 * Shows visual guide lines when dragging text elements near alignment points
 */
const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({
  showVerticalCenter,
  showHorizontalCenter,
}) => {
  return (
    <>
      {/* Vertical Center Guide (50% horizontal) */}
      {showVerticalCenter && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '2px',
            backgroundColor: '#FF00FF', // Bright magenta
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 9998,
            boxShadow: '0 0 4px rgba(255, 0, 255, 0.5)',
          }}
          aria-label="Vertical center alignment guide"
        />
      )}

      {/* Horizontal Center Guide (50% vertical) */}
      {showHorizontalCenter && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: '#FF00FF', // Bright magenta
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 9998,
            boxShadow: '0 0 4px rgba(255, 0, 255, 0.5)',
          }}
          aria-label="Horizontal center alignment guide"
        />
      )}
    </>
  );
};

export default AlignmentGuides;
