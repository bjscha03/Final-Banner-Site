import React from 'react';
import { Grommets } from '@/store/quote';

interface PrintGuidelinesProps {
  widthIn: number;
  heightIn: number;
  grommets: Grommets;
  className?: string;
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
  const m = 2.5; // 2.5 inch margin from edges
  const corners = cornerPoints(w, h, m);
  const [TL, TR, BL, BR] = corners;
  let pts: Point[] = [];

  const addCorners = (sides: string[]) => {
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
  
  // Add midpoints along edges
  for (const x of midpoints(w, m, s)) {
    pts.push({ x, y: m });          // top
    pts.push({ x, y: h - m });      // bottom
  }
  
  for (const y of midpoints(h, m, s)) {
    pts.push({ x: m, y });          // left
    pts.push({ x: w - m, y });      // right
  }
  
  return dedupe(pts);
}

const PrintGuidelines: React.FC<PrintGuidelinesProps> = ({
  widthIn,
  heightIn,
  grommets,
  className = ''
}) => {
  // Calculate grommet positions
  const grommetPositions = React.useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} style={{ zIndex: 20 }}>
      {/* Main SVG for guidelines and grommets */}
      <svg 
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${widthIn} ${heightIn}`}
        preserveAspectRatio="none"
        style={{ zIndex: 25 }}
      >
        {/* Bleed Line (outer, red dashed) */}
        <rect 
          x={-0.125} 
          y={-0.125} 
          width={widthIn + 0.25} 
          height={heightIn + 0.25} 
          fill="none" 
          stroke="#dc2626" 
          strokeWidth="2"
          strokeDasharray="0.3,0.2"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Safety Line (inner, green dashed) */}
        <rect 
          x={0.25} 
          y={0.25} 
          width={widthIn - 0.5} 
          height={heightIn - 0.5} 
          fill="none" 
          stroke="#16a34a" 
          strokeWidth="2"
          strokeDasharray="0.3,0.2"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Print Area (actual banner size, solid cyan) */}
        <rect 
          x={0} 
          y={0} 
          width={widthIn} 
          height={heightIn} 
          fill="none" 
          stroke="#0891b2" 
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {/* Grommets */}
        {grommetPositions.map((point, index) => (
          <g key={index}>
            {/* Grommet outer ring */}
            <circle
              cx={point.x}
              cy={point.y}
              r={0.2}
              fill="#6b7280"
              stroke="#374151"
              strokeWidth="0.03"
            />
            {/* Grommet inner hole */}
            <circle
              cx={point.x}
              cy={point.y}
              r={0.1}
              fill="#ffffff"
              stroke="#9ca3af"
              strokeWidth="0.02"
            />
          </g>
        ))}
      </svg>

      {/* Corner Resize Handles - Positioned at exact print area corners */}
      <div className="absolute inset-0" style={{ zIndex: 35 }}>
        {/* Top-left corner */}
        <div
          className="absolute w-8 h-8 bg-black border-2 border-white rounded-full cursor-nw-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-16px',
            top: '-16px'
          }}
        />
        
        {/* Top-right corner */}
        <div
          className="absolute w-8 h-8 bg-black border-2 border-white rounded-full cursor-ne-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-16px',
            top: '-16px'
          }}
        />
        
        {/* Bottom-left corner */}
        <div
          className="absolute w-8 h-8 bg-black border-2 border-white rounded-full cursor-sw-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-16px',
            bottom: '-16px'
          }}
        />
        
        {/* Bottom-right corner */}
        <div
          className="absolute w-8 h-8 bg-black border-2 border-white rounded-full cursor-se-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-16px',
            bottom: '-16px'
          }}
        />
      </div>

      {/* Measurement Labels - Positioned outside the bleed area */}
      <div className="absolute inset-0" style={{ zIndex: 30 }}>
        {/* Width measurement (bottom center) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded-md shadow-md border border-gray-300"
          style={{
            left: '50%',
            bottom: '-45px',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap'
          }}
        >
          {widthIn}"
        </div>

        {/* Height measurement (left center, rotated) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded-md shadow-md border border-gray-300"
          style={{
            left: '-55px',
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            transformOrigin: 'center',
            whiteSpace: 'nowrap'
          }}
        >
          {heightIn}"
        </div>
      </div>

      {/* Legend - Clean positioning in top-right */}
      <div 
        className="absolute bg-white rounded-lg p-3 shadow-lg border border-gray-300"
        style={{
          top: '12px',
          right: '12px',
          zIndex: 40,
          minWidth: '140px'
        }}
      >
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <svg width="20" height="3" className="flex-shrink-0">
              <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="#16a34a" strokeWidth="2" strokeDasharray="4,2"/>
            </svg>
            <span className="font-semibold text-green-700">Safety Area</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="20" height="3" className="flex-shrink-0">
              <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="#dc2626" strokeWidth="2" strokeDasharray="4,2"/>
            </svg>
            <span className="font-semibold text-red-700">Bleed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintGuidelines;
