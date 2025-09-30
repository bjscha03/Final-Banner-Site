import React from 'react';

interface PrintGuidelinesProps {
  widthIn: number;
  heightIn: number;
  className?: string;
}

const PrintGuidelines: React.FC<PrintGuidelinesProps> = ({
  widthIn,
  heightIn,
  className = ''
}) => {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ zIndex: 30 }}>
      {/* Print Guidelines - Using SVG for precise control */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 25 }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Define dashed line patterns */}
        <defs>
          <pattern id="redDash" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="none"/>
            <rect width="4" height="2" fill="#dc2626"/>
          </pattern>
          <pattern id="greenDash" patternUnits="userSpaceOnUse" width="8" height="8">
            <rect width="8" height="8" fill="none"/>
            <rect width="4" height="2" fill="#16a34a"/>
          </pattern>
        </defs>
        
        {/* Bleed Line (outer, red dashed) */}
        <rect 
          x="-5" 
          y="-5" 
          width="110" 
          height="110" 
          fill="none" 
          stroke="#dc2626" 
          strokeWidth="0.8"
          strokeDasharray="3,2"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Safety Line (inner, green dashed) */}
        <rect 
          x="8" 
          y="8" 
          width="84" 
          height="84" 
          fill="none" 
          stroke="#16a34a" 
          strokeWidth="0.8"
          strokeDasharray="3,2"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Print Area (actual banner size, solid cyan) */}
        <rect 
          x="0" 
          y="0" 
          width="100" 
          height="100" 
          fill="none" 
          stroke="#0891b2" 
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Corner Resize Handles - Positioned at exact corners */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 35 }}>
        {/* Top-left corner */}
        <div
          className="absolute w-6 h-6 bg-black border-2 border-white rounded-full cursor-nw-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-12px',
            top: '-12px',
            transform: 'translate(0, 0)'
          }}
        />
        
        {/* Top-right corner */}
        <div
          className="absolute w-6 h-6 bg-black border-2 border-white rounded-full cursor-ne-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-12px',
            top: '-12px',
            transform: 'translate(0, 0)'
          }}
        />
        
        {/* Bottom-left corner */}
        <div
          className="absolute w-6 h-6 bg-black border-2 border-white rounded-full cursor-sw-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-12px',
            bottom: '-12px',
            transform: 'translate(0, 0)'
          }}
        />
        
        {/* Bottom-right corner */}
        <div
          className="absolute w-6 h-6 bg-black border-2 border-white rounded-full cursor-se-resize shadow-lg hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-12px',
            bottom: '-12px',
            transform: 'translate(0, 0)'
          }}
        />
      </div>

      {/* Measurement Labels - Positioned outside the guidelines */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
        {/* Width measurement (bottom center, outside bleed area) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded-md shadow-md border border-gray-300"
          style={{
            left: '50%',
            bottom: '-50px',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap'
          }}
        >
          {widthIn}"
        </div>

        {/* Height measurement (left center, outside bleed area, rotated) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white px-3 py-1 rounded-md shadow-md border border-gray-300"
          style={{
            left: '-60px',
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
        className="absolute bg-white rounded-lg p-3 shadow-lg border border-gray-300 pointer-events-none"
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
              <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="#16a34a" strokeWidth="2" strokeDasharray="3,2"/>
            </svg>
            <span className="font-semibold text-green-700">Safety Area</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="20" height="3" className="flex-shrink-0">
              <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="#dc2626" strokeWidth="2" strokeDasharray="3,2"/>
            </svg>
            <span className="font-semibold text-red-700">Bleed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintGuidelines;
