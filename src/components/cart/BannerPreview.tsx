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

import React, { useMemo, useState, useEffect } from 'react';
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
  // Detect if imageUrl is a canvas thumbnail (data URL)
  const isCanvasThumbnail = imageUrl?.startsWith('data:image/');
  
  // DEBUG: Log what we received
  console.log('🎨 BannerPreview: Received props:', {
    imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : null,
    isCanvasThumbnail,
    widthIn,
    heightIn,
    hasTextElements: textElements?.length > 0,
    hasOverlayImage: !!overlayImage,
    imageScale,
    imagePosition
  });

  // Track image load errors
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset error state when imageUrl changes
  useEffect(() => {
    setImageError(false);
    
    // DEBUG: Log image URL information
    console.log('🖼️ BannerPreview: Image URL changed:', {
      imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : null,
      isCanvasThumbnail,
      isBlob: imageUrl?.startsWith('blob:'),
      isCloudinary: imageUrl?.includes('cloudinary'),
      isHttps: imageUrl?.startsWith('https://'),
      length: imageUrl?.length
    });
    setImageLoaded(false);
  }, [imageUrl]);


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

  // MOBILE FIX: Use <img> tags instead of SVG <image> for better compatibility
  // SVG <image> elements are unreliable on mobile Safari
  if (isMobile && imageUrl && !imageError) {
    console.log('📱 MOBILE: Rendering with <img> tag instead of SVG');
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div 
          className="relative rounded-lg overflow-hidden shadow-lg border-2 border-gray-200 bg-white"
          style={{
            width: `${previewWidth}px`,
            height: `${previewHeight}px`,
          }}
        >
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-gray-400 text-sm">Loading...</div>
            </div>
          ) : (
            <img 
              src={imageUrl} 
              alt="Banner preview"
              className="w-full h-full object-contain"
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '100%'
              }}
              onLoad={() => {
                console.log('✅ MOBILE: Image loaded successfully');
                setImageLoaded(true);
              }}
              onError={(e) => {
                console.error('❌ MOBILE: Image failed to load:', imageUrl);
                setImageError(true);
              }}
            />
          )}
          {!imageLoaded && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-xs">Loading image...</div>
            </div>
          )}
        </div>
      </div>
    );
  }


  // If this is a canvas thumbnail (data URL), render it simply