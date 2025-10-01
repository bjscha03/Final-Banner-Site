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
  imageScale?: number;
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
  imageScale = 1,
  onImageMouseDown,
  onImageTouchStart,
  isDraggingImage = false
}) => {
  const FEATURE_PDF_STATIC_PREVIEW = true;

  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  // Professional VistaPrint-style dimensions
  const RULER_HEIGHT = 1.2;
  const BLEED_SIZE = 0.125;
  const TICK_SIZE = 0.3;
  
  const totalWidth = widthIn + 2 * BLEED_SIZE + 2 * RULER_HEIGHT;
  const totalHeight = heightIn + 2 * BLEED_SIZE + 2 * RULER_HEIGHT;
  
  const bannerOffsetX = RULER_HEIGHT + BLEED_SIZE;
  const bannerOffsetY = RULER_HEIGHT + BLEED_SIZE;

  return (
    <div className={`${className} w-full`}>
      <div className="relative bg-gray-50 p-4 rounded-2xl">
        <svg
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="w-full h-auto border-2 border-gray-400 rounded-xl bg-white shadow-lg cursor-grab"
          style={{
            aspectRatio: `${totalWidth}/${totalHeight}`,
            maxWidth: '100%',
            maxHeight: '500px'
          }}
          onMouseDown={onImageMouseDown}
          onTouchStart={onImageTouchStart}
        >
        {/* PROFESSIONAL PRINT GUIDELINES */}
        <g className="print-rulers">
          <rect x="0" y="0" width={totalWidth} height={RULER_HEIGHT} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.02"/>
          <text x={totalWidth/2} y={RULER_HEIGHT/2} textAnchor="middle" dominantBaseline="middle" fontSize="0.5" fill="#1e293b" fontWeight="600">
            {`${widthIn}"`}
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

        {/* Bleed Area */}
        <rect 
          x={RULER_HEIGHT} 
          y={RULER_HEIGHT} 
          width={widthIn + 2 * BLEED_SIZE} 
          height={heightIn + 2 * BLEED_SIZE} 
          fill="none" 
          stroke="#ef4444" 
          strokeWidth="0.08" 
          strokeDasharray="0.2 0.2"
          opacity="0.7"
        />
        
        {/* Safety Area */}
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

        {/* Corner markers */}
        <g className="corner-markers" opacity="0.8">
          {[
            [bannerOffsetX, bannerOffsetY],
            [bannerOffsetX + widthIn, bannerOffsetY],
            [bannerOffsetX, bannerOffsetY + heightIn],
            [bannerOffsetX + widthIn, bannerOffsetY + heightIn]
          ].map(([x, y], i) => (
            <g key={i}>
              <line x1={x - 0.3} y1={y} x2={x + 0.3} y2={y} stroke="#1f2937" strokeWidth="0.08" opacity="0.6" />
              <line x1={x} y1={y - 0.3} x2={x} y2={y + 0.3} stroke="#1f2937" strokeWidth="0.08" opacity="0.6" />
            </g>
          ))}
        </g>

        {/* Image rendering with drag and resize functionality */}
        {imageUrl && !file?.isPdf && (
          <g className="image-container">
            <image
              href={imageUrl}
              x={bannerOffsetX + imagePosition.x}
              y={bannerOffsetY + imagePosition.y}
              width={widthIn * imageScale}
              height={heightIn * imageScale}
              preserveAspectRatio="xMidYMid slice"
              className={`${isDraggingImage ? 'cursor-grabbing' : 'cursor-grab'} transition-opacity duration-200`}
              style={{ 
                opacity: isDraggingImage ? 0.8 : 1,
                filter: isDraggingImage ? 'brightness(1.1)' : 'none'
              }}
            />
            
            {/* VistaPrint-style Image resize handles */}
            {imageUrl && (
              <g className="resize-handles" opacity={isDraggingImage ? 1 : 0.7}>
                {['nw', 'ne', 'sw', 'se'].map((handle) => {
                  const isLeft = handle.includes('w');
                  const isTop = handle.includes('n');
                  const handleX = bannerOffsetX + imagePosition.x + (isLeft ? 0 : widthIn * imageScale);
                  const handleY = bannerOffsetY + imagePosition.y + (isTop ? 0 : heightIn * imageScale);
                  
                  return (
                    <circle
                      key={handle}
                      cx={handleX}
                      cy={handleY}
                      r="0.15"
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth="0.05"
                      className="resize-handle cursor-nw-resize"
                      data-handle={handle}
                    />
                  );
                })}
              </g>
            )}
          </g>
        )}

        {/* PROFESSIONAL VISTAPRINT-STYLE GROMMETS */}
        {grommetPositions.map((point, index) => (
          <g key={index} className="grommet">
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r="0.25"
              fill="url(#grommetGradient)"
              stroke="#2d3748"
              strokeWidth="0.05"
            />
            <circle
              cx={bannerOffsetX + point.x}
              cy={bannerOffsetY + point.y}
              r="0.15"
              fill="none"
              stroke="#4a5568"
              strokeWidth="0.03"
            />
            {/* Target-style crosshairs */}
            <line
              x1={bannerOffsetX + point.x - 0.1}
              y1={bannerOffsetY + point.y}
              x2={bannerOffsetX + point.x + 0.1}
              y2={bannerOffsetY + point.y}
              stroke="#1f2937"
              strokeWidth="0.02"
              opacity="0.6"
            />
            <line
              x1={bannerOffsetX + point.x}
              y1={bannerOffsetY + point.y - 0.1}
              x2={bannerOffsetX + point.x}
              y2={bannerOffsetY + point.y + 0.1}
              stroke="#1f2937"
              strokeWidth="0.02"
              opacity="0.6"
            />
          </g>
        ))}

        {/* Gradient definitions */}
        <defs>
          <radialGradient id="grommetGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#a0aec0" />
            <stop offset="100%" stopColor="#4a5568" />
          </radialGradient>
        </defs>
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
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-700 font-semibold">Grommets:</span>
          <span className="text-sm font-medium text-indigo-800 bg-indigo-100 px-3 py-2 rounded-lg whitespace-nowrap">
            {grommetPositions.length} total
          </span>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-700 font-semibold">Material:</span>
          <span className="text-sm font-medium text-green-800 bg-green-100 px-3 py-2 rounded-lg whitespace-nowrap">
            13oz Vinyl
          </span>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm text-gray-700 font-semibold">Finish:</span>
          <span className="text-sm font-medium text-purple-800 bg-purple-100 px-3 py-2 rounded-lg whitespace-nowrap">
            Weather Resistant
          </span>
        </div>
      </div>
    </div>
    </div>
  );
};

export default PreviewCanvas;
