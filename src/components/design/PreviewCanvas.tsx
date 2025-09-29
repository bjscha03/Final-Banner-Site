import React, { useMemo } from 'react';
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
  scale?: number;
  file?: {
    name: string;
    type: string;
    size: number;
    url?: string;
    isPdf?: boolean;
  };
  imagePosition?: { x: number; y: number };
  onImageMouseDown?: (e: React.MouseEvent) => void;
  onImageTouchStart?: (e: React.TouchEvent) => void;
  isDraggingImage?: boolean;
}

interface Point {
  x: number;
  y: number;
}

function cornerPoints(w: number, h: number, m: number): Point[] {
  return [
    { x: m, y: m },
    { x: w - m, y: m },
    { x: m, y: h - m },
    { x: w - m, y: h - m },
  ];
}

function midpoints(length: number, m: number, spacing: number): number[] {
  const usable = Math.max(0, length - 2 * m);
  const n = Math.floor(usable / spacing);
  if (n <= 0) return [];
  const step = usable / (n + 1);
  return Array.from({ length: n }, (_, k) => m + (k + 1) * step);
}

function dedupe(points: Point[]): Point[] {
  const seen = new Set<string>();
  return points.filter(p => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function grommetPoints(w: number, h: number, mode: Grommets): Point[] {
  const m = 1;
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

  const s = mode === 'every-1-2ft' ? 18 : 24;
  pts.push(...corners);
  for (const x of midpoints(w, m, s)) {
    pts.push({ x, y: m });
    pts.push({ x, y: h - m });
  }
  for (const y of midpoints(h, m, s)) {
    pts.push({ x: m, y });
    pts.push({ x: w - m, y });
  }
  return dedupe(pts);
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  widthIn,
  heightIn,
  grommets,
  imageUrl,
  className = "",
  scale = 1,
  file,
  imagePosition = { x: 0, y: 0 },
  onImageMouseDown,
  onImageTouchStart,
  isDraggingImage = false
}) => {
  const FEATURE_PDF_STATIC_PREVIEW = true;

  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

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

  // VISTAPRINT-STYLE PROFESSIONAL PRINT GUIDELINES - ALWAYS VISIBLE
  const BLEED_SIZE = 0.125;
  const SAFETY_MARGIN = 0.5;
  const RULER_HEIGHT = 1.2; // Even larger rulers for better visibility
  const TICK_SIZE = 0.15; // Ruler tick marks

  const bleedWidth = widthIn + (BLEED_SIZE * 2);
  const bleedHeight = heightIn + (BLEED_SIZE * 2);
  const totalWidth = bleedWidth + (RULER_HEIGHT * 2);
  const totalHeight = bleedHeight + (RULER_HEIGHT * 2);
  const bannerOffsetX = RULER_HEIGHT + BLEED_SIZE;
  const bannerOffsetY = RULER_HEIGHT + BLEED_SIZE;

  return (
    <div className={`${className} w-full`}>
      <div className="relative bg-gray-50 p-8 rounded-2xl">
        <svg
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="w-full h-full border-2 border-gray-400 rounded-xl bg-white shadow-lg"
          style={{
            aspectRatio: `${totalWidth}/${totalHeight}`,
            minWidth: '400px',
            minHeight: '700px',
            maxWidth: '100%'
          }}
        >
        {/* PROFESSIONAL PRINT GUIDELINES - ALWAYS VISIBLE */}
        <g className="print-rulers">
          <rect x="0" y="0" width={totalWidth} height={RULER_HEIGHT} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.02"/>
          <text x={totalWidth/2} y={RULER_HEIGHT/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.5" fill="#1e293b" fontWeight="600">
            {/* Ruler tick marks */}
            {Array.from({length: Math.floor(widthIn)}, (_, i) => (
              <line key={i} x1={RULER_HEIGHT + BLEED_SIZE + i} y1={RULER_HEIGHT - TICK_SIZE} x2={RULER_HEIGHT + BLEED_SIZE + i} y2={RULER_HEIGHT} stroke="#64748b" strokeWidth="0.02" />
            ))}            {`${widthIn}"`}
          </text>
          <rect x="0" y={totalHeight - RULER_HEIGHT} width={totalWidth} height={RULER_HEIGHT} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.02"/>
          <text x={totalWidth/2} y={totalHeight - RULER_HEIGHT/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.5" fill="#1e293b" fontWeight="600">
            {`${widthIn}"`}
          </text>
          <rect x="0" y="0" width={RULER_HEIGHT} height={totalHeight} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.02"/>
          <text x={RULER_HEIGHT/2} y={totalHeight/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.5" fill="#1e293b" fontWeight="600" transform={`rotate(-90, ${RULER_HEIGHT/2}, ${totalHeight/2})`}>
            {`${heightIn}"`}
          </text>
          <rect x={totalWidth - RULER_HEIGHT} y="0" width={RULER_HEIGHT} height={totalHeight} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.02"/>
          <text x={totalWidth - RULER_HEIGHT/2} y={totalHeight/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.5" fill="#1e293b" fontWeight="600" transform={`rotate(90, ${totalWidth - RULER_HEIGHT/2}, ${totalHeight/2})`}>
            {`${heightIn}"`}
          </text>
        </g>

        {/* Bleed Area - ALWAYS VISIBLE */}
        <rect
          x={RULER_HEIGHT}
          y={RULER_HEIGHT}
          width={bleedWidth}
          height={bleedHeight}
          fill="none"
          stroke="#ef4444"
          strokeWidth="0.15"
          strokeDasharray="0.2 0.2"
          opacity="0.8"
        />
        <text x={RULER_HEIGHT + bleedWidth/2} y={RULER_HEIGHT - 0.1} textAnchor="middle" fontSize="0.4" fill="#ef4444" fontWeight="600">
          Bleed Area
        </text>

        {/* Safety Area - ALWAYS VISIBLE */}
        <rect
          x={bannerOffsetX + SAFETY_MARGIN}
          y={bannerOffsetY + SAFETY_MARGIN}
          width={widthIn - (SAFETY_MARGIN * 2)}
          height={heightIn - (SAFETY_MARGIN * 2)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="0.15"
          strokeDasharray="0.3 0.3"
          opacity="0.8"
        />
        <text x={bannerOffsetX + widthIn/2} y={bannerOffsetY + SAFETY_MARGIN - 0.1} textAnchor="middle" fontSize="0.4" fill="#3b82f6" fontWeight="600">
          Safety Area
        </text>

        {/* Banner background */}
        <rect
          x={bannerOffsetX}
          y={bannerOffsetY}
          width={widthIn}
          height={heightIn}
          fill="white"
          stroke="#e5e7eb"
          strokeWidth="0.04"
          rx="0.2"
          ry="0.2"
        />

        {/* Image if provided */}
        {imageUrl && !file?.isPdf && (
          <image key={imageUrl}
            href={imageUrl}
            x={bannerOffsetX + 0.5 + (imagePosition.x * 0.01)}
            y={bannerOffsetY + 0.5 + (imagePosition.y * 0.01)}
            width={widthIn - 1}
            height={heightIn - 1}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#banner-clip)"
            style={{
              cursor: isDraggingImage ? 'grabbing' : 'grab',
              userSelect: 'none'
            }}
            onMouseDown={onImageMouseDown}
            onTouchStart={onImageTouchStart}
          />
        )}

        {/* ENHANCED Image resize handles */}
        {imageUrl && !file?.isPdf && (
          <g className="resize-handles">
            <rect
              x={bannerOffsetX + 0.5 + (imagePosition.x * 0.01) - 0.15}
              y={bannerOffsetY + 0.5 + (imagePosition.y * 0.01) - 0.15}
              width="0.3"
              height="0.3"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="0.04"
              style={{ cursor: "nw-resize" }}
              className="resize-handle-nw"
            />
            <rect
              x={bannerOffsetX + 0.5 + (imagePosition.x * 0.01) + widthIn - 1.15}
              y={bannerOffsetY + 0.5 + (imagePosition.y * 0.01) - 0.15}
              width="0.3"
              height="0.3"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="0.04"
              style={{ cursor: "ne-resize" }}
              className="resize-handle-ne"
            />
            <rect
              x={bannerOffsetX + 0.5 + (imagePosition.x * 0.01) - 0.15}
              y={bannerOffsetY + 0.5 + (imagePosition.y * 0.01) + heightIn - 1.15}
              width="0.3"
              height="0.3"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="0.04"
              style={{ cursor: "sw-resize" }}
              className="resize-handle-sw"
            />
            <rect
              x={bannerOffsetX + 0.5 + (imagePosition.x * 0.01) + widthIn - 1.15}
              y={bannerOffsetY + 0.5 + (imagePosition.y * 0.01) + heightIn - 1.15}
              width="0.3"
              height="0.3"
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth="0.04"
              style={{ cursor: "se-resize" }}
              className="resize-handle-se"
            />
          </g>
        )}

        {/* Placeholder when no image */}
        {!imageUrl && !file?.isPdf && (
          <g>
            <rect
              x={bannerOffsetX + 2}
              y={bannerOffsetY + 2}
              width={widthIn - 4}
              height={heightIn - 4}
              fill="#f9fafb"
              stroke="#e5e7eb"
              strokeWidth="0.1"
              strokeDasharray="0.5 0.5"
              rx="0.3"
            />
            <text
              x={bannerOffsetX + widthIn / 2}
              y={bannerOffsetY + heightIn / 2}
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

        <defs>
          <clipPath id="banner-clip">
            <rect
              x={bannerOffsetX + 0.5}
              y={bannerOffsetY + 0.5}
              width={widthIn - 1}
              height={heightIn - 1}
              rx="0.4"
              ry="0.4"
            />
          </clipPath>
        </defs>

        {/* VISTAPRINT-STYLE GROMMETS */}
        {grommetPositions.map((point, index) => (
          <g key={index}>
            <circle
              cx={bannerOffsetX + point.x + 0.05}
              cy={bannerOffsetY + point.y + 0.05}
              r={grommetRadius * 1.2}
              fill="#000000"
              opacity="0.2"
            />
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r={grommetRadius * 1.2}
              fill="#8b9dc3"
              stroke="#4a5568"
              strokeWidth="0.06"
            />
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r={grommetRadius * 0.8}
              fill="white"
              stroke="#9ca3af"
              strokeWidth="0.04"
            />
            <circle
              cx={bannerOffsetX + point.x - grommetRadius * 0.3}
              cy={bannerOffsetY + point.y - grommetRadius * 0.3}
              r={grommetRadius * 0.3}
              fill="white"
              opacity="0.8"
            />
          </g>
        ))}
      </svg>

      {/* PDF Preview Overlay */}
      {file?.isPdf && file.url && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
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

    {/* ENHANCED PROFESSIONAL INFO PANEL */}
    <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6 shadow-md">
      <div className="flex flex-wrap items-center gap-6 w-full">
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-700 font-semibold">Banner Size:</span>
          <span className="text-lg font-bold text-blue-900 bg-blue-200 px-3 py-2 rounded-lg whitespace-nowrap">
            {widthIn}″ × {heightIn}″
          </span>
        </div>

        {grommetPositions.length > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-gray-700 font-semibold">Grommets:</span>
            <span className="text-lg font-bold text-green-900 bg-green-200 px-3 py-2 rounded-lg whitespace-nowrap">
              {grommetPositions.length} total
            </span>
          </div>
        )}

        {file && (
          <div className="flex items-center gap-3 min-w-0 max-w-xs">
            <div className="flex items-center gap-2 flex-shrink-0">
              {file.isPdf ? (
                <FileText className="h-5 w-5 text-red-600" />
              ) : (
                <Image className="h-5 w-5 text-blue-600" />
              )}
              <span className="text-sm text-gray-700 font-semibold">File:</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-900 truncate max-w-[150px]" title={file.name}>
                {file.name}
              </div>
              <div className="text-xs text-gray-600 truncate max-w-[150px]">
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
