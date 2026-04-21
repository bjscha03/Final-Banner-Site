import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

type Point = { x: number; y: number };

type BannerInlinePreviewSurfaceProps = {
  widthIn: number;
  heightIn: number;
  imageUrl: string;
  imgPos: { x: number; y: number };
  imgScale: number;
  isDraggingPreview: boolean;
  isLgScreen: boolean;
  showDragHint: boolean;
  grommetPoints: Point[];
  previewContainerRef: React.RefObject<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onMouseMove: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd: React.TouchEventHandler<HTMLDivElement>;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
};

const BannerInlinePreviewSurface: React.FC<BannerInlinePreviewSurfaceProps> = ({
  widthIn,
  heightIn,
  imageUrl,
  imgPos,
  imgScale,
  isDraggingPreview,
  isLgScreen,
  showDragHint,
  grommetPoints,
  previewContainerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onZoomOut,
  onZoomIn,
  onReset,
}) => {
  const safeWidth = widthIn || 96;
  const safeHeight = heightIn || 48;
  const aspectRatio = safeWidth / safeHeight;
  const maxHeight = isLgScreen ? 400 : 260;
  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: `${Math.round(maxHeight * aspectRatio)}px`,
  };
  const paddingPct = `${(safeHeight / safeWidth) * 100}%`;

  return (
    <div className="rounded-xl p-4 md:p-6 max-w-full overflow-hidden" style={{ background: 'linear-gradient(180deg, #f5f6f8 0%, #e9edf2 100%)' }}>
      <div className="mx-auto" style={wrapperStyle}>
        <div
          ref={previewContainerRef}
          className="relative w-full max-w-full rounded-sm select-none overflow-hidden transition-all duration-300 ease-out"
          style={{
            paddingBottom: paddingPct,
            cursor: isDraggingPreview ? 'grabbing' : 'grab',
            touchAction: 'none',
            backgroundColor: '#fafafa',
            border: '1px solid #e2e5ea',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.6)',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="absolute inset-0 w-full h-full"
            style={{ transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})` }}
          >
            <img
              src={imageUrl}
              alt="Uploaded artwork preview"
              className="absolute inset-0 w-full h-full pointer-events-none object-contain"
              draggable={false}
            />
          </div>
          {showDragHint && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20" style={{ animation: 'fadeOut 0.5s ease-out 1.5s forwards' }}>
              <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
                Drag to reposition • Use buttons to zoom
              </span>
            </div>
          )}
          {grommetPoints.map((pos, idx) => {
            const leftPct = (pos.x / safeWidth) * 100;
            const topPct = (pos.y / safeHeight) * 100;
            const dotSize = Math.max(6, Math.min(12, 180 / Math.max(safeWidth, safeHeight)));
            return (
              <div key={`inline-grommet-${idx}`} className="absolute rounded-full pointer-events-none" style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${dotSize}px`, height: `${dotSize}px`, transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle at 40% 35%, #d1d5db, #6b7280)', border: '1px solid #9ca3af', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25), 0 0.5px 1px rgba(0,0,0,0.15)', zIndex: 10 }}>
                <div className="absolute rounded-full" style={{ left: '50%', top: '50%', width: '45%', height: '45%', transform: 'translate(-50%, -50%)', background: '#374151', border: '0.5px solid #4b5563' }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center mt-3">
        <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm border border-gray-200/60">
          <button onClick={onZoomOut} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom out"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
          <span className="text-xs font-medium text-gray-500 min-w-[3ch] text-center">{Math.round(imgScale * 100)}%</span>
          <button onClick={onZoomIn} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors" aria-label="Zoom in"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={onReset} className="text-xs text-orange-600 hover:text-orange-700 font-medium px-1.5">Reset</button>
        </div>
      </div>
    </div>
  );
};

export default BannerInlinePreviewSurface;
