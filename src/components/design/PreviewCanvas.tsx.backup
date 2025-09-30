import PrintGuidelines from "./PrintGuidelines";
import InteractiveImageEditor from "./InteractiveImageEditor";
import React, { useMemo, useState } from 'react';
import { Grommets } from '@/store/quote';
import { FileText, Image } from 'lucide-react';
import PDFPreview from './PDFPreview';
import PdfImagePreview from '@/components/preview/PdfImagePreview';

interface PreviewCanvasProps {
  widthIn: number;
  heightIn: number;
  grommets: Grommets;
  imageUrl?: string;
  className?: string;
  scale?: number; // Preview scale for PDF rendering (1 = 100%)
  file?: {
    name: string;
    type: string;
    size: number;
    url?: string;
    isPdf?: boolean;
  };
}

interface Point {
  x: number;
  y: number;
}

// Helper function to get corner points
function cornerPoints(w: number, h: number, m: number): Point[] {
  return [
    { x: m, y: m },           // TL
    { x: w - m, y: m },       // TR
    { x: m, y: h - m },       // BL
    { x: w - m, y: h - m },   // BR
  ];
}

// Helper function to get midpoints along an edge
function midpoints(length: number, m: number, spacing: number): number[] {
  const usable = Math.max(0, length - 2 * m);
  const n = Math.floor(usable / spacing);
  if (n <= 0) return [];
  const step = usable / (n + 1);
  return Array.from({ length: n }, (_, k) => m + (k + 1) * step);
}

// Remove duplicate points (when corners overlap)
function dedupe(points: Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter(p => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Calculate grommet points based on pattern
function grommetPoints(w: number, h: number, mode: Grommets): Point[] {
  const m = 1; // 1 inch margin from edges
  const corners = cornerPoints(w, h, m);
  const pts: Point[] = [];

  const addCorners = (sides: ('top' | 'right' | 'bottom' | 'left')[]) => {
    const [TL, TR, BL, BR] = corners;
    if (sides.includes('top')) { pts.push(TL, TR); }
    if (sides.includes('bottom')) { pts.push(BL, BR); }
    if (sides.includes('left')) { pts.push(TL, BL); }
    if (sides.includes('right')) { pts.push(TR, BR); }
  };

  if (mode === 'none') return pts;

  if (mode === '4-corners') {
    pts.push(...corners);
    return dedupe(pts);
  }

  if (mode === 'top-corners') { addCorners(['top']); return dedupe(pts); }
  if (mode === 'left-corners') { addCorners(['left']); return dedupe(pts); }
  if (mode === 'right-corners') { addCorners(['right']); return dedupe(pts); }

  // every-N case:
  const s = mode === 'every-1-2ft' ? 18 : 24; // inches
  
  // Add corners first
  pts.push(...corners);

  // Add top/bottom midpoints
  for (const x of midpoints(w, m, s)) {
    pts.push({ x, y: m });          // top
    pts.push({ x, y: h - m });      // bottom
  }
  
  // Add left/right midpoints
  for (const y of midpoints(h, m, s)) {
    pts.push({ x: m, y });          // left
    pts.push({ x: w - m, y });      // right
  }
  
  return dedupe(pts);
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  widthIn,
  heightIn,
  grommets,
  imageUrl,
  className = '',
  scale = 1,
  file
}) => {
  // Feature flag for PDF static preview
  const FEATURE_PDF_STATIC_PREVIEW = import.meta.env.VITE_FEATURE_PDF_STATIC_PREVIEW === '1';
  
  // State for image transform
  const [imageTransform, setImageTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0
  });

  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  // Calculate grommet radius - more prominent and visible
  const grommetRadius = useMemo(() => {
    return Math.max(0.2, Math.min(widthIn, heightIn) * 0.04);
  }, [widthIn, heightIn]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`${className}`}>
      <div className="relative">
        {/* Canvas container with proper aspect ratio */}
        {/* Print Guidelines with corner handles and measurements */}
        <PrintGuidelines widthIn={widthIn} heightIn={heightIn} className="absolute inset-0 z-30" />        <div 
          className="relative w-full border border-gray-300 rounded-xl bg-white "
          style={{
            aspectRatio: `${widthIn}/${heightIn}`,
            minHeight: '300px'
          }}
        >
          {/* Background SVG for grommets and guides */}
          <svg
            viewBox={`0 0 ${widthIn} ${heightIn}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          >
            {/* Banner background */}
            <rect
              x="0"
              y="0"
              width={widthIn}
              height={heightIn}
              fill="white"
              stroke="#e5e7eb"
              strokeWidth="0.1"
              rx="0.5"
              ry="0.5"
            />

            {/* Safe area / hem guide (1" inset) - very subtle */}
            <rect
              x="1"
              y="1"
              width={widthIn - 2}
              height={heightIn - 2}
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="0.02"
              strokeDasharray="0.1 0.1"
              opacity="0.3"
            />

            {/* Grommets - highly prominent and realistic */}
            {grommetPositions.map((point, index) => (
              <g key={index}>
                {/* Grommet shadow for depth */}
                <circle
                  cx={point.x + 0.03}
                  cy={point.y + 0.03}
                  r={grommetRadius}
                  fill="#000000"
                  opacity="0.3"
                />
                {/* Outer grommet ring (metal) - more prominent */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={grommetRadius}
                  fill="#6b7280"
                  stroke="#374151"
                  strokeWidth="0.04"
                />
                {/* Inner hole - larger for visibility */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={grommetRadius * 0.65}
                  fill="white"
                  stroke="#9ca3af"
                  strokeWidth="0.03"
                />
                {/* Metallic highlight - more prominent */}
                <circle
                  cx={point.x - grommetRadius * 0.25}
                  cy={point.y - grommetRadius * 0.25}
                  r={grommetRadius * 0.25}
                  fill="white"
                  opacity="0.8"
                />
              </g>
            ))}

            {/* Banner border (subtle inner stroke for realism) */}
            <rect
              x="0.05"
              y="0.05"
              width={widthIn - 0.1}
              height={heightIn - 0.1}
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="0.05"
              rx="0.45"
              ry="0.45"
            />
          </svg>

          {/* Interactive Image Editor */}
          {imageUrl && !file?.isPdf && (
            <div className="absolute inset-0" style={{ zIndex: 2 }}>
              <InteractiveImageEditor
                imageUrl={imageUrl}
                canvasWidth={widthIn}
                canvasHeight={heightIn}
                onTransformChange={setImageTransform}
                className="w-full h-full"
              />
            </div>
          )}

          {/* Print Guidelines with corner handles and measurements */}
          <PrintGuidelines widthIn={widthIn} heightIn={heightIn} grommets={grommets} />
          {/* Placeholder when no image */}
          {!imageUrl && !file?.isPdf && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
                  <Image className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">Upload artwork to preview</p>
                <p className="text-gray-400 text-sm mt-1">Your banner will appear here</p>
              </div>
            </div>
          )}

          {/* PDF Preview Overlay */}
          {file?.isPdf && file.url && (
            <div className="absolute inset-0 flex items-center justify-center p-4" style={{ zIndex: 2 }}>
              {FEATURE_PDF_STATIC_PREVIEW ? (
                <PdfImagePreview
                  fileUrl={file.url}
                  fileName={file.name}
                  className="w-full h-full max-w-md max-h-80 object-contain"
                  onError={(e) => console.error('PDF preview error:', e)}
                />
              ) : (
                <PDFPreview
                  url={file.url}
                  className="w-full h-full max-w-md max-h-80"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Professional info panel below the preview with more spacing */}
      <div className="mt-8 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-5 shadow-sm ">
        <div className="flex flex-wrap items-center gap-4 w-full">
          {/* Banner dimensions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-gray-600 font-medium">Size:</span>
            <span className="text-sm font-bold text-gray-900 bg-blue-100 px-2 py-1 rounded-md whitespace-nowrap">
              {widthIn}″ × {heightIn}″
            </span>
          </div>

          {/* Grommet info */}
          {grommetPositions.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-gray-600 font-medium">Grommets:</span>
              <span className="text-sm font-bold text-gray-900 bg-green-100 px-2 py-1 rounded-md whitespace-nowrap">
                {grommetPositions.length} total
              </span>
            </div>
          )}

          {/* Image transform info */}
          {imageUrl && !file?.isPdf && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-gray-600 font-medium">Transform:</span>
              <span className="text-sm font-bold text-gray-900 bg-purple-100 px-2 py-1 rounded-md whitespace-nowrap">
                {Math.round(imageTransform.scale * 100)}% • {imageTransform.rotation}°
              </span>
            </div>
          )}

          {/* File info - constrained width */}
          {file && (
            <div className="flex items-center gap-2 min-w-0 max-w-xs">
              <div className="flex items-center gap-1 flex-shrink-0">
                {file.isPdf ? (
                  <FileText className="h-4 w-4 text-red-500" />
                ) : (
                  <Image className="h-4 w-4 text-blue-500" />
                )}
                <span className="text-sm text-gray-600 font-medium">File:</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-gray-900 truncate max-w-[120px]" title={file.name}>
                  {file.name}
                </div>
                <div className="text-xs text-gray-500 truncate max-w-[120px]">
                  {file.type.split('/')[1].toUpperCase()} • {formatFileSize(file.size)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewCanvas;
