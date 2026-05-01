import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Maximize2, Minimize2, Lock, Unlock } from 'lucide-react';

/**
 * PR3 — Modern Canva-style artwork editor used inside the live preview canvas.
 *
 * Replaces the old zoom +/- + magnify interaction. Provides:
 *  - Click/tap to select artwork (bounding box only when selected)
 *  - Smooth drag to reposition (mouse + touch)
 *  - Four corner handles for resize
 *      * Constrain proportions ON  → uniform scale (default)
 *      * Constrain proportions OFF → freeform per-axis scale (scaleX, scaleY)
 *  - Selection-only controls: Reset · Fit · Fill · Constrain toggle
 *  - Mobile-safe hit areas (44px) via invisible padding around the visible nub.
 *
 * The page (Design / GoogleAdsBanner) owns the transform state and feeds it
 * here as a controlled component. This keeps per-product state isolation
 * intact (banner, yard sign, car magnet each store their own snapshot).
 *
 * IMPORTANT: this component does NOT modify the cart or print pipeline.
 * It only renders + emits new transform values. The page is responsible
 * for forwarding scaleX/scaleY/position into the cart payload so the
 * server PDF render reflects the on-screen artwork EXACTLY.
 */

export type ArtworkTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export interface ArtworkPreviewEditorProps {
  src: string;
  alt?: string;
  /** Padding-bottom percent string (e.g. "50%") used for canvas aspect ratio. */
  paddingPct: string;
  value: ArtworkTransform;
  onChange: (next: ArtworkTransform) => void;
  constrain: boolean;
  onConstrainChange: (next: boolean) => void;
  /** Optional grommet/SVG overlay rendered above the artwork. */
  overlay?: React.ReactNode;
  /** Forwarded ref for the canvas surface — used by the page to convert
   *  pixel positions to percentages when serializing to the cart payload. */
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** Brief drag hint shown when artwork was just uploaded. */
  showDragHint?: boolean;
  className?: string;
  /** Show the selection box & controls automatically as soon as artwork
   *  is loaded. Defaults to true so this works with the existing UX. */
  autoSelect?: boolean;
  /** When true, render compact controls (used inside Confirm modal). */
  compactControls?: boolean;
  /** Optional inline style for the canvas surface (border/shadow/bg). */
  canvasStyle?: React.CSSProperties;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CLAMP_MIN = 0.2;
const CLAMP_MAX = 5;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const ArtworkPreviewEditor: React.FC<ArtworkPreviewEditorProps> = ({
  src,
  alt = 'Artwork preview',
  paddingPct,
  value,
  onChange,
  constrain,
  onConstrainChange,
  overlay,
  containerRef,
  showDragHint = false,
  className,
  autoSelect = true,
  compactControls = false,
  canvasStyle,
}) => {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (containerRef) containerRef.current = node;
    },
    [containerRef],
  );

  const [selected, setSelected] = useState<boolean>(autoSelect);
  useEffect(() => {
    if (autoSelect) setSelected(true);
  }, [autoSelect, src]);

  // Track image natural size so Fill can compute the correct cover scale
  // for the current aspect ratio.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth && t.naturalHeight) {
      setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
    }
  }, []);

  // ------- Drag state (refs to avoid re-render storms) -------
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const resizeRef = useRef<{
    active: boolean;
    corner: Corner;
    startMouseX: number;
    startMouseY: number;
    centerX: number;
    centerY: number;
    canvasW: number;
    canvasH: number;
    startScaleX: number;
    startScaleY: number;
    startX: number;
    startY: number;
  } | null>(null);

  // Keep latest value in a ref so global mouse/touch listeners pick it up.
  const valueRef = useRef(value);
  valueRef.current = value;
  const constrainRef = useRef(constrain);
  constrainRef.current = constrain;

  // ------- Drag handlers -------
  const beginDrag = useCallback((clientX: number, clientY: number) => {
    dragRef.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      origX: valueRef.current.x,
      origY: valueRef.current.y,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      // Don't trigger drag from a resize handle.
      const target = e.target as HTMLElement;
      if (target.dataset && target.dataset.handle) return;
      e.preventDefault();
      setSelected(true);
      beginDrag(e.clientX, e.clientY);
    },
    [beginDrag],
  );

  // Global pointer move/up so dragging keeps working even when the cursor
  // briefly leaves the canvas (matches Canva-style UX expectations).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (resizeRef.current?.active) {
        const r = resizeRef.current;
        const dx = e.clientX - r.startMouseX;
        const dy = e.clientY - r.startMouseY;
        // Distance from center for the dragged corner — sign aware.
        // The corner's natural offset from the canvas center is
        // ±canvasW/2 * startScaleX (or H * startScaleY) depending on which
        // corner. After a drag of (dx, dy), the new corner offset becomes
        // that ± dx (or dy). Solve for new scale.
        const sgnX = r.corner === 'tr' || r.corner === 'br' ? 1 : -1;
        const sgnY = r.corner === 'bl' || r.corner === 'br' ? 1 : -1;
        const startCornerX = (sgnX * r.canvasW * r.startScaleX) / 2;
        const startCornerY = (sgnY * r.canvasH * r.startScaleY) / 2;
        const newCornerX = startCornerX + dx;
        const newCornerY = startCornerY + dy;
        let newScaleX = clamp((sgnX * 2 * newCornerX) / r.canvasW, CLAMP_MIN, CLAMP_MAX);
        let newScaleY = clamp((sgnY * 2 * newCornerY) / r.canvasH, CLAMP_MIN, CLAMP_MAX);
        if (constrainRef.current) {
          // Pick the axis with the larger relative change so the user feels
          // a single uniform scale.
          const ratioX = newScaleX / r.startScaleX;
          const ratioY = newScaleY / r.startScaleY;
          const ratio = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
          newScaleX = clamp(r.startScaleX * ratio, CLAMP_MIN, CLAMP_MAX);
          newScaleY = clamp(r.startScaleY * ratio, CLAMP_MIN, CLAMP_MAX);
        }
        onChange({ x: r.startX, y: r.startY, scaleX: newScaleX, scaleY: newScaleY });
        return;
      }
      if (dragRef.current.active) {
        const d = dragRef.current;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        onChange({ ...valueRef.current, x: d.origX + dx, y: d.origY + dy });
      }
    };
    const onUp = () => {
      dragRef.current.active = false;
      if (resizeRef.current) resizeRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onChange]);

  // Begin a resize from a corner handle.
  const beginResize = useCallback(
    (corner: Corner) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const node = internalRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      resizeRef.current = {
        active: true,
        corner,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        canvasW: rect.width,
        canvasH: rect.height,
        startScaleX: valueRef.current.scaleX,
        startScaleY: valueRef.current.scaleY,
        startX: valueRef.current.x,
        startY: valueRef.current.y,
      };
      setSelected(true);
    },
    [],
  );

  // Keyboard activation for resize handles (basic accessibility).
  const onHandleKeyDown = useCallback(
    (corner: Corner) => (e: React.KeyboardEvent) => {
      const STEP = e.shiftKey ? 0.1 : 0.02;
      let { scaleX, scaleY } = valueRef.current;
      let changed = false;
      const grow = e.key === '+' || e.key === '=' || e.key === 'ArrowUp' || e.key === 'ArrowRight';
      const shrink =
        e.key === '-' || e.key === '_' || e.key === 'ArrowDown' || e.key === 'ArrowLeft';
      if (grow || shrink) {
        e.preventDefault();
        const delta = grow ? STEP : -STEP;
        scaleX = clamp(scaleX + delta, CLAMP_MIN, CLAMP_MAX);
        if (constrainRef.current) {
          scaleY = clamp(scaleY + delta, CLAMP_MIN, CLAMP_MAX);
        } else if (corner === 'tl' || corner === 'tr' || corner === 'bl' || corner === 'br') {
          scaleY = clamp(scaleY + delta, CLAMP_MIN, CLAMP_MAX);
        }
        changed = true;
      }
      if (changed) onChange({ ...valueRef.current, scaleX, scaleY });
    },
    [onChange],
  );

  // Controls
  const reset = useCallback(() => {
    onChange({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  }, [onChange]);

  const fit = useCallback(() => {
    // The artwork <img> uses object-fit: contain, so scale=1 already fits.
    onChange({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  }, [onChange]);

  const fill = useCallback(() => {
    const node = internalRef.current;
    if (!node || !naturalSize) {
      // Fallback: just zoom up uniformly.
      onChange({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });
      return;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      onChange({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });
      return;
    }
    const canvasAspect = rect.width / rect.height;
    const imgAspect = naturalSize.w / naturalSize.h;
    // With object-contain the rendered image dimensions are the largest box
    // that fits within the canvas while preserving imgAspect. The inverse
    // factor needed to make that box cover the canvas is:
    let s: number;
    if (imgAspect > canvasAspect) {
      // Image is wider than canvas → contained height = rect.height,
      // contained width = rect.height * imgAspect, which exceeds canvas w.
      // To cover, scale = canvasAspect (width/height) / imgAspect inverted.
      s = canvasAspect / imgAspect; // <1, would shrink; we need the inverse direction.
      // Cover scale = canvas.height / (canvas.width / imgAspect) =
      //              imgAspect / canvasAspect.
      s = imgAspect / canvasAspect;
    } else {
      s = canvasAspect / imgAspect;
    }
    s = clamp(s, 1, CLAMP_MAX);
    onChange({ x: 0, y: 0, scaleX: s, scaleY: s });
  }, [onChange, naturalSize]);

  const toggleConstrain = useCallback(() => {
    const next = !constrain;
    onConstrainChange(next);
    // When turning ON, snap scaleY back to scaleX so the artwork is no
    // longer skewed.
    if (next && valueRef.current.scaleX !== valueRef.current.scaleY) {
      onChange({ ...valueRef.current, scaleY: valueRef.current.scaleX });
    }
  }, [constrain, onConstrainChange, onChange]);

  // Visible nub size (the colored square). Hit area is 44px via invisible
  // padding wrapper.
  const nubSize = compactControls ? 14 : 16;
  const hitSize = 44;

  const handlePositions: Record<Corner, React.CSSProperties> = {
    tl: { top: 0, left: 0, transform: 'translate(-50%, -50%)', cursor: 'nwse-resize' },
    tr: { top: 0, right: 0, transform: 'translate(50%, -50%)', cursor: 'nesw-resize' },
    bl: { bottom: 0, left: 0, transform: 'translate(-50%, 50%)', cursor: 'nesw-resize' },
    br: { bottom: 0, right: 0, transform: 'translate(50%, 50%)', cursor: 'nwse-resize' },
  };

  return (
    <div className={'w-full ' + (className || '')}>
      {/* Canvas surface — provides the print aspect ratio via paddingBottom.
          Only this layer disables touch-action so the page can still
          scroll outside on mobile. */}
      <div
        ref={setContainerRef}
        className="relative w-full select-none overflow-hidden"
        style={{
          paddingBottom: paddingPct,
          touchAction: 'none',
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
          cursor: selected ? 'move' : 'pointer',
          ...canvasStyle,
        }}
        onPointerDown={onPointerDown}
        onClick={(e) => {
          if (!dragRef.current.active) setSelected(true);
          e.stopPropagation();
        }}
      >
        {/* Artwork transform wrapper. translate3d + non-uniform scale. */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `translate3d(${value.x}px, ${value.y}px, 0) scale(${value.scaleX}, ${value.scaleY})`,
            transformOrigin: '50% 50%',
            willChange: 'transform',
          }}
        >
          <img
            src={src}
            alt={alt}
            onLoad={onImgLoad}
            draggable={false}
            className="absolute inset-0 w-full h-full pointer-events-none object-contain"
          />
          {/* Selection bounding box + handles (only when selected) */}
          {selected && (
            <>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  outline: '1.5px solid rgba(249, 115, 22, 0.95)',
                  outlineOffset: '-1.5px',
                  zIndex: 15,
                }}
                aria-hidden="true"
              />
              {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
                <div
                  key={c}
                  data-handle={c}
                  role="button"
                  tabIndex={0}
                  aria-label={`Resize from ${c.replace('t', 'top-').replace('b', 'bottom-').replace('-l', 'left').replace('-r', 'right')} corner`}
                  onPointerDown={beginResize(c)}
                  onKeyDown={onHandleKeyDown(c)}
                  className="absolute pointer-events-auto"
                  style={{
                    width: hitSize,
                    height: hitSize,
                    zIndex: 25,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...handlePositions[c],
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: nubSize,
                      height: nubSize,
                      background: '#ffffff',
                      border: '2px solid rgb(249, 115, 22)',
                      borderRadius: 3,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                      display: 'block',
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Drag hint */}
        {showDragHint && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
            style={{ animation: 'fadeOut 0.5s ease-out 1.5s forwards' }}
          >
            <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
              Drag to reposition · Drag corners to resize
            </span>
          </div>
        )}

        {/* Grommets / other overlays */}
        {overlay}
      </div>

      {/* Selection-only controls. Hidden until the user has selected the
          artwork so the canvas stays clean while browsing. */}
      {selected && (
        <div className="flex items-center justify-center mt-3">
          <div
            className={
              'inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-gray-200/70 ' +
              (compactControls ? 'px-2 py-1' : 'px-3 py-1.5')
            }
          >
            <button
              type="button"
              onClick={fit}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
              aria-label="Fit artwork to canvas"
              title="Fit to canvas"
            >
              <Minimize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Fit</span>
            </button>
            <button
              type="button"
              onClick={fill}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
              aria-label="Fill canvas with artwork"
              title="Fill canvas"
            >
              <Maximize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Fill</span>
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
              aria-label="Reset artwork position and scale"
              title="Reset"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <div className="w-px h-4 bg-gray-200" aria-hidden="true" />
            <button
              type="button"
              onClick={toggleConstrain}
              aria-pressed={constrain}
              className={
                'inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-full transition-colors ' +
                (constrain
                  ? 'text-orange-600 hover:bg-orange-50'
                  : 'text-gray-600 hover:bg-gray-100')
              }
              title={constrain ? 'Constrain proportions: ON' : 'Constrain proportions: OFF (freeform)'}
            >
              {constrain ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              <span className="hidden sm:inline">{constrain ? 'Locked' : 'Free'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtworkPreviewEditor;
