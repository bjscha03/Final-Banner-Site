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
 */
const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({
  showVerticalCenter,
  showHorizontalCenter,
  bannerWidthPercent = 100,
  bannerHeightPercent = 100,
  bannerOffsetXPercent = 0,
  bannerOffsetYPercent = 0,
}) => {
  // Calculate the actual center position of the banner area
  const bannerCenterX = bannerOffsetXPercent + (bannerWidthPercent / 2);
  const bannerCenterY = bannerOffsetYPercent + (bannerHeightPercent / 2);
  
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
      {/* Vertical Center Guide (50% horizontal of BANNER, not container) */}
      {showVerticalCenter && (
        <div
          style={{
            position: 'absolute',
            left: `${bannerCenterX}%`,
            top: `${bannerOffsetYPercent}%`,
            height: `${bannerHeightPercent}%`,
            width: '2px',
            backgroundColor: '#FF00FF', // Bright magenta
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(255, 0, 255, 0.5)',
          }}
          aria-label="Vertical center alignment guide"
        />
      )}

      {/* Horizontal Center Guide (50% vertical of BANNER, not container) */}
      {showHorizontalCenter && (
        <div
          style={{
            position: 'absolute',
            top: `${bannerCenterY}%`,
            left: `${bannerOffsetXPercent}%`,
            width: `${bannerWidthPercent}%`,
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
