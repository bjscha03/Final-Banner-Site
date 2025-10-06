import React, { useMemo } from 'react';
import { Grommets } from '@/store/quote';
import { FileText, Image, Loader2 } from 'lucide-react';
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
  imageScale?: number;  onImageMouseDown?: (e: React.MouseEvent) => void;
  onImageTouchStart?: (e: React.TouchEvent) => void;
  isDraggingImage?: boolean;
  isUploading?: boolean;}

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
  imageScale = 1,  onImageMouseDown,
  onImageTouchStart,
  isDraggingImage = false,
  isUploading = false,}) => {
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
  const BLEED_SIZE = 0.25; // VistaPrint standard bleed
  const SAFETY_MARGIN = 0.75; // VistaPrint safety zone
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
      <div className="relative bg-gray-50 p-8 rounded-2xl overflow-hidden" style={{height: "500px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center"}}>
        {/* Loading Spinner Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-2xl">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-blue-700">Processing file...</p>
            </div>
          </div>
        )}        <svg
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="border-2 border-gray-400 rounded-xl bg-white shadow-lg"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto"
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

        {/* PROFESSIONAL PRINT GUIDELINES - VISTAPRINT STYLE */}
        

        {/* Safety Area - Enhanced with professional styling */}
        <g className="safety-guidelines">
          <rect
            x={bannerOffsetX + SAFETY_MARGIN}
            y={bannerOffsetY + SAFETY_MARGIN}
            width={widthIn - (SAFETY_MARGIN * 2)}
            height={heightIn - (SAFETY_MARGIN * 2)}
            fill="none"
            stroke="#0891b2"
            strokeWidth="0.12"
            strokeDasharray="0.4 0.2"
            opacity="0.85"
          />
          
          {/* Safety corner markers */}
          <g stroke="#0891b2" strokeWidth="0.08" fill="none" opacity="0.7">
            <path d={`M ${bannerOffsetX + SAFETY_MARGIN} ${bannerOffsetY + SAFETY_MARGIN + 0.4} L ${bannerOffsetX + SAFETY_MARGIN} ${bannerOffsetY + SAFETY_MARGIN} L ${bannerOffsetX + SAFETY_MARGIN + 0.4} ${bannerOffsetY + SAFETY_MARGIN}`} />
            <path d={`M ${bannerOffsetX + widthIn - SAFETY_MARGIN - 0.4} ${bannerOffsetY + SAFETY_MARGIN} L ${bannerOffsetX + widthIn - SAFETY_MARGIN} ${bannerOffsetY + SAFETY_MARGIN} L ${bannerOffsetX + widthIn - SAFETY_MARGIN} ${bannerOffsetY + SAFETY_MARGIN + 0.4}`} />
            <path d={`M ${bannerOffsetX + SAFETY_MARGIN} ${bannerOffsetY + heightIn - SAFETY_MARGIN - 0.4} L ${bannerOffsetX + SAFETY_MARGIN} ${bannerOffsetY + heightIn - SAFETY_MARGIN} L ${bannerOffsetX + SAFETY_MARGIN + 0.4} ${bannerOffsetY + heightIn - SAFETY_MARGIN}`} />
            <path d={`M ${bannerOffsetX + widthIn - SAFETY_MARGIN - 0.4} ${bannerOffsetY + heightIn - SAFETY_MARGIN} L ${bannerOffsetX + widthIn - SAFETY_MARGIN} ${bannerOffsetY + heightIn - SAFETY_MARGIN} L ${bannerOffsetX + widthIn - SAFETY_MARGIN} ${bannerOffsetY + heightIn - SAFETY_MARGIN - 0.4}`} />
          </g>
          
          {/* Safety labels */}
          <text x={bannerOffsetX + widthIn/2} y={bannerOffsetY + SAFETY_MARGIN - 0.15} textAnchor="middle" fontSize="0.35" fill="#2563eb" fontWeight="700" opacity="0.9">
            BLEED AREA
          </text>
          <text x={bannerOffsetX + widthIn/2} y={bannerOffsetY + heightIn - SAFETY_MARGIN + 0.4} textAnchor="middle" fontSize="0.25" fill="#2563eb" fontWeight="600" opacity="0.7">
            Extend artwork to this line
          </text>
        </g>

        {/* Print area outline - the actual banner dimensions */}
        <rect
          x={bannerOffsetX}
          y={bannerOffsetY}
          width={widthIn}
          height={heightIn}
          fill="none"
          stroke="#1f2937"
          strokeWidth="0.08"
          opacity="0.6"
        />
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

        {/* Image if provided - Extended to bleed area */}
        {(imageUrl || (file?.isPdf && file?.url)) && (
          <>
          <image key={imageUrl || file?.url}
            href={imageUrl || file?.url}
            x={RULER_HEIGHT + (bleedWidth - bleedWidth * imageScale) / 2 + (imagePosition.x * 0.01)}
            y={RULER_HEIGHT + (bleedHeight - bleedHeight * imageScale) / 2 + (imagePosition.y * 0.01)}
            width={bleedWidth * (imageScale || 1)}
            height={bleedHeight * (imageScale || 1)}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#bleed-clip)"
            style={{
              cursor: isDraggingImage ? 'grabbing' : 'grab',
              userSelect: 'none'
            }}
            onMouseDown={onImageMouseDown}
            onTouchStart={onImageTouchStart}
          />

            {/* Resize Handles - Only show when not dragging */}
            {!isDraggingImage && (() => {
              const imgX = RULER_HEIGHT + (bleedWidth - bleedWidth * imageScale) / 2 + (imagePosition.x * 0.01);
              const imgY = RULER_HEIGHT + (bleedHeight - bleedHeight * imageScale) / 2 + (imagePosition.y * 0.01);
              const imgWidth = bleedWidth * (imageScale || 1);
              const imgHeight = bleedHeight * (imageScale || 1);
              const handleSize = Math.min(0.6, Math.max(widthIn, heightIn) * 0.03);
              
              const handles = [
                { id: 'nw', x: imgX, y: imgY, cursor: 'nwse-resize' },
                { id: 'ne', x: imgX + imgWidth, y: imgY, cursor: 'nesw-resize' },
                { id: 'sw', x: imgX, y: imgY + imgHeight, cursor: 'nesw-resize' },
                { id: 'se', x: imgX + imgWidth, y: imgY + imgHeight, cursor: 'nwse-resize' },
              ];
              
              return (
                <g className="resize-handles">
                  {handles.map(handle => (
                    <g key={handle.id} className="resize-handle-group" data-handle={handle.id}>
                      {/* Outer glow for visibility */}
                      <circle
                        cx={handle.x}
                        cy={handle.y}
                        r={handleSize * 1.5}
                        fill="#3b82f6"
                        opacity="0.2"
                        className="resize-handle-glow"
                        data-handle={handle.id}
                      />
                      {/* Main handle circle */}
                      <circle
                        cx={handle.x}
                        cy={handle.y}
                        r={handleSize}
                        fill="#ffffff"
                        stroke="#3b82f6"
                        strokeWidth="0.08"
                        className="resize-handle"
                        data-handle={handle.id}
                        style={{ cursor: handle.cursor }}
                      />
                      {/* Inner dot for better visibility */}
                      <circle
                        cx={handle.x}
                        cy={handle.y}
                        r={handleSize * 0.4}
                        fill="#3b82f6"
                        className="resize-handle-dot"
                        data-handle={handle.id}
                        style={{ cursor: handle.cursor, pointerEvents: 'none' }}
                      />
                    </g>
                  ))}
                </g>
              );
            })()}
          </>
        )}

        {/* Safety Area (Red Line) - Rendered after image for visibility */}
        <g className="safety-guidelines-red">
          <rect
            x={RULER_HEIGHT}
            y={RULER_HEIGHT}
            width={bleedWidth}
            height={bleedHeight}
            fill="none"
            stroke="#e53e3e"
            strokeWidth="0.15"
            strokeDasharray="0.3 0.15"
            opacity="0.9"
          />

          {/* Safety corner markers */}
          <g stroke="#e53e3e" strokeWidth="0.1" fill="none" opacity="0.8">
            <path d={`M ${RULER_HEIGHT} ${RULER_HEIGHT + 0.5} L ${RULER_HEIGHT} ${RULER_HEIGHT} L ${RULER_HEIGHT + 0.5} ${RULER_HEIGHT}`} />
            <path d={`M ${RULER_HEIGHT + bleedWidth - 0.5} ${RULER_HEIGHT} L ${RULER_HEIGHT + bleedWidth} ${RULER_HEIGHT} L ${RULER_HEIGHT + bleedWidth} ${RULER_HEIGHT + 0.5}`} />
            <path d={`M ${RULER_HEIGHT} ${RULER_HEIGHT + bleedHeight - 0.5} L ${RULER_HEIGHT} ${RULER_HEIGHT + bleedHeight} L ${RULER_HEIGHT + 0.5} ${RULER_HEIGHT + bleedHeight}`} />
            <path d={`M ${RULER_HEIGHT + bleedWidth - 0.5} ${RULER_HEIGHT + bleedHeight} L ${RULER_HEIGHT + bleedWidth} ${RULER_HEIGHT + bleedHeight} L ${RULER_HEIGHT + bleedWidth} ${RULER_HEIGHT + bleedHeight - 0.5}`} />
          </g>

          {/* Safety labels */}
          <text x={RULER_HEIGHT + bleedWidth/2} y={RULER_HEIGHT - 0.15} textAnchor="middle" fontSize="0.35" fill="#dc2626" fontWeight="700" opacity="0.9">
            SAFETY AREA
          </text>
          <text x={RULER_HEIGHT + bleedWidth/2} y={RULER_HEIGHT + bleedHeight + 0.4} textAnchor="middle" fontSize="0.25" fill="#dc2626" fontWeight="600" opacity="0.7">
            Keep important content within this area
          </text>
        </g>
        {/* Placeholder when no image */}
        {!imageUrl && !(file?.isPdf && file?.url) && (
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
          <clipPath id="bleed-clip">
            <rect
              x={RULER_HEIGHT}
              y={RULER_HEIGHT}
              width={bleedWidth}
              height={bleedHeight}
              rx="0.4"
              ry="0.4"
            />
          </clipPath>        </defs>

        {/* PROFESSIONAL VISTAPRINT-STYLE GROMMETS */}
        {grommetPositions.map((point, index) => (
          <g key={index}>
            {/* Drop shadow */}
            <circle
              cx={bannerOffsetX + point.x + 0.08}
              cy={bannerOffsetY + point.y + 0.08}
              r={grommetRadius * 1.3}
              fill="#000000"
              opacity="0.15"
            />
            
            {/* Outer metallic ring */}
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r={grommetRadius * 1.3}
              fill="url(#grommetGradient)"
              stroke="#2d3748"
              strokeWidth="0.08"
            />
            
            {/* Inner hole */}
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r={grommetRadius * 0.7}
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.04"
            />
            
            {/* Target-style crosshairs */}
            <g opacity="0.6">
              <line
                x1={bannerOffsetX + point.x - grommetRadius * 0.5}
                y1={bannerOffsetY + point.y}
                x2={bannerOffsetX + point.x + grommetRadius * 0.5}
                y2={bannerOffsetY + point.y}
                stroke="#718096"
                strokeWidth="0.02"
              />
              <line
                x1={bannerOffsetX + point.x}
                y1={bannerOffsetY + point.y - grommetRadius * 0.5}
                x2={bannerOffsetX + point.x}
                y2={bannerOffsetY + point.y + grommetRadius * 0.5}
                stroke="#718096"
                strokeWidth="0.02"
              />
            </g>
            
            {/* Center dot */}
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r={grommetRadius * 0.15}
              fill="#4a5568"
              opacity="0.8"
            />
            
            {/* Highlight for 3D effect */}
            <circle
              cx={bannerOffsetX + point.x - grommetRadius * 0.4}
              cy={bannerOffsetY + point.y - grommetRadius * 0.4}
              r={grommetRadius * 0.3}
              fill="#ffffff"
              opacity="0.4"
            />
          </g>
        ))}
        
        {/* Gradient definitions for grommets */}
        <defs>
          <radialGradient id="grommetGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#a0aec0" />
            <stop offset="100%" stopColor="#4a5568" />
          </radialGradient>
        </defs>
      </svg>

      </div>

    {/* ENHANCED PROFESSIONAL INFO PANEL */}
    <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-4 w-full">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-700 font-semibold">Banner Size:</span>
          <span className="text-sm font-bold text-blue-900 bg-blue-200 px-2 py-1 rounded whitespace-nowrap">
            {widthIn}″ × {heightIn}″
          </span>
        </div>

        {grommetPositions.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-700 font-semibold">Grommets:</span>
            <span className="text-sm font-bold text-green-900 bg-green-200 px-2 py-1 rounded whitespace-nowrap">
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
              <span className="text-xs text-gray-700 font-semibold">File:</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-gray-900 truncate max-w-[150px]" title={file.name}>
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
