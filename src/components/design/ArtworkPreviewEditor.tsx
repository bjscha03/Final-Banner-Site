import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Maximize2, Minimize2, Link2, Unlink2 } from 'lucide-react';

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
  /**
   * Optional mount point for rendering the Fit/Fill/Reset/Resize-mode toolbar
   * BELOW the canvas. When provided, the floating canvas overlay is hidden
   * on EVERY screen size (desktop + mobile) and the toolbar is rendered
   * via React portal into this container. This keeps the toolbar off the
   * printable artwork area so previews/exports match the canvas exactly.
   * The container is typically a `<div ref={...} />` placed immediately
   * below the preview frame in the page layout.
   *
   * (Legacy name kept for backward compatibility with existing call sites.)
   */
  mobileToolbarContainer?: HTMLElement | null;
  /** Optional CORS attribute forwarded to the underlying <img>. Required
   *  when the host page generates a canvas thumbnail from the rendered
   *  image (e.g. yard sign preview save). */
  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';
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
  mobileToolbarContainer,
  imageCrossOrigin,
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

  // Refs that mirror props/state so non-React listeners (resize observer,
  // window pointer events, rAF callbacks) always read the latest values
  // without retriggering the effect on every render.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const constrainRef = useRef(constrain);
  constrainRef.current = constrain;

  // Track image natural size so we can size the transform wrapper to the
  // *actual rendered image rect* (not the full canvas). This is critical:
  // the selection box and resize handles live inside the same wrapper as
  // the image, so they always sit exactly on the image corners — even
  // when image aspect != canvas aspect (otherwise object-contain
  // letterboxing leaves the handles out in space).
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  useEffect(() => {
    setNaturalSize(null);
    setIsImageLoading(true);
  }, [src]);
  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth && t.naturalHeight) {
      setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
    }
    setIsImageLoading(false);
  }, []);

  // Track canvas (outer surface) size so we can compute the contained
  // image rect on every layout change, including viewport resizes and
  // mobile rotation.
  //
  // CRITICAL: when the canvas resizes (e.g. window resize, orientation
  // change, container width change because the user switched between
  // mobile / desktop layouts) we MUST rescale the artwork's pixel-based
  // translate so the artwork stays anchored to the same canvas-relative
  // position the rulers are measuring. Otherwise the artwork drifts off
  // the canvas because translate is in px while the canvas itself shrank
  // or grew. This keeps artwork and ruler in a single coordinate system
  // (canvas-relative percent) without changing the external API
  // (page-level cart serialization continues to read px and convert to
  // percent of container width — so percent-of-canvas stays stable).
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const lastCanvasSizeRef = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const node = internalRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const next = { w: r.width, h: r.height };
      const prev = lastCanvasSizeRef.current;
      if (prev && (prev.w !== next.w || prev.h !== next.h)) {
        // Rescale current pixel translate so artwork stays at the same
        // canvas-relative position.
        const sx = next.w / prev.w;
        const sy = next.h / prev.h;
        const v = valueRef.current;
        if (v && (v.x !== 0 || v.y !== 0) && Number.isFinite(sx) && Number.isFinite(sy)) {
          onChangeRef.current?.({ ...v, x: v.x * sx, y: v.y * sy });
        }
      }
      lastCanvasSizeRef.current = next;
      setCanvasSize((p) => (p && p.w === next.w && p.h === next.h ? p : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [paddingPct]);

  // Compute the contained image rect (object-fit: contain) from natural
  // image size + canvas size. SINGLE SOURCE OF TRUTH used by:
  //   - the transform wrapper that contains <img>
  //   - the selection bounding box
  //   - the resize handles
  //   - the resize math (corner offset = ±containedW/2 * scaleX)
  const containedRect = (() => {
    if (!canvasSize || !naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) return null;
    const canvasAspect = canvasSize.w / canvasSize.h;
    const imgAspect = naturalSize.w / naturalSize.h;
    let w: number;
    let h: number;
    if (imgAspect > canvasAspect) {
      w = canvasSize.w;
      h = canvasSize.w / imgAspect;
    } else {
      h = canvasSize.h;
      w = canvasSize.h * imgAspect;
    }
    return {
      w,
      h,
      left: (canvasSize.w - w) / 2,
      top: (canvasSize.h - h) / 2,
    };
  })();

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

  // ------- Multi-touch pointer tracking (pinch-to-scale support) -------
  // We track every pointer that came down on this canvas surface in a
  // Map keyed by pointerId. When 2 pointers are active we treat it as a
  // pinch gesture; otherwise the existing single-pointer drag / resize
  // behavior runs.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Pinch gesture snapshot — captured once on pinch start so per-frame
  // updates are stable and free of jitter.
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startCenterX: number; // client coords midpoint at pinch start
    startCenterY: number;
    canvasCenterX: number; // client coords canvas center at pinch start
    canvasCenterY: number;
    startScaleX: number;
    startScaleY: number;
    startX: number;
    startY: number;
    pending: { x: number; y: number; scaleX: number; scaleY: number } | null;
    raf: number | null;
  } | null>(null);

  const flushPinch = useCallback(() => {
    const p = pinchRef.current;
    if (!p) return;
    p.raf = null;
    if (p.pending) {
      onChangeRef.current(p.pending);
      p.pending = null;
    }
  }, []);

  const startPinchIfReady = useCallback(() => {
    const node = internalRef.current;
    if (!node) return;
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist < 1) return;
    const rect = node.getBoundingClientRect();
    // Cancel any in-progress drag/resize so they don't compete.
    dragRef.current.active = false;
    if (resizeRef.current) resizeRef.current.active = false;
    pinchRef.current = {
      active: true,
      startDist: dist,
      startCenterX: (p1.x + p2.x) / 2,
      startCenterY: (p1.y + p2.y) / 2,
      canvasCenterX: rect.left + rect.width / 2,
      canvasCenterY: rect.top + rect.height / 2,
      startScaleX: valueRef.current.scaleX,
      startScaleY: valueRef.current.scaleY,
      startX: valueRef.current.x,
      startY: valueRef.current.y,
      pending: null,
      raf: null,
    };
  }, []);

  const updatePinch = useCallback(() => {
    const p = pinchRef.current;
    if (!p || !p.active) return;
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1 || p.startDist < 1) return;
    let ratio = dist / p.startDist;
    // Clamp ratio so resulting scale stays within [CLAMP_MIN, CLAMP_MAX].
    const baseScale = Math.max(p.startScaleX, p.startScaleY, 0.0001);
    const minRatio = CLAMP_MIN / baseScale;
    const maxRatio = CLAMP_MAX / baseScale;
    ratio = clamp(ratio, minRatio, maxRatio);
    const newScaleX = clamp(p.startScaleX * ratio, CLAMP_MIN, CLAMP_MAX);
    const newScaleY = clamp(p.startScaleY * ratio, CLAMP_MIN, CLAMP_MAX);
    // Scale around the pinch midpoint: keep the world-space point that
    // started under the pinch center anchored to the (now possibly drifted)
    // current pinch center. Solving the scale-about-point equation with
    // transform-origin "50% 50%":
    //   newX = (currentCenter - canvasCenter) - ratio * (startCenter - canvasCenter - startX)
    const newX = cx - p.canvasCenterX - ratio * (p.startCenterX - p.canvasCenterX - p.startX);
    const newY = cy - p.canvasCenterY - ratio * (p.startCenterY - p.canvasCenterY - p.startY);
    p.pending = { x: newX, y: newY, scaleX: newScaleX, scaleY: newScaleY };
    if (p.raf === null) {
      p.raf = requestAnimationFrame(flushPinch);
    }
  }, [flushPinch]);

  const endPinch = useCallback(() => {
    const p = pinchRef.current;
    if (!p) return;
    if (p.raf !== null) {
      cancelAnimationFrame(p.raf);
      p.raf = null;
    }
    if (p.pending) {
      onChangeRef.current(p.pending);
      p.pending = null;
    }
    pinchRef.current = null;
  }, []);

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
      // If the pointerdown originated inside the floating controls toolbar
      // (Fit / Fill / Reset / Locked), bail out completely — do NOT call
      // preventDefault or setPointerCapture, otherwise the synthesized
      // click event for the button gets suppressed and the buttons appear
      // dead. The toolbar pill is rendered absolutely INSIDE this canvas
      // div so its pointerdown bubbles up here.
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && typeof targetEl.closest === 'function' && targetEl.closest('[data-artwork-toolbar="true"]')) {
        return;
      }

      // Track this pointer for multi-touch (pinch) detection. We register
      // BOTH mouse and touch/pen pointers — pinch only ever engages with
      // 2+ touch-like pointers in practice (a desktop user has 1 mouse).
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Try to capture so subsequent move/up events fire reliably even
      // if the finger drifts off the element.
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      // If we now have 2 active pointers, start a pinch and bail out of
      // drag/resize entirely.
      if (pointersRef.current.size >= 2) {
        e.preventDefault();
        setSelected(true);
        startPinchIfReady();
        return;
      }

      // Single-pointer path: existing drag behavior.
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      // Don't trigger drag from a resize handle.
      const target = e.target as HTMLElement;
      if (target.dataset && target.dataset.handle) return;
      e.preventDefault();
      setSelected(true);
      beginDrag(e.clientX, e.clientY);
    },
    [beginDrag, startPinchIfReady],
  );

  // Global pointer move/up so dragging keeps working even when the cursor
  // briefly leaves the canvas (matches Canva-style UX expectations).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Always update tracked pointer position if we know about it.
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Pinch path takes priority over drag/resize.
      if (pinchRef.current?.active) {
        e.preventDefault?.();
        updatePinch();
        return;
      }

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
        onChangeRef.current({ x: r.startX, y: r.startY, scaleX: newScaleX, scaleY: newScaleY });
        return;
      }
      if (dragRef.current.active) {
        const d = dragRef.current;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        onChangeRef.current({ ...valueRef.current, x: d.origX + dx, y: d.origY + dy });
      }
    };
    const onUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      // End pinch when fewer than 2 pointers remain.
      if (pinchRef.current?.active && pointersRef.current.size < 2) {
        endPinch();
      }
      // If no pointers remain at all, also end drag/resize.
      if (pointersRef.current.size === 0) {
        dragRef.current.active = false;
        if (resizeRef.current) resizeRef.current.active = false;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [updatePinch, endPinch]);

  // Begin a resize from a corner handle.
  const beginResize = useCallback(
    (corner: Corner) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const node = internalRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      // Resize math is in *image space*: corner offset from the image
      // center is ±(containedW/2 * scaleX) horizontally, ±(containedH/2 *
      // scaleY) vertically. Use the contained image rect (not the full
      // canvas) so the math matches what the user sees and grabs.
      const imgW = containedRect ? containedRect.w : rect.width;
      const imgH = containedRect ? containedRect.h : rect.height;
      const imgCenterX = containedRect
        ? rect.left + containedRect.left + containedRect.w / 2
        : rect.left + rect.width / 2;
      const imgCenterY = containedRect
        ? rect.top + containedRect.top + containedRect.h / 2
        : rect.top + rect.height / 2;
      resizeRef.current = {
        active: true,
        corner,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        centerX: imgCenterX,
        centerY: imgCenterY,
        canvasW: imgW,
        canvasH: imgH,
        startScaleX: valueRef.current.scaleX,
        startScaleY: valueRef.current.scaleY,
        startX: valueRef.current.x,
        startY: valueRef.current.y,
      };
      setSelected(true);
    },
    [containedRect],
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
      // Image wider than canvas → contained height = rect.height; the cover
      // scale is imgAspect / canvasAspect.
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

  // Click-outside-to-deselect. When the artwork is selected, listen for
  // pointerdown events anywhere in the document and clear `selected` if
  // the event target is outside the canvas. We deliberately ignore events
  // while a drag/resize/pinch is in progress so the user doesn't lose
  // their selection mid-gesture (the gesture itself originates outside
  // the image bounds for resize handles, but those use stopPropagation
  // and the pointerdown still falls within the canvas root, so the
  // contains() check is sufficient).
  useEffect(() => {
    if (!selected) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        dragRef.current.active ||
        resizeRef.current?.active ||
        pinchRef.current?.active
      ) {
        return;
      }
      const node = internalRef.current;
      if (!node) return;
      const target = e.target as Node | null;
      if (target && node.contains(target)) return;
      // Allow clicks on the toolbar (rendered via portal outside the
      // canvas) without deselecting — losing selection would also unmount
      // the toolbar before its click handler runs.
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl &&
        typeof targetEl.closest === 'function' &&
        targetEl.closest('[data-artwork-toolbar="true"]')
      ) {
        return;
      }
      setSelected(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [selected]);

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
          cursor: isImageLoading ? 'default' : selected ? 'move' : 'pointer',
          ...canvasStyle,
        }}
        onPointerDown={onPointerDown}
        onClick={(e) => {
          if (!dragRef.current.active) setSelected(true);
          e.stopPropagation();
        }}
      >
        {/* Artwork transform wrapper. Sized to the *visible image rect*
            (not the full canvas) so the selection box and corner handles
            inside it sit exactly on the image corners regardless of
            aspect ratio. translate3d + non-uniform scale.

            Until the image has loaded (and we know natural size + canvas
            size), fall back to filling the canvas so the <img> can render
            and report its natural dimensions. */}
        <div
          className="absolute"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(110deg, rgba(229,231,235,0.7) 8%, rgba(243,244,246,0.95) 18%, rgba(229,231,235,0.7) 33%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.2s linear infinite',
            opacity: isImageLoading ? 1 : 0,
            transition: 'opacity 160ms ease',
            pointerEvents: 'none',
            zIndex: 12,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: isImageLoading ? 1 : 0, transition: 'opacity 160ms ease', zIndex: 13 }}
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs text-gray-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            Loading artwork…
          </span>
        </div>
        <div
          className="absolute"
          style={
            containedRect
              ? {
                  left: containedRect.left,
                  top: containedRect.top,
                  width: containedRect.w,
                  height: containedRect.h,
                  transform: `translate3d(${value.x}px, ${value.y}px, 0) scale(${value.scaleX}, ${value.scaleY})`,
                  transformOrigin: '50% 50%',
                  willChange: 'transform',
                }
              : {
                  inset: 0,
                  transform: `translate3d(${value.x}px, ${value.y}px, 0) scale(${value.scaleX}, ${value.scaleY})`,
                  transformOrigin: '50% 50%',
                  willChange: 'transform',
                }
          }
        >
          <img
            src={src}
            alt={alt}
            onLoad={onImgLoad}
            draggable={false}
            crossOrigin={imageCrossOrigin}
            className={
              'absolute inset-0 w-full h-full pointer-events-none ' +
              (containedRect ? '' : 'object-contain')
            }
          />
          {/* Selection bounding box + handles (only when selected) */}
          {!isImageLoading && selected && (
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

        {/* Selection-only controls overlay. Positioned absolutely INSIDE
            the canvas region so it does NOT add layout height — that
            kept the parent ruler frame from misaligning the left ruler
            (left ruler height was reading wrapper height = canvas + the
            old in-flow toolbar). Canva-style floating pill at the bottom
            center of the canvas.

            When `mobileToolbarContainer` is provided the overlay is
            hidden on EVERY screen size and the toolbar renders BELOW the
            canvas via portal so the controls never cover the printable
            artwork — on desktop or mobile. */}
        {!isImageLoading && selected && !mobileToolbarContainer && (
          <div
            className="absolute left-1/2 z-30 pointer-events-none"
            style={{
              bottom: 8,
              transform: 'translateX(-50%)',
            }}
          >
            {renderToolbarPill('overlay')}
          </div>
        )}
      </div>
      {/* Toolbar rendered below the canvas via portal so it doesn't sit
          on top of the printable artwork. Used for both desktop and
          mobile when the host page provides a mount point. */}
      {!isImageLoading && selected && mobileToolbarContainer
        ? createPortal(
            <div className="flex justify-center w-full">
              {renderToolbarPill('mobile')}
            </div>,
            mobileToolbarContainer,
          )
        : null}
    </div>
  );

  function renderToolbarPill(variant: 'overlay' | 'mobile') {
    // The overlay variant sits on top of the canvas — keep labels hidden
    // on small screens to stay compact. The "mobile" variant (used for
    // both desktop and mobile when toolbar is portaled below the canvas)
    // has plenty of room, so always show labels there.
    const labelClass = variant === 'mobile' ? 'inline' : 'hidden sm:inline';
    return (
      <div className="flex flex-col items-center">
      <div
        data-artwork-toolbar="true"
        // Bubble-phase only. Do NOT use capture-phase stopPropagation:
        // that would prevent the click event from reaching the button's
        // own onClick handler. These listeners run AFTER the button
        // onClick fires and just stop the event from also reaching the
        // canvas's onPointerDown / onClick handlers above.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={
          'pointer-events-auto inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-gray-200/70 ' +
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
          <span className={labelClass}>Fit</span>
        </button>
        <button
          type="button"
          onClick={fill}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
          aria-label="Fill canvas with artwork"
          title="Fill canvas"
        >
          <Maximize2 className="w-4 h-4" />
          <span className={labelClass}>Fill</span>
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-full transition-colors"
          aria-label="Reset artwork position and scale"
          title="Reset"
        >
          <RotateCcw className="w-4 h-4" />
          <span className={labelClass}>Reset</span>
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
          aria-label={constrain ? 'Keep proportions enabled' : 'Free resize enabled'}
          title={constrain ? 'Keep proportions: ON' : 'Free resize: ON'}
        >
          {constrain ? <Link2 className="w-4 h-4" /> : <Unlink2 className="w-4 h-4" />}
          <span className={labelClass}>{constrain ? 'Keep Proportions' : 'Free Resize'}</span>
        </button>
      </div>
      <p className="mt-1.5 px-2 text-[11px] leading-snug text-gray-500 text-center">
        Keep proportions on to avoid stretched or distorted artwork.
      </p>
    </div>
    );
  }
};

export default ArtworkPreviewEditor;
