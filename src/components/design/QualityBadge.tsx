/**
 * Quality Badge component for displaying print quality warnings in the banner preview.
 * Shows DPI information and warnings when resolution is too low for print quality.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface QualityBadgeProps {
  /** Current image scale factor (1.0 = 100%) */
  imageScale: number;
  /** Physical banner width in inches */
  bannerWidthInches: number;
  /** Physical banner height in inches */
  bannerHeightInches: number;
  /** Pixel width of the artwork */
  artworkPixelWidth: number;
  /** Pixel height of the artwork */
  artworkPixelHeight: number;
  /** Minimum DPI threshold for quality warning (default: 150) */
  minDPI?: number;
  /** CSS class name for styling */
  className?: string;
}

/**
 * Calculates the effective DPI of artwork at current scale and banner dimensions.
 * Uses the minimum of width and height DPI to ensure both dimensions meet quality standards.
 */
function calculateEffectiveDPI(
  artworkPixelWidth: number,
  artworkPixelHeight: number,
  bannerWidthInches: number,
  bannerHeightInches: number,
  imageScale: number
): number {
  // Calculate DPI for both dimensions at current scale
  const widthDPI = (artworkPixelWidth * imageScale) / bannerWidthInches;
  const heightDPI = (artworkPixelHeight * imageScale) / bannerHeightInches;
  
  // Return the minimum DPI (limiting factor for print quality)
  return Math.min(widthDPI, heightDPI);
}

/**
 * Determines the quality level and appropriate styling based on DPI.
 */
function getQualityLevel(dpi: number, minDPI: number = 150) {
  if (dpi >= 300) {
    return {
      level: 'excellent',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      borderColor: 'border-green-300',
      message: 'Excellent print quality'
    };
  } else if (dpi >= 200) {
    return {
      level: 'good',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      borderColor: 'border-blue-300',
      message: 'Good print quality'
    };
  } else if (dpi >= minDPI) {
    return {
      level: 'acceptable',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      borderColor: 'border-yellow-300',
      message: 'Acceptable print quality'
    };
  } else {
    return {
      level: 'low',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100',
      borderColor: 'border-orange-300',
      message: 'Low resolution - May appear blurry when printed'
    };
  }
}

export default function QualityBadge({
  imageScale,
  bannerWidthInches,
  bannerHeightInches,
  artworkPixelWidth,
  artworkPixelHeight,
  minDPI = 150,
  className = ''
}: QualityBadgeProps) {
  // Calculate effective DPI at current scale
  const effectiveDPI = calculateEffectiveDPI(
    artworkPixelWidth,
    artworkPixelHeight,
    bannerWidthInches,
    bannerHeightInches,
    imageScale
  );
  
  // Get quality level and styling
  const quality = getQualityLevel(effectiveDPI, minDPI);
  
  // Only show badge for low quality or when explicitly requested
  const shouldShow = quality.level === 'low' || quality.level === 'acceptable';
  
  if (!shouldShow) {
    return null;
  }
  
  return (
    <div
      className={`
        absolute top-16 right-4 z-30
        flex items-center gap-2 px-3 py-2
        rounded-lg border shadow-sm
        backdrop-blur-sm bg-opacity-90
        ${quality.bgColor} ${quality.borderColor} ${quality.color}
        text-sm font-medium
        transition-all duration-200
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      {quality.level === 'low' && (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {Math.round(effectiveDPI)} DPI
          </span>
          <span className="text-xs opacity-75">
            @ {Math.round(imageScale * 100)}%
          </span>
        </div>
        <div className="text-xs leading-tight">
          {quality.message}
        </div>
      </div>
    </div>
  );
}
