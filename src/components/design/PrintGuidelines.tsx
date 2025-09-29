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
    <div className={`relative ${className}`}>
      {/* Print Guidelines Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Bleed Line (outer, red dashed) */}
        <div 
          className="absolute border-2 border-dashed border-red-500"
          style={{
            left: '-3%',
            top: '-3%',
            width: '106%',
            height: '106%',
            zIndex: 20
          }}
        />
        
        {/* Safety Line (inner, green dashed) */}
        <div 
          className="absolute border-2 border-dashed border-green-500"
          style={{
            left: '5%',
            top: '5%',
            width: '90%',
            height: '90%',
            zIndex: 20
          }}
        />

        {/* Print Area (actual banner size, solid cyan) */}
        <div 
          className="absolute border-2 border-solid border-cyan-500"
          style={{
            left: '0%',
            top: '0%',
            width: '100%',
            height: '100%',
            zIndex: 20
          }}
        />
      </div>

      {/* Corner Resize Handles */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top-left */}
        <div
          className="absolute w-8 h-8 bg-black border-3 border-white rounded-full cursor-nw-resize shadow-xl hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-4px',
            top: '-4px',
            zIndex: 30
          }}
        />
        
        {/* Top-right */}
        <div
          className="absolute w-8 h-8 bg-black border-3 border-white rounded-full cursor-ne-resize shadow-xl hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-4px',
            top: '-4px',
            zIndex: 30
          }}
        />
        
        {/* Bottom-left */}
        <div
          className="absolute w-8 h-8 bg-black border-3 border-white rounded-full cursor-sw-resize shadow-xl hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            left: '-4px',
            bottom: '-4px',
            zIndex: 30
          }}
        />
        
        {/* Bottom-right */}
        <div
          className="absolute w-8 h-8 bg-black border-3 border-white rounded-full cursor-se-resize shadow-xl hover:bg-gray-800 transition-colors pointer-events-auto"
          style={{
            right: '-4px',
            bottom: '-4px',
            zIndex: 30
          }}
        />
      </div>

      {/* Measurement Labels */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Width measurement (bottom) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white/95 px-3 py-1 rounded shadow-lg border"
          style={{
            left: '50%',
            bottom: '-40px',
            transform: 'translateX(-50%)',
            zIndex: 25
          }}
        >
          {widthIn}"
        </div>

        {/* Height measurement (left) */}
        <div
          className="absolute flex items-center justify-center text-sm font-bold text-gray-800 bg-white/95 px-3 py-1 rounded shadow-lg border"
          style={{
            left: '-50px',
            top: '50%',
            transform: 'translateY(-50%) rotate(-90deg)',
            transformOrigin: 'center',
            zIndex: 25
          }}
        >
          {heightIn}"
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-xl border border-gray-200 z-25 pointer-events-none">
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-green-500"></div>
            <span className="font-semibold text-green-700">Safety Area</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-0.5 border-t-2 border-dashed border-red-500"></div>
            <span className="font-semibold text-red-700">Bleed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintGuidelines;
