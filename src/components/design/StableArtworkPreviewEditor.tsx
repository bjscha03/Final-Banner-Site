import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Maximize2, Minimize2, RotateCcw, Unlink2 } from 'lucide-react';
import { buildCommercePreviewUrl } from '@/lib/commercePreviewUrl';
import {
  dedupePreviewImageSources,
  forgetPreviewImage,
  isTransientPreviewImageUrl,
  type PreviewImageResult,
} from '@/lib/previewImageCache';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import {
  getPreviewCrossOrigin,
  resolveArtworkPreviewImageSrc,
} from './artworkPreviewSource';

export type ArtworkTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export interface ArtworkPreviewEditorProps {
  src: string;
  previewUrl?: string | null;
  productionUrl?: string | null;
  resourceType?: 'image' | 'raw' | string | null;
  mimeType?: string | null;
  alt?: string;
  paddingPct: string;
  value: ArtworkTransform;
  onChange: (next: ArtworkTransform) => void;
  constrain: boolean;
  onConstrainChange: (next: boolean) => void;
  overlay?: React.ReactNode;
  containerRef?: React.MutableRefObject<HTMLDivElement | null>;
  showDragHint?: boolean;
  className?: string;
  autoSelect?: boolean;
  compactControls?: boolean;
  canvasStyle?: React.CSSProperties;
  mobileToolbarContainer?: HTMLElement | null;
  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';
  onRetryPreview?: () => void | Promise<void>;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Size = { w: number; h: number };
type NormalizedPosition = { xPct: number; yPct: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizedPositionByArtwork = new Map<string, NormalizedPosition>();

function isTopmostCanvas(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const top = document.elementFromPoint(x, y);
  return Boolean(top && node.contains(top));
}

const StableArtworkPreviewEditor: React.FC<ArtworkPreviewEditorProps> = ({
  src,
  previewUrl,
  productionUrl,
  resourceType,
  mimeType,
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
  mobileToolbarContainer,
  imageCrossOrigin,
  onRetryPreview,
}) => {
  const resolvedSource = resolveArtworkPreviewImageSrc({ src, previewUrl, resourceType, mimeType });
  const optimizedSource = useMemo(
    () => buildCommercePreviewUrl(resolvedSource, 1800),
    [resolvedSource],
  );
  const imageSources = useMemo(
    () => dedupePreviewImageSources([optimizedSource, resolvedSource]),
    [optimizedSource, resolvedSource],
  );
  const sourceSignature = imageSources.join('\n');
  const artworkKey = productionUrl || resolvedSource || src;
  const resolvedCrossOrigin = getPreviewCrossOrigin(resolvedSource, imageCrossOrigin);

  const previousSourceRef = useRef(resolvedSource);
  const retainDuringHandoff = Boolean(
    previousSourceRef.current
    && previousSourceRef.current !== resolvedSource
    && isTransientPreviewImageUrl(previousSourceRef.current)
    && productionUrl
    && resolvedSource === productionUrl,
  );
  useEffect(() => {
    previousSourceRef.current = resolvedSource;
  }, [resolvedSource]);

  const internalRef = useRef<HTMLDivElement | null>(null);
  const canvasSizeRef = useRef<Size | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const constrainRef = useRef(constrain);
  constrainRef.current = constrain;

  const [selected, setSelected] = useState(autoSelect);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size | null>(null);
  const [loading, setLoading] = useState(Boolean(resolvedSource));
  const [previewError, setPreviewError] = useState<string | null>(
    resolvedSource ? null : 'This PDF needs a browser preview before it can be displayed.',
  );
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (autoSelect) setSelected(true);
  }, [autoSelect, artworkKey]);

  useEffect(() => {
    if (!resolvedSource) {
      setLoading(false);
      setNaturalSize(null);
      setPreviewError('This PDF needs a browser preview before it can be displayed.');
      return;
    }
    setLoading(true);
    setPreviewError(null);
    if (!retainDuringHandoff) setNaturalSize(null);
  }, [sourceSignature, retryNonce, resolvedSource, retainDuringHandoff]);

  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    const previousNode = internalRef.current;
    internalRef.current = node;
    if (node && containerRef) containerRef.current = node;
    if (!node && containerRef && containerRef.current === previousNode) containerRef.current = null;
  }, [containerRef]);

  useEffect(() => {
    const node = internalRef.current;
    if (!node || !containerRef) return;
    if (isTopmostCanvas(node)) containerRef.current = node;
    return () => {
      if (containerRef.current === node) containerRef.current = null;
    };
  });

  const commitTransform = useCallback((next: ArtworkTransform, updateNormalized = true) => {
    const size = canvasSizeRef.current;
    if (updateNormalized && size?.w && size?.h) {
      normalizedPositionByArtwork.set(artworkKey, {
        xPct: next.x / size.w,
        yPct: next.y / size.h,
      });
    }
    valueRef.current = next;
    onChangeRef.current(next);
  }, [artworkKey]);

  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, original: value });
  const resizeRef = useRef<null | {
    active: boolean;
    pointerId: number;
    corner: Corner;
    startX: number;
    startY: number;
    startScaleX: number;
    startScaleY: number;
    originalX: number;
    originalY: number;
    baseW: number;
    baseH: number;
  }>(null);
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | {
    startDistance: number;
    startScaleX: number;
    startScaleY: number;
    startCenterX: number;
    startCenterY: number;
    canvasCenterX: number;
    canvasCenterY: number;
    originalX: number;
    originalY: number;
  }>(null);

  useEffect(() => {
    const node = internalRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    let previous: Size | null = null;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next = { w: rect.width, h: rect.height };
      canvasSizeRef.current = next;
      setCanvasSize((current) => current && current.w === next.w && current.h === next.h ? current : next);

      let normalized = normalizedPositionByArtwork.get(artworkKey);
      if (!normalized) {
        const base = previous || next;
        normalized = {
          xPct: base.w ? valueRef.current.x / base.w : 0,
          yPct: base.h ? valueRef.current.y / base.h : 0,
        };
        normalizedPositionByArtwork.set(artworkKey, normalized);
      }

      const resized = previous
        && (Math.abs(previous.w - next.w) > 0.25 || Math.abs(previous.h - next.h) > 0.25);
      if (resized && isTopmostCanvas(node) && !dragRef.current.active && !resizeRef.current?.active && !pinchRef.current) {
        const current = valueRef.current;
        const adjusted = {
          ...current,
          x: normalized.xPct * next.w,
          y: normalized.yPct * next.h,
        };
        if (Math.abs(adjusted.x - current.x) > 0.25 || Math.abs(adjusted.y - current.y) > 0.25) {
          commitTransform(adjusted, false);
        }
      }
      previous = next;
      if (containerRef && isTopmostCanvas(node)) containerRef.current = node;
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [artworkKey, paddingPct, commitTransform, containerRef]);

  const containedRect = useMemo(() => {
    if (!canvasSize || !naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) return null;
    const canvasAspect = canvasSize.w / canvasSize.h;
    const imageAspect = naturalSize.w / naturalSize.h;
    const w = imageAspect > canvasAspect ? canvasSize.w : canvasSize.h * imageAspect;
    const h = imageAspect > canvasAspect ? canvasSize.w / imageAspect : canvasSize.h;
    return { w, h, left: (canvasSize.w - w) / 2, top: (canvasSize.h - h) / 2 };
  }, [canvasSize, naturalSize]);

  const baseRect = containedRect
    ? { left: containedRect.left, top: containedRect.top, width: containedRect.w, height: containedRect.h }
    : canvasSize
      ? { left: 0, top: 0, width: canvasSize.w, height: canvasSize.h }
      : null;

  const artworkFrame = baseRect ? {
    left: baseRect.left + (baseRect.width - baseRect.width * value.scaleX) / 2 + value.x,
    top: baseRect.top + (baseRect.height - baseRect.height * value.scaleY) / 2 + value.y,
    width: Math.max(1, baseRect.width * value.scaleX),
    height: Math.max(1, baseRect.height * value.scaleY),
  } : null;

  const startPointer = useCallback((event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (loading || previewError || target.closest('[data-artwork-toolbar="true"]') || target.dataset.handle) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    setSelected(true);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }

    if (pointerMapRef.current.size >= 2) {
      const [a, b] = Array.from(pointerMapRef.current.values());
      const node = internalRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      pinchRef.current = {
        startDistance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        startScaleX: valueRef.current.scaleX,
        startScaleY: valueRef.current.scaleY,
        startCenterX: (a.x + b.x) / 2,
        startCenterY: (a.y + b.y) / 2,
        canvasCenterX: rect.left + rect.width / 2,
        canvasCenterY: rect.top + rect.height / 2,
        originalX: valueRef.current.x,
        originalY: valueRef.current.y,
      };
      dragRef.current.active = false;
      return;
    }

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      original: valueRef.current,
    };
  }, [loading, previewError]);

  const startResize = useCallback((corner: Corner) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const baseW = containedRect?.w || canvasSizeRef.current?.w || 1;
    const baseH = containedRect?.h || canvasSizeRef.current?.h || 1;
    resizeRef.current = {
      active: true,
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startScaleX: valueRef.current.scaleX,
      startScaleY: valueRef.current.scaleY,
      originalX: valueRef.current.x,
      originalY: valueRef.current.y,
      baseW,
      baseH,
    };
    setSelected(true);
  }, [containedRect]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (pointerMapRef.current.has(event.pointerId)) {
        pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (pinchRef.current && pointerMapRef.current.size >= 2) {
        const [a, b] = Array.from(pointerMapRef.current.values());
        const pinch = pinchRef.current;
        const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const ratio = distance / pinch.startDistance;
        const centerX = (a.x + b.x) / 2;
        const centerY = (a.y + b.y) / 2;
        const scaleX = clamp(pinch.startScaleX * ratio, MIN_SCALE, MAX_SCALE);
        const scaleY = clamp(pinch.startScaleY * ratio, MIN_SCALE, MAX_SCALE);
        const x = centerX - pinch.canvasCenterX - ratio * (pinch.startCenterX - pinch.canvasCenterX - pinch.originalX);
        const y = centerY - pinch.canvasCenterY - ratio * (pinch.startCenterY - pinch.canvasCenterY - pinch.originalY);
        commitTransform({ x, y, scaleX, scaleY });
        return;
      }

      const resize = resizeRef.current;
      if (resize?.active && resize.pointerId === event.pointerId) {
        const dx = event.clientX - resize.startX;
        const dy = event.clientY - resize.startY;
        const signX = resize.corner === 'tr' || resize.corner === 'br' ? 1 : -1;
        const signY = resize.corner === 'bl' || resize.corner === 'br' ? 1 : -1;
        let scaleX = clamp(resize.startScaleX + signX * (2 * dx / resize.baseW), MIN_SCALE, MAX_SCALE);
        let scaleY = clamp(resize.startScaleY + signY * (2 * dy / resize.baseH), MIN_SCALE, MAX_SCALE);
        if (constrainRef.current) {
          const ratioX = scaleX / resize.startScaleX;
          const ratioY = scaleY / resize.startScaleY;
          const ratio = Math.abs(ratioX - 1) >= Math.abs(ratioY - 1) ? ratioX : ratioY;
          scaleX = clamp(resize.startScaleX * ratio, MIN_SCALE, MAX_SCALE);
          scaleY = clamp(resize.startScaleY * ratio, MIN_SCALE, MAX_SCALE);
        }
        commitTransform({ x: resize.originalX, y: resize.originalY, scaleX, scaleY });
        return;
      }

      const drag = dragRef.current;
      if (drag.active && drag.pointerId === event.pointerId) {
        commitTransform({
          ...drag.original,
          x: drag.original.x + event.clientX - drag.startX,
          y: drag.original.y + event.clientY - drag.startY,
        });
      }
    };

    const end = (event: PointerEvent) => {
      pointerMapRef.current.delete(event.pointerId);
      if (pointerMapRef.current.size < 2) pinchRef.current = null;
      if (dragRef.current.pointerId === event.pointerId) dragRef.current.active = false;
      if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current.active = false;
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [commitTransform]);

  useEffect(() => {
    if (!selected) return;
    const outside = (event: PointerEvent) => {
      const node = internalRef.current;
      const target = event.target as HTMLElement | null;
      if (!node || !target || node.contains(target) || target.closest('[data-artwork-toolbar="true"]')) return;
      setSelected(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [selected]);

  const reset = useCallback(
    () => commitTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 }),
    [commitTransform],
  );
  const fit = reset;
  const fill = useCallback(() => {
    if (!naturalSize || !canvasSizeRef.current) {
      commitTransform({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });
      return;
    }
    const canvasAspect = canvasSizeRef.current.w / canvasSizeRef.current.h;
    const imageAspect = naturalSize.w / naturalSize.h;
    const scale = clamp(
      imageAspect > canvasAspect ? imageAspect / canvasAspect : canvasAspect / imageAspect,
      1,
      MAX_SCALE,
    );
    commitTransform({ x: 0, y: 0, scaleX: scale, scaleY: scale });
  }, [naturalSize, commitTransform]);

  const toggleConstrain = useCallback(() => {
    const next = !constrain;
    onConstrainChange(next);
    if (next && valueRef.current.scaleX !== valueRef.current.scaleY) {
      commitTransform({ ...valueRef.current, scaleY: valueRef.current.scaleX });
    }
  }, [constrain, onConstrainChange, commitTransform]);

  const retry = async (event: React.MouseEvent) => {
    event.stopPropagation();
    imageSources.forEach(forgetPreviewImage);
    setPreviewError(null);
    setLoading(Boolean(resolvedSource));
    setRetryNonce((nonce) => nonce + 1);
    await onRetryPreview?.();
  };

  const toolbar = (
    <div className="flex flex-col items-center">
      <div
        data-artwork-toolbar="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className={`pointer-events-auto inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-gray-200/70 bg-white/95 shadow-md backdrop-blur-sm ${compactControls ? 'px-2 py-1' : 'px-3 py-1.5'}`}
      >
        <button type="button" onClick={fit} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600"><Minimize2 className="h-4 w-4" /><span>Fit</span></button>
        <button type="button" onClick={fill} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600"><Maximize2 className="h-4 w-4" /><span>Fill</span></button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"><RotateCcw className="h-4 w-4" /><span>Reset</span></button>
        <div className="hidden h-4 w-px bg-gray-200 sm:block" />
        <button type="button" onClick={toggleConstrain} className={`inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium ${constrain ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-600 hover:bg-gray-100'}`}>
          {constrain ? <Link2 className="h-4 w-4" /> : <Unlink2 className="h-4 w-4" />}
          <span>{constrain ? 'Keep Proportions' : 'Free Resize'}</span>
        </button>
      </div>
      <p className="mt-1.5 px-2 text-center text-[11px] leading-snug text-gray-500">Keep proportions on to avoid stretched or distorted artwork.</p>
    </div>
  );

  const handlePositions: Record<Corner, React.CSSProperties> = {
    tl: { top: 0, left: 0, transform: 'translate(-50%, -50%)', cursor: 'nwse-resize' },
    tr: { top: 0, right: 0, transform: 'translate(50%, -50%)', cursor: 'nesw-resize' },
    bl: { bottom: 0, left: 0, transform: 'translate(-50%, 50%)', cursor: 'nesw-resize' },
    br: { bottom: 0, right: 0, transform: 'translate(50%, 50%)', cursor: 'nwse-resize' },
  };

  return (
    <div className={`w-full ${className || ''}`}>
      <div
        ref={setContainerNode}
        className="relative w-full select-none overflow-hidden"
        style={{
          paddingBottom: paddingPct,
          touchAction: 'none',
          cursor: loading ? 'default' : selected ? 'move' : 'pointer',
          contain: 'layout paint',
          ...canvasStyle,
        }}
        onPointerDown={startPointer}
        onClick={(event) => { if (!loading && !previewError) setSelected(true); event.stopPropagation(); }}
        aria-busy={loading}
      >
        <div
          className="absolute"
          style={artworkFrame
            ? { left: artworkFrame.left, top: artworkFrame.top, width: artworkFrame.width, height: artworkFrame.height }
            : { inset: 0 }}
        >
          {resolvedSource ? (
            <StablePreviewImage
              key={retryNonce}
              sources={imageSources}
              alt={alt}
              className="pointer-events-none absolute inset-0 block h-full w-full"
              style={{ objectFit: containedRect ? 'fill' : 'contain' }}
              crossOrigin={resolvedCrossOrigin}
              retainPreviousWhileLoading={retainDuringHandoff}
              onReady={(result: PreviewImageResult) => {
                setNaturalSize({ w: result.naturalWidth, h: result.naturalHeight });
                setLoading(false);
                setPreviewError(null);
              }}
              onExhausted={() => {
                setLoading(false);
                setNaturalSize(null);
                setPreviewError('We could not load your artwork preview. Your original file is still preserved.');
              }}
            />
          ) : null}

          {!loading && naturalSize && selected && !previewError && (
            <>
              <div className="pointer-events-none absolute inset-0 z-10" style={{ outline: '1.5px solid rgba(249,115,22,.95)', outlineOffset: '-1.5px' }} />
              {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => (
                <div key={corner} data-handle={corner} onPointerDown={startResize(corner)} className="pointer-events-auto absolute z-30 flex h-11 w-11 items-center justify-center" style={handlePositions[corner]}>
                  <span className="block h-4 w-4 rounded-sm border-2 border-orange-500 bg-white shadow" />
                </div>
              ))}
            </>
          )}
        </div>

        {loading && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/94 px-4 text-center text-xs font-medium text-gray-600">
            Preparing artwork preview…
          </div>
        )}

        {previewError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/95 p-4 text-center text-sm text-red-700">
            <span>{previewError}</span>
            <button type="button" className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={retry}>Retry preview</button>
          </div>
        )}

        {showDragHint && !loading && !previewError && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">Drag to reposition · Drag corners to resize</span>
          </div>
        )}
        {overlay}
        {!loading && selected && !mobileToolbarContainer && !previewError && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 w-[calc(100%-1rem)] -translate-x-1/2">{toolbar}</div>
        )}
      </div>

      {!loading && selected && mobileToolbarContainer && !previewError
        ? createPortal(<div className="flex w-full justify-center">{toolbar}</div>, mobileToolbarContainer)
        : null}
    </div>
  );
};

export default StableArtworkPreviewEditor;
