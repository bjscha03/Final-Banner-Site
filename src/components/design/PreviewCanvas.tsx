import React, { useMemo } from 'react';
import { Grommets } from '@/store/quote';
import { FileText, Image } from 'lucide-react';

interface PreviewCanvasProps {
  widthIn: number;
  heightIn: number;
  grommets: Grommets;
  imageUrl?: string;
  className?: string;
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
  file
}) => {
  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  // Calculate grommet radius - more prominent and visible
  const grommetRadius = useMemo(() => {
    return Math.max(0.25, Math.min(widthIn, heightIn) * 0.015);
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
        <svg
          viewBox={`0 0 ${widthIn} ${heightIn}`}
          className="w-full h-full border border-gray-300 rounded-xl bg-white"
          style={{
            aspectRatio: `${widthIn}/${heightIn}`,
            width: '100%',
            height: '100%'
          }}
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

        {/* Image if provided */}
        {imageUrl && (
          <image
            href={imageUrl}
            x="0.5"
            y="0.5"
            width={widthIn - 1}
            height={heightIn - 1}
            preserveAspectRatio="xMidYMid meet"
            clipPath="url(#banner-clip)"
          />
        )}

        {/* Placeholder when no image */}
        {!imageUrl && (
          <g>
            <rect
              x="2"
              y="2"
              width={widthIn - 4}
              height={heightIn - 4}
              fill="#f9fafb"
              stroke="#e5e7eb"
              strokeWidth="0.1"
              strokeDasharray="0.5 0.5"
              rx="0.3"
            />
            <text
              x={widthIn / 2}
              y={heightIn / 2}
              fontSize={Math.min(widthIn, heightIn) * 0.06}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#6b7280"
              fontFamily="system-ui, sans-serif"
            >
              Upload artwork to preview
            </text>
          </g>
        )}

        {/* Clip path for image */}
        <defs>
          <clipPath id="banner-clip">
            <rect
              x="0.5"
              y="0.5"
              width={widthIn - 1}
              height={heightIn - 1}
              rx="0.4"
              ry="0.4"
            />
          </clipPath>
        </defs>

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
      </div>

    {/* Professional info panel below the preview with more spacing */}
    <div className="mt-8 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-5 shadow-sm overflow-hidden">
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
