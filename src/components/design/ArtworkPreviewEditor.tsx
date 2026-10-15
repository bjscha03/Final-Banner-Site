import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crop, Maximize2, Minimize2, Undo2, Redo2, Trash2 } from 'lucide-react';
import type { ArtworkCrop } from '@/types/artwork';
import { artworkCropBox, artworkImageBox, artworkCenterGuides, repositionArtworkCrop, resizeArtwork, resizeCroppedImage, snapArtworkPosition, type ArtworkHandle } from '@/lib/artworkInteractions';
import { getPreviewCrossOrigin, resolveArtworkPreviewImageSrc } from './artworkPreviewSource';
import ArtworkFitHelp, { useArtworkFitHelp, type ArtworkFitAssistance } from './ArtworkFitHelp';
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
  crop?: ArtworkCrop;
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
  primaryFitControl?: React.ReactNode;
  fitControls?: React.ReactNode;
  fitAssistance?: ArtworkFitAssistance;
  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';
  onRetryPreview?: () => void | Promise<void>;
  onDelete?: () => void;
  enableCropping?: boolean;
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

type Size = { w: number; h: number };
type NormalizedComposition = NormalizedArtworkGeometry & { revision: number };

const MIN_SCALE = 0.02;
const MAX_SCALE = 20;
const PREVIEW_LOAD_TIMEOUT_MS = 12_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Both the inline editor and the confirmation modal can exist at the same time.
// Store one canonical canvas-relative composition per artwork so inline/modal
// canvases and banner-size changes cannot fight over pixel coordinates or
// visually resize the customer's approved artwork.
const normalizedCompositionByArtwork = new Map<string, NormalizedComposition>();
const seededInitialTransformByArtwork = new Map<string, string>();
const historyByArtwork = new Map<string, { past: NormalizedArtworkGeometry[]; future: NormalizedArtworkGeometry[] }>();

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
    ...(transform.crop ? { crop: transform.crop } : {}),
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
  primaryFitControl,
  fitControls,
  fitAssistance,
  imageCrossOrigin,
  onRetryPreview,
  onDelete,
  enableCropping = true,
  compositionKey,
  initialNormalizedTransform,
  initialCompositionRevision = 0,
}, forwardedRef) => {
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
  const [, refresh] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const cropModeRef = useRef(false);
  cropModeRef.current = cropMode;
  const [guides, setGuides] = useState({ x: false, y: false });
  const [activeHandle, setActiveHandle] = useState<ArtworkHandle | null>(null);
  const gestureStart = useRef<NormalizedArtworkGeometry | null>(null);
  const fitHelp = useArtworkFitHelp(artworkKey, fitAssistance, () => {
    const canvas = internalRef.current;
    return Boolean(canvas && !gestureStart.current && !cropModeRef.current && !loading && !previewError
      && document.visibilityState === 'visible' && isTopmostCanvas(canvas)
      && !document.querySelector('[role="dialog"][data-state="open"]'));
  });
  const recordFitAdjustment = useCallback(() => {
    const canvas = canvasSizeRef.current;
    const natural = naturalSizeRef.current;
    if (!canvas?.w || !canvas.h || !natural?.w || !natural.h) return;
    const value = localValueRef.current;
    const frame = artworkCropBox(artworkImageBox(value, canvas, natural), value.crop);
    const needsHelp = Math.abs(frame.left) / canvas.w > 0.04 || Math.abs(frame.top) / canvas.h > 0.04
      || Math.abs(frame.left + frame.width - canvas.w) / canvas.w > 0.04
      || Math.abs(frame.top + frame.height - canvas.h) / canvas.h > 0.04
      || Boolean(value.crop && (value.crop.width < 0.94 || value.crop.height < 0.94));
    fitHelp.recordAdjustment(needsHelp);
  }, [fitHelp.recordAdjustment]);
  const getHistory = useCallback(() => {
    if (!historyByArtwork.has(artworkKey)) historyByArtwork.set(artworkKey, { past: [], future: [] });
    return historyByArtwork.get(artworkKey)!;
  }, [artworkKey]);
  const beginHistory = useCallback(() => {
    fitHelp.cancelPending();
    const canvas = canvasSizeRef.current;
    const natural = naturalSizeRef.current;
    if (!gestureStart.current && canvas && natural) gestureStart.current = captureNormalizedArtworkGeometry(localValueRef.current, canvas, natural);
  }, [fitHelp.cancelPending]);
  const finishHistory = useCallback(() => {
    const start = gestureStart.current;
    const current = normalizedCompositionByArtwork.get(artworkKey);
    gestureStart.current = null;
    if (!start || !current) return;
    const { revision: _revision, ...geometry } = current;
    if (JSON.stringify(start) === JSON.stringify(geometry)) return;
    const history = getHistory();
    history.past.push(start);
    if (history.past.length > 80) history.past.shift();
    history.future = [];
    recordFitAdjustment();
    refresh(n => n + 1);
  }, [artworkKey, getHistory, recordFitAdjustment]);

  const seedInitialNormalizedComposition = useCallback((canvas: Size, natural: Size): boolean => {
    const initial = initialNormalizedTransformRef.current;
    if (!initial || !canvas.w || !canvas.h || !natural.w || !natural.h) return false;
    const fingerprint = [
      initial.xPct,
      initial.yPct,
      initial.scaleX,
      initial.scaleY,
      JSON.stringify(initial.crop || null),
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
    refresh(n => n + 1);
  }, [artworkKey]);

  useImperativeHandle(forwardedRef, () => ({
    getCompositionSnapshot: () => {
      const node = internalRef.current;
      const image = imageRef.current;
      const rect = node?.getBoundingClientRect();
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
      const next = { w: rect.width, h: rect.height };
      canvasSizeRef.current = next;
      setCanvasSize((current) => current && current.w === next.w && current.h === next.h ? current : next);

      let normalized = normalizedCompositionByArtwork.get(artworkKey);
      const natural = naturalSizeRef.current;
      if (natural && seedInitialNormalizedComposition(next, natural)) {
        normalized = normalizedCompositionByArtwork.get(artworkKey);
      }
      // An undecoded image has no contained dimensions yet. Saving the canvas
      // as its geometry here makes a fresh logo expand to canvas width on load.
      // Let image decode seed the real contained (Fit) geometry instead.
      if (!normalized && !natural) return;
      if (!normalized) {
        const base = previous || next;
        normalized = {
          ...captureNormalizedArtworkGeometry(valueRef.current, base, natural!),
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

  const artworkFrame = canvasSize && naturalSize
    ? artworkImageBox(localValue, canvasSize, naturalSize) : null;
  const selectionFrame = artworkFrame ? artworkCropBox(artworkFrame, localValue.crop) : null;
  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, original: value, threshold: 6 });
  const resizeRef = useRef<null | { active: boolean; pointerId: number; handle: ArtworkHandle; startX: number; startY: number; original: ArtworkTransform; threshold: number }>(null);
  const pinchRef = useRef<null | { distance: number; original: ArtworkTransform; x: number; y: number }>(null);
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>());

  const travelHistory = useCallback((redo = false) => {
    const canvas = canvasSizeRef.current;
    const natural = naturalSizeRef.current;
    if (!canvas || !natural) return;
    const history = getHistory();
    const from = redo ? history.future : history.past;
    const to = redo ? history.past : history.future;
    const next = from.pop();
    if (!next) return;
    to.push(captureNormalizedArtworkGeometry(localValueRef.current, canvas, natural));
    commitTransform(restoreArtworkTransformFromGeometry(next, canvas, natural, constrainRef.current));
    recordFitAdjustment();
    setSelected(true);
    setGuides({ x: false, y: false });
  }, [commitTransform, getHistory, recordFitAdjustment]);

  const startPointer = useCallback((event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-artwork-toolbar="true"], [data-handle]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!target.closest('[data-artwork-image="true"]')) {
      setSelected(false);
      setCropMode(false);
      return;
    }
    event.preventDefault();
    setSelected(true);
    beginHistory();
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* detached/canceled pointer */ }
    if (pointerMapRef.current.size === 2 && !cropModeRef.current) {
      const [a, b] = Array.from(pointerMapRef.current.values());
      pinchRef.current = { distance: Math.max(1, Math.hypot(b.x-a.x, b.y-a.y)), original: { ...localValueRef.current }, x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
      dragRef.current.active = false;
      return;
    }
    if (pointerMapRef.current.size > 1) return;
    dragRef.current = { active: true, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, original: { ...localValueRef.current }, threshold: event.pointerType === 'touch' ? 10 : 6 };
  }, [beginHistory]);

  const startResize = useCallback((handle: ArtworkHandle) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // On a very thin image, 44px touch targets overlap. Route that shared area
    // to the nearest visible handle instead of whichever button painted last.
    let nearestHandle = handle;
    let nearestDistance = Infinity;
    internalRef.current?.querySelectorAll<HTMLButtonElement>('[data-handle]').forEach(button => {
      const rect = button.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      const distance = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestHandle = button.dataset.handle as ArtworkHandle;
      }
    });
    beginHistory();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* canceled pointer */ }
    resizeRef.current = { active: true, pointerId: event.pointerId, handle: nearestHandle, startX: event.clientX, startY: event.clientY, original: { ...localValueRef.current }, threshold: event.pointerType === 'touch' ? 10 : 6 };
    setActiveHandle(nearestHandle);
    setSelected(true);
  }, [beginHistory]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const canvas = canvasSizeRef.current;
      const natural = naturalSizeRef.current;
      if (!canvas || !natural) return;
      if (pointerMapRef.current.has(event.pointerId)) pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      let next: ArtworkTransform | null = null;
      if (pinchRef.current && pointerMapRef.current.size >= 2) {
        const [a, b] = Array.from(pointerMapRef.current.values());
        const pinch = pinchRef.current;
        const ratio = clamp(Math.hypot(b.x-a.x,b.y-a.y)/pinch.distance, MIN_SCALE/pinch.original.scaleX, MAX_SCALE/pinch.original.scaleX);
        const rect = internalRef.current!.getBoundingClientRect();
        next = { ...pinch.original, scaleX: pinch.original.scaleX*ratio, scaleY: pinch.original.scaleY*ratio,
          x: (a.x+b.x)/2-rect.left-canvas.w/2-ratio*(pinch.x-rect.left-canvas.w/2-pinch.original.x),
          y: (a.y+b.y)/2-rect.top-canvas.h/2-ratio*(pinch.y-rect.top-canvas.h/2-pinch.original.y) };
      } else if (resizeRef.current?.active && resizeRef.current.pointerId === event.pointerId) {
        const resize = resizeRef.current;
        next = cropModeRef.current && resize.handle.length === 2
          ? resizeCroppedImage(resize.original, canvas, natural, resize.handle, event.clientX-resize.startX, event.clientY-resize.startY)
          : resizeArtwork(resize.original, canvas, natural, resize.handle, event.clientX-resize.startX, event.clientY-resize.startY, resize.threshold);
      } else if (dragRef.current.active && dragRef.current.pointerId === event.pointerId) {
        const drag = dragRef.current;
        next = cropModeRef.current
          ? repositionArtworkCrop(drag.original, canvas, natural, event.clientX-drag.startX, event.clientY-drag.startY)
          : snapArtworkPosition({ ...drag.original, x: drag.original.x+event.clientX-drag.startX, y: drag.original.y+event.clientY-drag.startY }, canvas, natural, drag.threshold);
      }
      if (next) {
        if (event.cancelable) event.preventDefault();
        commitTransform(next);
        setGuides(cropModeRef.current ? { x: false, y: false } : artworkCenterGuides(next, canvas, natural));
      }
    };
    const end = (event: PointerEvent) => {
      const involved = pointerMapRef.current.has(event.pointerId) || resizeRef.current?.pointerId === event.pointerId;
      pointerMapRef.current.delete(event.pointerId);
      if (!involved) return;
      // A canceled gesture rolls back as one operation; a remaining finger must
      // start a fresh gesture, never jump back to a stale drag origin.
      if (event.type === 'pointercancel' && gestureStart.current && canvasSizeRef.current && naturalSizeRef.current) {
        commitTransform(restoreArtworkTransformFromGeometry(gestureStart.current, canvasSizeRef.current, naturalSizeRef.current, constrainRef.current));
        gestureStart.current = null;
      } else finishHistory();
      pointerMapRef.current.clear();
      pinchRef.current = null;
      dragRef.current.active = false;
      resizeRef.current = null;
      setActiveHandle(null);
      setGuides({ x: false, y: false });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, [commitTransform, finishHistory]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (fitHelp.open || !selected || !internalRef.current || !isTopmostCanvas(internalRef.current)) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); travelHistory(event.shiftKey); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); travelHistory(true); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { if (onDelete) { event.preventDefault(); onDelete(); } }
      else if (event.key === 'Escape') { setCropMode(false); setSelected(false); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); beginHistory();
        const amount = event.shiftKey ? 10 : 1;
        commitTransform({ ...localValueRef.current, x: localValueRef.current.x + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0), y: localValueRef.current.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0) });
        finishHistory();
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [fitHelp.open, selected, onDelete, travelHistory, beginHistory, commitTransform, finishHistory]);

  useEffect(() => {
    if (!selected) return;
    const outside = (event: MouseEvent) => {
      const node = internalRef.current;
      const target = event.target as HTMLElement | null;
      if (!node || !target || node.contains(target) || target.closest('[data-artwork-toolbar="true"], [data-testid="artwork-fit-help"]')) return;
      setSelected(false);
      setCropMode(false);
    };
    // Deselect only after the browser has dispatched the destination click.
    // Collapsing the portaled toolbar during pointerdown can move controls in
    // the surrounding layout before pointerup, causing the intended button
    // (for example Add to Cart) to miss its click entirely.
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [selected]);

  const reset = useCallback(() => { beginHistory(); setSizeReviewNeeded(false); setCropMode(false); onConstrainChange(true); commitTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 }); finishHistory(); }, [commitTransform, onConstrainChange, beginHistory, finishHistory]);
  const fit = reset;
  const fill = useCallback(() => {
    beginHistory();
    onConstrainChange(true);
    setSizeReviewNeeded(false);
    if (!naturalSize || !canvasSizeRef.current) {
      commitTransform({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5 });
      finishHistory();
      return;
    }
    const canvasAspect = canvasSizeRef.current.w / canvasSizeRef.current.h;
    const imageAspect = naturalSize.w / naturalSize.h;
    const scale = clamp(imageAspect > canvasAspect ? imageAspect / canvasAspect : canvasAspect / imageAspect, 1, MAX_SCALE);
    commitTransform({ x: 0, y: 0, scaleX: scale, scaleY: scale });
    finishHistory();
  }, [naturalSize, commitTransform, onConstrainChange, beginHistory, finishHistory]);

  const toolbar = (
    <div
      data-artwork-toolbar="true"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={`pointer-events-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-sm ${compactControls ? 'p-3' : 'p-3 sm:p-4'}`}
    >
      {sizeReviewNeeded && <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
        <p>Your banner shape changed. Check for cropped edges or blank margins.</p>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={fit} className="min-h-11 rounded-lg bg-white px-3 font-semibold text-orange-700">Fit entire artwork</button><button type="button" onClick={() => setSizeReviewNeeded(false)} className="min-h-11 rounded-lg px-3 font-medium">Keep current placement</button></div>
      </div>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={fit} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600">
          <span className="inline-flex items-center gap-1.5"><Minimize2 aria-hidden="true" className="h-4 w-4 shrink-0" />Show entire design</span>
          <span className="text-[11px] font-normal text-slate-500">May leave blank margins</span>
        </button>
        {primaryFitControl || <button type="button" onClick={fill} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600">
          <span className="inline-flex items-center gap-1.5"><Maximize2 aria-hidden="true" className="h-4 w-4 shrink-0" />Fill banner</span>
          <span className="text-[11px] font-normal text-slate-500">Edges may crop</span>
        </button>}
      </div>
      {fitControls}
    </div>
  );

  const handlePositions: Record<ArtworkHandle, React.CSSProperties> = {
    tl: { top: 0, left: 0, cursor: 'nwse-resize' },
    tr: { top: 0, left: '100%', cursor: 'nesw-resize' },
    bl: { top: '100%', left: 0, cursor: 'nesw-resize' },
    br: { top: '100%', left: '100%', cursor: 'nwse-resize' },
    t: { top: 0, left: '50%', cursor: 'ns-resize' },
    b: { top: '100%', left: '50%', cursor: 'ns-resize' },
    l: { top: '50%', left: 0, cursor: 'ew-resize' },
    r: { top: '50%', left: '100%', cursor: 'ew-resize' },
  };
  const handleNames: Record<ArtworkHandle, string> = { tl: 'Resize top left', tr: 'Resize top right', bl: 'Resize bottom left', br: 'Resize bottom right', t: 'Crop top', b: 'Crop bottom', l: 'Crop left', r: 'Crop right' };
  const crop = localValue.crop;
  const cropClip = crop ? `inset(${crop.y*100}% ${(1-crop.x-crop.width)*100}% ${(1-crop.y-crop.height)*100}% ${crop.x*100}%)` : undefined;
  const contextButton = 'flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-slate-700 hover:bg-slate-100 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600';
  const history = getHistory();

  return (
    <div className={`w-full ${className || ''}`} data-testid="artwork-editor">
      <div
        ref={setContainerNode}
        tabIndex={-1}
        className="relative w-full select-none"
        data-testid="artwork-canvas"
        data-crop-mode={cropMode}
        // The measured editor frame must have the exact product ratio. Percentage
        // padding plus a decorative border adds height and makes Fill export
        // an undersized image with white side strips, especially on mobile.
        style={{
          ...canvasStyle,
          aspectRatio: `${100 / parseFloat(paddingPct)}`,
          paddingBottom: 0,
          border: 0,
          outline: canvasStyle?.border,
          outlineOffset: '-1px',
          touchAction: 'none',
          cursor: loading ? 'default' : selected ? 'move' : 'pointer',
        }}
        onPointerDown={startPointer}
        onDoubleClick={() => { setSelected(true); if (enableCropping) setCropMode(true); }}
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-xs text-gray-700">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />Loading artwork…</span>
          </div>
        )}

        <div className="absolute inset-0 overflow-hidden">
        <div data-artwork-image="true" className="absolute" style={!previewError && artworkFrame ? { left: artworkFrame.left, top: artworkFrame.top, width: artworkFrame.width, height: artworkFrame.height } : { inset: 0 }}>
          {cropMode && crop && <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: `url("${imageSrc.replace(/"/g, '%22')}")`, backgroundSize: '100% 100%' }} />}
          {previewError ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/95 p-4 text-center text-sm text-red-700">
              <span className="max-w-full break-words">{previewError}</span>
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
              style={{ clipPath: cropClip }}
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
        </div>
        {!loading && naturalSize && selected && !previewError && selectionFrame && canvasSize && (
          <>
            {guides.x && <div data-testid="artwork-guide-x" className="pointer-events-none absolute inset-y-0 left-1/2 z-20 border-l border-fuchsia-500" />}
            {guides.y && <div data-testid="artwork-guide-y" className="pointer-events-none absolute inset-x-0 top-1/2 z-20 border-t border-fuchsia-500" />}
            <div data-testid="artwork-selection" data-artwork-image="true" className="absolute z-10" style={{ ...selectionFrame, outline: '1.5px solid #8b3dff', touchAction: 'none', cursor: cropMode ? 'grab' : 'move' }}>
              {cropMode && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, transparent 33.2%, #ffffff88 33.2%, #ffffff88 33.5%, transparent 33.5%, transparent 66.5%, #ffffff88 66.5%, #ffffff88 66.8%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, #ffffff88 33.2%, #ffffff88 33.5%, transparent 33.5%, transparent 66.5%, #ffffff88 66.5%, #ffffff88 66.8%, transparent 66.8%)' }} />}
              {((enableCropping ? ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'] : ['tl', 'tr', 'bl', 'br']) as ArtworkHandle[]).map(handle => (
                <button type="button" aria-label={handleNames[handle]} key={handle} data-handle={handle} onPointerDown={startResize(handle)} className="absolute z-30 flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500" style={{ ...handlePositions[handle], ...(cropMode && handle.length === 2 && artworkFrame ? { left: artworkFrame.left-selectionFrame.left + (handle.includes('r') ? artworkFrame.width : 0), top: artworkFrame.top-selectionFrame.top + (handle.includes('b') ? artworkFrame.height : 0) } : {}), transform: 'translate(-50%, -50%)', touchAction: 'none' }}>
                  <span className={`block border border-violet-500 shadow-sm ${activeHandle === handle ? 'bg-violet-500' : 'bg-white'} ${handle.length === 2 ? 'h-3 w-3 rounded-full' : handle === 't' || handle === 'b' ? 'h-1.5 w-5 rounded-full' : 'h-5 w-1.5 rounded-full'}`} />
                </button>
              ))}
            </div>
            <div data-artwork-toolbar="true" role="toolbar" aria-label="Selected artwork" className="absolute z-40 flex w-[244px] items-center justify-center rounded-xl border border-slate-200 bg-white p-1 shadow-md" style={{ top: Math.max(-80, Math.min(selectionFrame.top - 80, canvasSize.h - 80)), left: canvasSize.w < 244 ? (canvasSize.w - 244) / 2 : clamp(selectionFrame.left + selectionFrame.width/2 - 122, 0, canvasSize.w - 244) }} onPointerDown={e => e.stopPropagation()}>
              <button type="button" aria-label="Undo artwork change" title="Undo" disabled={!history.past.length} onClick={() => travelHistory()} className={contextButton}><Undo2 size={18} /></button>
              <button type="button" aria-label="Redo artwork change" title="Redo" disabled={!history.future.length} onClick={() => travelHistory(true)} className={contextButton}><Redo2 size={18} /></button>
              <span className="mx-1 h-5 border-l border-slate-200" />
              {enableCropping && <button type="button" aria-label={cropMode ? 'Done cropping' : 'Crop artwork'} aria-pressed={cropMode} onClick={() => setCropMode(!cropMode)} className={`${contextButton} gap-1 text-xs font-semibold`}>
                {cropMode ? <Check size={18} /> : <Crop size={18} />}{cropMode ? 'Done' : 'Crop'}
              </button>}
              {onDelete && <button type="button" aria-label="Delete selected artwork" title="Delete" onClick={onDelete} className={`${contextButton} text-red-600`}><Trash2 size={18} /></button>}
            </div>
          </>
        )}

        {showDragHint && <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"><span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">Drag to reposition · Drag corners to resize</span></div>}
        {overlay}
      </div>

      {!loading && !previewError && !mobileToolbarContainer && <div className="mt-3 flex justify-center">{toolbar}</div>}
      {!loading && !previewError && mobileToolbarContainer
        ? createPortal(<div className="flex w-full justify-center">{toolbar}</div>, mobileToolbarContainer)
        : null}
      <ArtworkFitHelp open={fitHelp.open} onDismiss={fitHelp.dismiss} assistance={fitAssistance} imageSrc={imageSrc}
        onReturnFocus={() => internalRef.current?.focus({ preventScroll: true })} />
    </div>
  );
});

ArtworkPreviewEditor.displayName = 'ArtworkPreviewEditor';

export default ArtworkPreviewEditor;
