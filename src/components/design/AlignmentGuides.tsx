import React from 'react';

interface AlignmentGuidesProps {
  showVerticalCenter: boolean;
  showHorizontalCenter: boolean;
  bannerWidthPercent?: number;  // Banner width as % of container
  bannerHeightPercent?: number; // Banner height as % of container
  bannerOffsetXPercent?: number; // Banner left offset as % of container
  bannerOffsetYPercent?: number; // Banner top offset as % of container
}

/**
 * AlignmentGuides - Canva-style alignment guides for text positioning
 * Shows visual guide lines when dragging text elements near alignment points
 * 
 * IMPORTANT: Text elements are positioned relative to the CONTAINER, not the banner area.
 * Therefore, guides must also be at 50% of the CONTAINER to match where text snaps.
 */
const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({
  showVerticalCenter,
  showHorizontalCenter,
  bannerWidthPercent = 100,
  bannerHeightPercent = 100,
  bannerOffsetXPercent = 0,
  bannerOffsetYPercent = 0,
}) => {
  // Text elements snap to 50% of the container, so guides should be at 50% too
  // The banner dimension props are kept for backward compatibility but not used
  
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    >
      {/* Vertical Center Guide (50% horizontal of CONTAINER) */}
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
            boxShadow: '0 0 4px rgba(255, 0, 255, 0.5)',
          }}
          aria-label="Vertical center alignment guide"
        />
      )}

      {/* Horizontal Center Guide (50% vertical of CONTAINER) */}
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
            boxShadow: '0 0 4px rgba(255, 0, 255, 0.5)',
          }}
          aria-label="Horizontal center alignment guide"
        />
      )}
    </div>
  );
};

export default AlignmentGuides;
