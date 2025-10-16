/**
 * BannerPreview Component
 * 
 * Displays a live preview of a banner with proper aspect ratio, image, and grommets.
 * Used in the UpsellModal to show customers their actual banner design.
 * 
 * Features:
 * - Maintains proper aspect ratio based on banner dimensions
 * - Responsive sizing for desktop, tablet, and mobile
 * - Handles edge cases (very wide, very tall, square banners)
 * - Shows uploaded image/artwork
 * - Displays grommets if selected
 * - Handles loading and error states
 */

import React, { useMemo } from 'react';
import { Grommets } from '@/store/quote';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

import { TextElement } from '@/store/quote';

interface BannerPreviewProps {
  widthIn: number;
  heightIn: number;
  grommets: Grommets;
  imageUrl?: string;
  material?: string;
  isLoading?: boolean;
  className?: string;
  textElements?: TextElement[];
  overlayImage?: {
    url: string;
    position: { x: number; y: number };
    scale: number;
    aspectRatio?: number;
  };
  imageScale?: number;
  imagePosition?: { x: number; y: number };
}

interface Point {
  x: number;
  y: number;
}

// Calculate grommet positions based on banner dimensions and grommet mode
function calculateGrommetPoints(w: number, h: number, mode: Grommets): Point[] {
  const m = 1; // Margin from edge
  const corners: Point[] = [
    { x: m, y: m },           // Top-left
    { x: w - m, y: m },       // Top-right
    { x: m, y: h - m },       // Bottom-left
    { x: w - m, y: h - m },   // Bottom-right
  ];

  const pts: Point[] = [];

  if (mode === 'none') return pts;
  
  if (mode === '4-corners') {
    return corners;
  }
  
  if (mode === 'top-corners') {
    return [corners[0], corners[1]];
  }
  
  if (mode === 'left-corners') {
    return [corners[0], corners[2]];
  }
  
  if (mode === 'right-corners') {
    return [corners[1], corners[3]];
  }

  // For every-1-2ft and every-2-3ft, add corners plus midpoints
  const spacing = mode === 'every-1-2ft' ? 18 : 24; // inches
  pts.push(...corners);

  // Add midpoints along top and bottom edges
  const usableWidth = Math.max(0, w - 2 * m);
  const numWidthPoints = Math.floor(usableWidth / spacing);
  if (numWidthPoints > 0) {
    const widthStep = usableWidth / (numWidthPoints + 1);
    for (let i = 1; i <= numWidthPoints; i++) {
      const x = m + i * widthStep;
      pts.push({ x, y: m });           // Top edge
      pts.push({ x, y: h - m });       // Bottom edge
    }
  }

  // Add midpoints along left and right edges
  const usableHeight = Math.max(0, h - 2 * m);
  const numHeightPoints = Math.floor(usableHeight / spacing);
  if (numHeightPoints > 0) {
    const heightStep = usableHeight / (numHeightPoints + 1);
    for (let i = 1; i <= numHeightPoints; i++) {
      const y = m + i * heightStep;
      pts.push({ x: m, y });           // Left edge
      pts.push({ x: w - m, y });       // Right edge
    }
  }

  // Remove duplicates
  const seen = new Set<string>();
  return pts.filter(p => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const BannerPreview: React.FC<BannerPreviewProps> = ({
  widthIn,
  heightIn,
  grommets,
  imageUrl,
  material = '13oz',
  isLoading = false,
  className = '',
  textElements = [],
  overlayImage,
  imageScale = 1,
  imagePosition = { x: 0, y: 0 }
}) => {
  // Calculate aspect ratio and determine container dimensions
  const aspectRatio = widthIn / heightIn;
  
  // Calculate optimal preview size based on aspect ratio
  // Max container size: 200px (to fit in modal)
  const maxSize = 200;
  
  let previewWidth: number;
  let previewHeight: number;
  
  if (aspectRatio > 1) {
    // Wider than tall
    previewWidth = maxSize;
    previewHeight = maxSize / aspectRatio;
  } else {
    // Taller than wide or square
    previewHeight = maxSize;
    previewWidth = maxSize * aspectRatio;
  }

  // Calculate grommet positions
  const grommetPositions = useMemo(() => {
    return calculateGrommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  // SVG viewBox dimensions (using actual banner dimensions in inches)
  const viewBoxWidth = widthIn;
  const viewBoxHeight = heightIn;
  
  // Grommet radius (scaled to banner dimensions)
  const grommetRadius = Math.min(widthIn, heightIn) * 0.03;

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div 
        className="relative rounded-lg overflow-hidden shadow-lg border-2 border-gray-200"
        style={{
          width: `${previewWidth}px`,
          height: `${previewHeight}px`,
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="bg-white"
        >
          {/* Background */}
          <rect
            x="0"
            y="0"
            width={viewBoxWidth}
            height={viewBoxHeight}
            fill="#f9fafb"
          />

          {/* Image or placeholder */}
          {isLoading ? (
            <g>
              <rect
                x="0"
                y="0"
                width={viewBoxWidth}
                height={viewBoxHeight}
                fill="#e5e7eb"
              />
              <text
                x={viewBoxWidth / 2}
                y={viewBoxHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9ca3af"
                fontSize={Math.min(viewBoxWidth, viewBoxHeight) * 0.1}
                fontFamily="system-ui, sans-serif"
              >
                Loading...
              </text>
            </g>
          ) : imageUrl ? (
            <g clipPath={`url(#banner-clip-${widthIn}-${heightIn})`}>
              <image
                href={imageUrl}
                x={(viewBoxWidth - viewBoxWidth * imageScale) / 2 + (imagePosition.x * 0.01)}
                y={(viewBoxHeight - viewBoxHeight * imageScale) / 2 + (imagePosition.y * 0.01)}
                width={viewBoxWidth * imageScale}
                height={viewBoxHeight * imageScale}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          ) : (
            <g>
              <rect
                x="0"
                y="0"
                width={viewBoxWidth}
                height={viewBoxHeight}
                fill="#f3f4f6"
              />
              <text
                x={viewBoxWidth / 2}
                y={viewBoxHeight / 2 - viewBoxHeight * 0.05}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9ca3af"
                fontSize={Math.min(viewBoxWidth, viewBoxHeight) * 0.08}
                fontFamily="system-ui, sans-serif"
              >
                No Image
              </text>
              <text
                x={viewBoxWidth / 2}
                y={viewBoxHeight / 2 + viewBoxHeight * 0.05}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#d1d5db"
                fontSize={Math.min(viewBoxWidth, viewBoxHeight) * 0.05}
                fontFamily="system-ui, sans-serif"
              >
                Upload artwork to preview
              </text>
            </g>
          )}

          {/* Text Elements */}
          {textElements.map((textEl) => {
            // Calculate font size in inches to match the preview canvas
            const ESTIMATED_PREVIEW_BANNER_HEIGHT_PX = 400;
            const fontSizeInInches = textEl.fontSize * (heightIn / ESTIMATED_PREVIEW_BANNER_HEIGHT_PX);
            
            // DEBUG
            console.log('BannerPreview text:', {
              content: textEl.content,
              xPercent: textEl.xPercent,
              yPercent: textEl.yPercent,
              textAlign: textEl.textAlign,
              fontSize: textEl.fontSize
            });
            
            // The stored xPercent/yPercent represent the TOP-LEFT corner of the text div
            // We always use textAnchor="start" to match this
            return (
              <text
                key={textEl.id}
                x={widthIn * textEl.xPercent / 100}
                y={heightIn * textEl.yPercent / 100}
                fontSize={fontSizeInInches}
                fontFamily={textEl.fontFamily}
                fill={textEl.color}
                textAnchor="start"
                dominantBaseline="hanging"
                fontWeight={textEl.fontWeight || 'normal'}
              >
                {textEl.content}
              </text>
            );
          })}
          {/* Overlay Image (Logo) */}
          {overlayImage && overlayImage.position && typeof overlayImage.position.x === 'number' && typeof overlayImage.position.y === 'number' && (() => {
            const aspectRatio = overlayImage.aspectRatio || 1;
            const baseDimension = Math.min(widthIn, heightIn);
            
            let overlayWidth, overlayHeight;
            if (aspectRatio >= 1) {
              overlayWidth = baseDimension * overlayImage.scale * aspectRatio;
              overlayHeight = baseDimension * overlayImage.scale;
            } else {
              overlayWidth = baseDimension * overlayImage.scale;
              overlayHeight = baseDimension * overlayImage.scale / aspectRatio;
            }
            
            const overlayX = (widthIn * overlayImage.position.x / 100) - (overlayWidth / 2);
            const overlayY = (heightIn * overlayImage.position.y / 100) - (overlayHeight / 2);
            
            return (
              <image
                href={overlayImage.url}
                x={overlayX}
                y={overlayY}
                width={overlayWidth}
                height={overlayHeight}
                preserveAspectRatio="xMidYMid meet"
              />
            );
          })()}

          {grommetPositions.map((point, index) => (
            <g key={index}>
              {/* Drop shadow */}
              <circle
                cx={point.x + 0.08}
                cy={point.y + 0.08}
                r={grommetRadius * 1.3}
                fill="#000000"
                opacity="0.15"
              />
              
              {/* Outer metallic ring */}
              <circle
                cx={point.x}
                cy={point.y}
                r={grommetRadius * 1.3}
                fill="url(#grommetGradient)"
                stroke="#2d3748"
                strokeWidth={grommetRadius * 0.06}
              />
              
              {/* Inner hole */}
              <circle
                cx={point.x}
                cy={point.y}
                r={grommetRadius * 0.7}
                fill="#f7fafc"
                stroke="#cbd5e0"
                strokeWidth={grommetRadius * 0.03}
              />
              
              {/* Center dot */}
              <circle
                cx={point.x}
                cy={point.y}
                r={grommetRadius * 0.15}
                fill="#4a5568"
                opacity="0.8"
              />
              
              {/* Highlight for 3D effect */}
              <circle
                cx={point.x - grommetRadius * 0.4}
                cy={point.y - grommetRadius * 0.4}
                r={grommetRadius * 0.3}
                fill="#ffffff"
                opacity="0.4"
              />
            </g>
          ))}

          {/* Gradient definitions */}
          <defs>
            <clipPath id={`banner-clip-${widthIn}-${heightIn}`}>
              <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} />
            </clipPath>
            <radialGradient id="grommetGradient" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="50%" stopColor="#a0aec0" />
              <stop offset="100%" stopColor="#4a5568" />
            </radialGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
};

export default BannerPreview;
