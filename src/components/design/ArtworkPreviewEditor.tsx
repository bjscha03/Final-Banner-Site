import React, { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resizeArtworkFromCorner } from '@/lib/artworkInteraction';
import { ArtworkWorkspaceZoomContext } from './ArtworkWorkspace';
import { Hand, Lock, Maximize2, Minimize2, RotateCcw, Unlock } from 'lucide-react';
import { getPreviewCrossOrigin, resolveArtworkPreviewImageSrc } from './artworkPreviewSource';
import {
  PreviewLifecycleError,
  normalizedTransformFromPixels,
  type NormalizedArtworkTransform,
} from '@/lib/previewLifecycle';
import {
  captureNormalizedArtworkGeometry,
  getContainedArtworkRect,
  restoreArtworkTransformFromGeometry,
  type NormalizedArtworkGeometry,
} from '@/lib/artworkTransformGeometry';

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
  /** Source + product configuration key used to isolate normalized geometry. */
  compositionKey?: string;
  /** Canonical percentage transform used when restoring on a fresh browser. */
  initialNormalizedTransform?: NormalizedArtworkTransform | null;
  initialCompositionRevision?: number;
}

export type ArtworkCompositionSnapshot = {
  compositionKey: string;
  canvasWidthPx: number;
  canvasHeightPx: number;
  naturalWidthPx: number;
  naturalHeightPx: number;
  transform: NormalizedArtworkTransform;
  revision: number;
};

export interface ArtworkPreviewEditorHandle {
  getCompositionSnapshot: () => ArtworkCompositionSnapshot;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Size = { w: number; h: number };
type NormalizedComposition = NormalizedArtworkGeometry & { revision: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const PREVIEW_LOAD_TIMEOUT_MS = 12_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Both the inline editor and the confirmation modal can exist at the same time.
// Store one canonical canvas-relative composition per artwork so inline/modal
// canvases and banner-size changes cannot fight over pixel coordinates or
// visually resize the customer's approved artwork.
const normalizedCompositionByArtwork = new Map<string, NormalizedComposition>();
const seededInitialTransformByArtwork = new Map<string, string>();

export function geometryFromNormalizedArtworkTransform(
  transform: NormalizedArtworkTransform,
  canvas: Size,
  natural: Size,
): NormalizedArtworkGeometry {
  return captureNormalizedArtworkGeometry({
    x: (transform.xPct / 100) * canvas.w,
    y: (transform.yPct / 100) * canvas.h,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  }, canvas, natural);
}

function isTopmostCanvas(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const top = document.elementFromPoint(x, y);
  return Boolean(top && node.contains(top));
}

const ArtworkPreviewEditor = forwardRef<ArtworkPreviewEditorHandle, ArtworkPreviewEditorProps>(({
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
  compositionKey,
  initialNormalizedTransform,
  initialCompositionRevision = 0,
}, forwardedRef) => {
  const workspaceZoom = useContext(ArtworkWorkspaceZoomContext);
  const workspaceZoomRef = useRef(workspaceZoom);
  workspaceZoomRef.current = workspaceZoom;
  const imageSrc = resolveArtworkPreviewImageSrc({ src, previewUrl, resourceType, mimeType });
  const artworkKey = compositionKey || productionUrl || imageSrc || src;
  const resolvedCrossOrigin = getPreviewCrossOrigin(imageSrc, imageCrossOrigin);

  const internalRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasSizeRef = useRef<Size | null>(null);
  const naturalSizeRef = useRef<Size | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const localValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const constrainRef = useRef(constrain);
  constrainRef.current = constrain;
  const initialNormalizedTransformRef = useRef(initialNormalizedTransform);
  initialNormalizedTransformRef.current = initialNormalizedTransform;
  const initialCompositionRevisionRef = useRef(initialCompositionRevision);
  initialCompositionRevisionRef.current = initialCompositionRevision;

  const [sizeReviewNeeded, setSizeReviewNeeded] = useState(false);
  const previousShapeRef = useRef(paddingPct);
  useEffect(() => {
    if (previousShapeRef.current !== paddingPct && naturalSizeRef.current) setSizeReviewNeeded(true);
    previousShapeRef.current = paddingPct;
  }, [paddingPct]);
  const [selected, setSelected] = useState(autoSelect);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [canvasSize, setCanvasSize] = useState<Size | null>(null);
  const [loading, setLoading] = useState(Boolean(imageSrc));
  const [previewError, setPreviewError] = useState<string | null>(
    imageSrc ? null : 'This PDF needs a browser preview before it can be displayed.',
  );
  const [retryNonce, setRetryNonce] = useState(0);

  const seedInitialNormalizedComposition = useCallback((canvas: Size, natural: Size): boolean => {
    const initial = initialNormalizedTransformRef.current;
    if (!initial || !canvas.w || !canvas.h || !natural.w || !natural.h) return false;
    const fingerprint = [
      initial.xPct,
      initial.yPct,
      initial.scaleX,
      initial.scaleY,
      initialCompositionRevisionRef.current,
    ].join('|');
    if (seededInitialTransformByArtwork.get(artworkKey) === fingerprint) return false;
    normalizedCompositionByArtwork.set(artworkKey, {
      ...geometryFromNormalizedArtworkTransform(initial, canvas, natural),
      revision: initialCompositionRevisionRef.current,
    });
    seededInitialTransformByArtwork.set(artworkKey, fingerprint);
    return true;
  }, [artworkKey]);

  const settleLoadedImage = useCallback((image: HTMLImageElement | null): boolean => {
    if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) return false;
    const nextNaturalSize = { w: image.naturalWidth, h: image.naturalHeight };
    naturalSizeRef.current = nextNaturalSize;
    setNaturalSize(nextNaturalSize);
    const canvas = canvasSizeRef.current;
    const seeded = canvas ? seedInitialNormalizedComposition(canvas, nextNaturalSize) : false;
    if (canvas && !seeded && !normalizedCompositionByArtwork.has(artworkKey)) {
      normalizedCompositionByArtwork.set(artworkKey, {
        ...captureNormalizedArtworkGeometry(localValueRef.current, canvas, nextNaturalSize),
        revision: 0,
      });
    }
    setLoading(false);
    setPreviewError(null);
    return true;
  }, [artworkKey, seedInitialNormalizedComposition]);

  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    const previousNode = internalRef.current;
    internalRef.current = node;
    if (node && containerRef) containerRef.current = node;
    if (!node && containerRef && containerRef.current === previousNode) containerRef.current = null;
  }, [containerRef]);

  // Restore the forwarded ref to the visible editor after the modal closes.
  useEffect(() => {
    const node = internalRef.current;
    if (!node || !containerRef) return;
    if (isTopmostCanvas(node)) containerRef.current = node;
    return () => {
      if (containerRef.current === node) containerRef.current = null;
    };
  });

  useEffect(() => {
    if (autoSelect) setSelected(true);
  }, [autoSelect, imageSrc]);

  useEffect(() => {
    setNaturalSize(null);
    naturalSizeRef.current = null;

    if (!imageSrc) {
      setLoading(false);
      setPreviewError('This PDF needs a browser preview before it can be displayed.');
      return;
    }

    setLoading(true);
    setPreviewError(null);
    let cancelled = false;

    const settleIfReady = () => {
      if (!cancelled) settleLoadedImage(imageRef.current);
    };

    // iOS browsers can serve a cached/blob image before React observes the load
    // event. Check the element after mount and again shortly afterward.
    const frameId = window.requestAnimationFrame(settleIfReady);
    const quickCheckId = window.setTimeout(settleIfReady, 150);
    const timeoutId = window.setTimeout(() => {
      if (cancelled || settleLoadedImage(imageRef.current)) return;
      setLoading(false);
      setNaturalSize(null);
      setPreviewError('Artwork preview took too long to load. Tap Retry preview to try again.');
    }, PREVIEW_LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(quickCheckId);
      window.clearTimeout(timeoutId);
    };
  }, [imageSrc, retryNonce, settleLoadedImage]);

  const commitTransform = useCallback((next: ArtworkTransform, updateNormalized = true) => {
    const size = canvasSizeRef.current;
    if (updateNormalized && size?.w && size?.h) {
      const previous = normalizedCompositionByArtwork.get(artworkKey);
      const natural = naturalSizeRef.current;
      const geometry = natural
        ? captureNormalizedArtworkGeometry(next, size, natural)
        : {
            xPct: next.x / size.w,
            yPct: next.y / size.h,
            widthPct: previous?.widthPct ?? next.scaleX,
            heightPct: previous?.heightPct ?? next.scaleY,
          };
      normalizedCompositionByArtwork.set(artworkKey, {
        ...geometry,
        revision: (previous?.revision ?? 0) + 1,
      });
    }
    localValueRef.current = next;
    valueRef.current = next;
    onChangeRef.current(next);
  }, [artworkKey]);

  useImperativeHandle(forwardedRef, () => ({
    getCompositionSnapshot: () => {
      const node = internalRef.current;
      const image = imageRef.current;
      const screenRect = node?.getBoundingClientRect();
      const rect = screenRect ? { width: screenRect.width / workspaceZoomRef.current, height: screenRect.height / workspaceZoomRef.current } : null;
      if (!node || !rect || rect.width <= 0 || rect.height <= 0) {
        throw new PreviewLifecycleError(
          'PREVIEW_GEOMETRY_NOT_READY',
          'The actual artwork editor canvas has no usable dimensions.',
          { compositionKey: artworkKey, width: rect?.width, height: rect?.height },
        );
      }
      if (loading || previewError || !image?.complete || !image.naturalWidth || !image.naturalHeight) {
        throw new PreviewLifecycleError(
          'SOURCE_IMAGE_DECODE_FAILED',
          previewError || 'The artwork editor image is not decoded yet.',
          { compositionKey: artworkKey, loading },
        );
      }
      const transform = normalizedTransformFromPixels(localValueRef.current, {
        width: rect.width,
        height: rect.height,
      });
      const canonical = normalizedCompositionByArtwork.get(artworkKey);
      return {
        compositionKey: artworkKey,
        canvasWidthPx: rect.width,
        canvasHeightPx: rect.height,
        naturalWidthPx: image.naturalWidth,
        naturalHeightPx: image.naturalHeight,
        transform: canonical ? {
          ...transform,
          xPct: Number((canonical.xPct * 100).toFixed(6)),
          yPct: Number((canonical.yPct * 100).toFixed(6)),
        } : transform,
        revision: canonical?.revision ?? 0,
      };
    },
  }), [artworkKey, loading, previewError]);

  useEffect(() => {
    const node = internalRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    let previous: Size | null = null;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next = { w: rect.width / workspaceZoomRef.current, h: rect.height / workspaceZoomRef.current };
      canvasSizeRef.current = next;
      setCanvasSize((current) => current && current.w === next.w && current.h === next.h ? current : next);

      let normalized = normalizedCompositionByArtwork.get(artworkKey);
      const natural = naturalSizeRef.current;
      if (natural && seedInitialNormalizedComposition(next, natural)) {
        normalized = normalizedCompositionByArtwork.get(artworkKey);
      }
      if (!normalized) {
        const base = previous || next;
        normalized = {
          ...(natural
            ? captureNormalizedArtworkGeometry(valueRef.current, base, natural)
            : {
                xPct: base.w ? valueRef.current.x / base.w : 0,
                yPct: base.h ? valueRef.current.y / base.h : 0,
                widthPct: valueRef.current.scaleX,
                heightPct: valueRef.current.scaleY,
              }),
          revision: 0,
        };
        normalizedCompositionByArtwork.set(artworkKey, normalized);
      }

      if (isTopmostCanvas(node) && !dragRef.current.active && !resizeRef.current?.active && !pinchRef.current) {
        const current = valueRef.current;
        const natural = naturalSizeRef.current;
        const restored = natural
          ? restoreArtworkTransformFromGeometry(normalized, next, natural, constrainRef.current)
          : { ...current, x: normalized.xPct * next.w, y: normalized.yPct * next.h };
        const adjusted = {
          ...restored,
          scaleX: clamp(restored.scaleX, MIN_SCALE, MAX_SCALE),
          scaleY: clamp(restored.scaleY, MIN_SCALE, MAX_SCALE),
        };
        if (
          Math.abs(adjusted.x - current.x) > 0.25
          || Math.abs(adjusted.y - current.y) > 0.25
          || Math.abs(adjusted.scaleX - current.scaleX) > 0.001
          || Math.abs(adjusted.scaleY - current.scaleY) > 0.001
        ) {
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
  }, [artworkKey, paddingPct, commitTransform, containerRef, seedInitialNormalizedComposition]);

  const containedRect = (() => {
    if (!canvasSize || !naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) return null;
    const { w, h } = getContainedArtworkRect(canvasSize, naturalSize);
    return { w, h, left: (canvasSize.w - w) / 2, top: (canvasSize.h - h) / 2 };
  })();

  const baseRect = containedRect
    ? { left: containedRect.left, top: containedRect.top, width: containedRect.w, height: containedRect.h }
    : canvasSize
      ? { left: 0, top: 0, width: canvasSize.w, height: canvasSize.h }
      : null;

  // `value.x/y` is retained for compatibility with the parent builder state,
  // but pixels are local to a mounted canvas. Render each inline/modal editor
  // from the shared normalized composition so viewport and product-size
  // changes preserve the approved center and displayed artwork width.
  const normalizedComposition = normalizedCompositionByArtwork.get(artworkKey);
  const localValue: ArtworkTransform = normalizedComposition && canvasSize && naturalSize
    ? restoreArtworkTransformFromGeometry(
        normalizedComposition,
        canvasSize,
        naturalSize,
        constrain,
      )
    : normalizedComposition && canvasSize
      ? {
          ...value,
          x: normalizedComposition.xPct * canvasSize.w,
          y: normalizedComposition.yPct * canvasSize.h,
        }
    : value;
  localValueRef.current = localValue;

  const artworkFrame = baseRect ? {
    left: baseRect.left + (baseRect.width - baseRect.width * localValue.scaleX) / 2 + localValue.x,
    top: baseRect.top + (baseRect.height - baseRect.height * localValue.scaleY) / 2 + localValue.y,
    width: Math.max(1, baseRect.width * localValue.scaleX),
    height: Math.max(1, baseRect.height * localValue.scaleY),
  } : null;

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

  const startPointer = useCallback((event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-artwork-toolbar="true"]') || target.closest('[data-handle]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    setSelected(true);
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }

    if (pointerMapRef.current.size >= 2) {
      const points = Array.from(pointerMapRef.current.values());
      const [a, b] = points;
      const node = internalRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      pinchRef.current = {
        startDistance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        startScaleX: localValueRef.current.scaleX,
        startScaleY: localValueRef.current.scaleY,
        startCenterX: (a.x + b.x) / 2,
        startCenterY: (a.y + b.y) / 2,
        canvasCenterX: rect.left + rect.width / 2,
        canvasCenterY: rect.top + rect.height / 2,
        originalX: localValueRef.current.x,
        originalY: localValueRef.current.y,
      };
      dragRef.current.active = false;
      return;
    }

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      original: localValueRef.current,
    };
  }, []);

  const startResize = useCallback((corner: Corner) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported capture */ }
    dragRef.current.active = false;
    pinchRef.current = null;
    pointerMapRef.current.clear();
    const baseW = containedRect?.w || canvasSizeRef.current?.w || 1;
    const baseH = containedRect?.h || canvasSizeRef.current?.h || 1;
    resizeRef.current = {
      active: true,
      pointerId: event.pointerId,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startScaleX: localValueRef.current.scaleX,
      startScaleY: localValueRef.current.scaleY,
      originalX: localValueRef.current.x,
      originalY: localValueRef.current.y,
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
        const zoom = workspaceZoomRef.current;
        const x = (centerX - pinch.canvasCenterX - ratio * (pinch.startCenterX - pinch.canvasCenterX)) / zoom + ratio * pinch.originalX;
        const y = (centerY - pinch.canvasCenterY - ratio * (pinch.startCenterY - pinch.canvasCenterY)) / zoom + ratio * pinch.originalY;
        commitTransform({ x, y, scaleX, scaleY });
        return;
      }

      const resize = resizeRef.current;
      if (resize?.active && resize.pointerId === event.pointerId) {
        const dx = (event.clientX - resize.startX) / workspaceZoomRef.current;
        const dy = (event.clientY - resize.startY) / workspaceZoomRef.current;
        commitTransform(resizeArtworkFromCorner({
          x: resize.originalX, y: resize.originalY,
          scaleX: resize.startScaleX, scaleY: resize.startScaleY,
        }, { w: resize.baseW, h: resize.baseH }, resize.corner, dx, dy, constrainRef.current));
        return;
      }

      const drag = dragRef.current;
      if (drag.active && drag.pointerId === event.pointerId) {
        commitTransform({
          ...drag.original,
          x: drag.original.x + (event.clientX - drag.startX) / workspaceZoomRef.current,
          y: drag.original.y + (event.clientY - drag.startY) / workspaceZoomRef.current,
        });
      }
    };

    const end = (event: PointerEvent) => {
      pointerMapRef.current.delete(event.pointerId);
      if (pinchRef.current && pointerMapRef.current.size === 1) {
        // Continue moving smoothly when one finger lifts after a pinch.
        const [pointerId, point] = Array.from(pointerMapRef.current.entries())[0];
        dragRef.current = { active: true, pointerId, startX: point.x, startY: point.y, original: localValueRef.current };
      }
      if (pointerMapRef.current.size < 2) pinchRef.current = null;
      if (dragRef.current.pointerId === event.pointerId) dragRef.current.active = false;
      if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current.active = false;
    };

    window.addEventListener('pointermove', move);
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
    const outside = (event: MouseEvent) => {
      const node = internalRef.current;
      const target = event.target as HTMLElement | null;
      if (!node || !target || node.contains(target) || target.closest('[data-artwork-toolbar="true"]')) return;
      setSelected(false);
    };
    // Deselect only after the browser has dispatched the destination click.
    // Collapsing the portaled toolbar during pointerdown can move controls in
    // the surrounding layout before pointerup, causing the intended button
    // (for example Add to Cart) to miss its click entirely.
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [selected]);

  const reset = useCallback(() => { setSizeReviewNeeded(false); commitTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 }); }, [commitTransform]);
  const fit = reset;
  const fill = useCallback(() => {
    if (!naturalSize || !canvasSizeRef.current) {
      commitTransform({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });
      return;
    }
    const canvasAspect = canvasSizeRef.current.w / canvasSizeRef.current.h;
    const imageAspect = naturalSize.w / naturalSize.h;
    const scale = clamp(imageAspect > canvasAspect ? imageAspect / canvasAspect : canvasAspect / imageAspect, 1, MAX_SCALE);
    commitTransform({ x: 0, y: 0, scaleX: scale, scaleY: scale });
  }, [naturalSize, commitTransform]);

  const toggleConstrain = useCallback(() => {
    const next = !constrain;
    // Save the geometry currently rendered on canvas before changing modes.
    // Cached geometry may still contain an unconstrained height from loading
    // or a previous canvas size; unlocking must not reveal that stale height.
    if (!next) commitTransform({ ...localValueRef.current });
    onConstrainChange(next);
    if (next && localValueRef.current.scaleX !== localValueRef.current.scaleY) {
      commitTransform({ ...localValueRef.current, scaleY: localValueRef.current.scaleX });
    }
  }, [constrain, onConstrainChange, commitTransform]);

  const resizeBy = (factor: number) => {
    const current = localValueRef.current;
    const ratio = clamp(factor, Math.max(MIN_SCALE / current.scaleX, MIN_SCALE / current.scaleY),
      Math.min(MAX_SCALE / current.scaleX, MAX_SCALE / current.scaleY));
    commitTransform({ ...current, scaleX: current.scaleX * ratio, scaleY: current.scaleY * ratio });
    setSelected(true);
  };

  const toolbar = (
    <div
      data-artwork-toolbar="true"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={`pointer-events-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-sm ${compactControls ? 'p-2' : 'p-3 sm:p-4'}`}
    >
      {sizeReviewNeeded && <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
        <p>Your banner shape changed. Check for cropped edges or blank margins.</p>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" title="Show the whole image; may leave blank margins" onClick={fit} className="min-h-11 rounded-lg bg-white px-3 font-semibold text-orange-700">Fit entire artwork</button><button type="button" onClick={() => setSizeReviewNeeded(false)} className="min-h-11 rounded-lg px-3 font-medium">Keep current placement</button></div>
      </div>}
      <div className="mb-1 flex items-center justify-center gap-2 text-slate-700 sm:hidden">
        <Hand aria-hidden="true" className="h-5 w-5 shrink-0" />
        <p className="text-xs font-semibold">Pinch to zoom · Drag to move</p>
      </div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 sm:justify-start" role="status">
            {constrain ? <Lock aria-hidden="true" className="h-3.5 w-3.5" /> : <Unlock aria-hidden="true" className="h-3.5 w-3.5" />}
            {constrain ? 'Proportions locked' : 'Free resize enabled'}
          </p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <button type="button" title="Show the whole image; may leave blank margins" onClick={fit} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"><Minimize2 aria-hidden="true" className="h-4 w-4" />Fit</button>
            <button type="button" title="Cover the banner; may crop the image edges" onClick={fill} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"><Maximize2 aria-hidden="true" className="h-4 w-4" />Fill</button>
            <button type="button" onClick={reset} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium text-orange-600 hover:bg-orange-50"><RotateCcw aria-hidden="true" className="h-4 w-4" />Reset</button>
          </div>
        </div>
        <details className="text-xs text-slate-600">
          <summary className="flex min-h-11 cursor-pointer items-center justify-center underline">Advanced resize</summary>
        <button type="button" onClick={toggleConstrain} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600">
          {constrain ? <Unlock aria-hidden="true" className="h-4 w-4" /> : <Lock aria-hidden="true" className="h-4 w-4" />}
          {constrain ? 'Unlock free resize' : 'Lock proportions'}
        </button>
        </details>
      </div>
      <div className="mt-1 flex items-center justify-center gap-1" role="group" aria-label="Artwork size and position">
        <button type="button" aria-label="Make artwork smaller" onClick={() => resizeBy(1 / 1.1)} disabled={Math.min(localValue.scaleX, localValue.scaleY) <= MIN_SCALE + 0.001} className="min-h-11 min-w-11 rounded-lg border border-slate-200 text-xl disabled:opacity-40">−</button>
        <span className="min-w-14 text-center text-xs tabular-nums" aria-live="polite">{Math.round(localValue.scaleX * 100)}%</span>
        <button type="button" aria-label="Make artwork larger" onClick={() => resizeBy(1.1)} disabled={Math.max(localValue.scaleX, localValue.scaleY) >= MAX_SCALE - 0.001} className="min-h-11 min-w-11 rounded-lg border border-slate-200 text-xl disabled:opacity-40">+</button>
        <button type="button" onClick={() => { commitTransform({ ...localValueRef.current, x: 0, y: 0 }); setSelected(true); }} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">Center</button>
      </div>
      <p className="mt-2 text-center text-xs leading-relaxed text-slate-500">
        Fit shows the whole image. Fill covers the banner and may crop edges.
      </p>
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
        data-artwork-canvas="true"
        className="relative w-full select-none overflow-visible"
        style={{ aspectRatio: 100 / parseFloat(paddingPct), boxSizing: 'border-box', touchAction: 'none', cursor: loading ? 'default' : selected ? 'move' : 'pointer', ...canvasStyle }}
        onPointerDown={startPointer}
        onClick={(event) => { setSelected(true); event.stopPropagation(); }}
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-xs text-gray-700">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />Loading artwork…</span>
          </div>
        )}

        <div className="absolute inset-0 overflow-hidden">
        <div data-artwork-frame="true" className="absolute" style={artworkFrame ? { left: artworkFrame.left, top: artworkFrame.top, width: artworkFrame.width, height: artworkFrame.height } : { inset: 0 }}>
          {previewError ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/95 p-4 text-center text-sm text-red-700">
              <span>{previewError}</span>
              <button type="button" className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={(event) => { event.stopPropagation(); setRetryNonce((nonce) => nonce + 1); void onRetryPreview?.(); }}>Retry preview</button>
            </div>
          ) : imageSrc ? (
            <img
              ref={imageRef}
              key={`${imageSrc}-${retryNonce}`}
              src={imageSrc}
              alt={alt}
              draggable={false}
              crossOrigin={resolvedCrossOrigin}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className={`absolute inset-0 h-full w-full pointer-events-none ${containedRect ? '' : 'object-contain'}`}
              onLoad={(event) => {
                settleLoadedImage(event.currentTarget);
              }}
              onError={() => {
                setLoading(false);
                setNaturalSize(null);
                setPreviewError('We could not load your artwork preview. Your original file is still preserved.');
              }}
            />
          ) : null}

        </div>

        {overlay}
        </div>

        {!loading && naturalSize && selected && !previewError && artworkFrame && (
          <div data-artwork-controls="true" className="pointer-events-none absolute inset-0 z-30" data-html2canvas-ignore="true">
            <div data-artwork-outline="true" className="absolute" style={{ ...artworkFrame, outline: `${1.5 / workspaceZoom}px solid #7c3aed` }} />
            <div className="absolute" style={artworkFrame}>
              {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => (
                <button type="button" key={corner} data-handle={corner}
                  aria-label={`Resize artwork from ${ { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' }[corner]}`}
                  title="Drag to resize artwork"
                  onPointerDown={startResize(corner)}
                  onKeyDown={(event) => {
                    const delta = event.shiftKey ? 10 : 2;
                    const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
                    const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
                    if ((!dx && !dy) || !containedRect) return;
                    event.preventDefault(); event.stopPropagation();
                    commitTransform(resizeArtworkFromCorner(localValueRef.current, containedRect, corner, dx, dy, constrainRef.current));
                  }}
                  className="pointer-events-auto absolute flex h-11 w-11 touch-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
                  style={{ ...handlePositions[corner], width: 44 / workspaceZoom, height: 44 / workspaceZoom }}>
                  <span className="pointer-events-none block rounded-full border border-violet-600 bg-white shadow" style={{ width: 14 / workspaceZoom, height: 14 / workspaceZoom, borderWidth: 1.5 / workspaceZoom }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {showDragHint && <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"><span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">Drag to reposition · Drag corners to resize</span></div>}
        {!loading && !previewError && !mobileToolbarContainer && <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-40 flex justify-center">{toolbar}</div>}
      </div>

      {!loading && !previewError && mobileToolbarContainer
        ? createPortal(<div className="flex w-full justify-center">{toolbar}</div>, mobileToolbarContainer)
        : null}
    </div>
  );
});

ArtworkPreviewEditor.displayName = 'ArtworkPreviewEditor';

export default ArtworkPreviewEditor;
