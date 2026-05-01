import { useCallback, useEffect, useRef } from 'react';

/**
 * Single source of truth for pointer-based artwork interactions
 * (drag, corner-resize, two-finger pinch).
 *
 * Built around the Pointer Events API so that mouse, touch, and pen are
 * handled identically and we get correct multi-touch behaviour on iOS Safari,
 * Chrome mobile, Android Chrome and tablets.
 *
 * Usage:
 *   const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } =
 *     useCanvasInteraction({
 *       getTransform: () => ({ x, y, scaleX, scaleY }),
 *       onChange: (next, kind) => { ... },        // commit during gesture (rAF batched)
 *       onCommit: (final) => { ... },             // commit on pointer up
 *       getMode: (target) => 'drag' | 'resize-nw' | ...,
 *       constrainProportions: true,
 *       minScale: 0.1,
 *       maxScale: 5,
 *     });
 *
 * Spread the returned handlers on the interaction layer (`<div>` or `<svg>`).
 */

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation?: number;
}

export type InteractionKind =
  | 'idle'
  | 'drag'
  | 'resize-nw'
  | 'resize-ne'
  | 'resize-sw'
  | 'resize-se'
  | 'pinch';

export interface UseCanvasInteractionOptions {
  /** Read the current artwork transform. Called on gesture start. */
  getTransform: () => Transform;
  /** Decide what gesture a single-pointer event triggers (drag vs corner resize). */
  getMode?: (target: EventTarget | null) => Exclude<InteractionKind, 'pinch' | 'idle'> | null;
  /** Called on every animation frame during the gesture. */
  onChange: (next: Transform, kind: InteractionKind) => void;
  /** Called once when the gesture ends (pointerup/cancel). */
  onCommit?: (final: Transform, kind: InteractionKind) => void;
  /** Lock aspect ratio for both pinch and corner resize (default: true). */
  constrainProportions?: boolean;
  minScale?: number;
  maxScale?: number;
  /** When true, calls preventDefault on pointermove while a gesture is active. */
  preventDefaultOnMove?: boolean;
}

interface PointerInfo {
  id: number;
  x: number;
  y: number;
}

const distance = (a: PointerInfo, b: PointerInfo) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: PointerInfo, b: PointerInfo) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function useCanvasInteraction(opts: UseCanvasInteractionOptions) {
  const {
    getTransform,
    getMode,
    onChange,
    onCommit,
    constrainProportions = true,
    minScale = 0.1,
    maxScale = 5,
    preventDefaultOnMove = true,
  } = opts;

  // Active pointers, keyed by pointerId.
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  // Current gesture kind.
  const kindRef = useRef<InteractionKind>('idle');
  // Snapshot of the transform when the gesture started.
  const initialTransformRef = useRef<Transform | null>(null);
  // Single-pointer drag/resize start position.
  const singleStartRef = useRef<{ x: number; y: number } | null>(null);
  // Pinch start state.
  const pinchStartDistRef = useRef(0);
  const pinchStartMidRef = useRef<{ x: number; y: number } | null>(null);
  // Pending transform (for rAF batching).
  const pendingRef = useRef<Transform | null>(null);
  const rafRef = useRef<number | null>(null);
  // Last applied transform (used by onCommit).
  const lastAppliedRef = useRef<Transform | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (!pendingRef.current) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    lastAppliedRef.current = next;
    onChange(next, kindRef.current);
  }, [onChange]);

  const schedule = useCallback(
    (next: Transform) => {
      pendingRef.current = next;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const reset = useCallback(() => {
    pointersRef.current.clear();
    kindRef.current = 'idle';
    initialTransformRef.current = null;
    singleStartRef.current = null;
    pinchStartDistRef.current = 0;
    pinchStartMidRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const pointer: PointerInfo = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      pointersRef.current.set(pointer.id, pointer);

      // Capture so we keep getting events even if the finger leaves the layer.
      try {
        (e.currentTarget as Element).setPointerCapture?.(pointer.id);
      } catch {
        /* noop */
      }

      const count = pointersRef.current.size;
      const t = getTransform();

      if (count === 1) {
        const mode =
          (getMode && getMode(e.target)) ?? ('drag' as const);
        kindRef.current = mode;
        initialTransformRef.current = { ...t };
        singleStartRef.current = { x: pointer.x, y: pointer.y };
      } else if (count === 2) {
        // Transition from 1→2 pointers: begin pinch from CURRENT transform
        // so there is no jump.
        const ptrs = Array.from(pointersRef.current.values());
        kindRef.current = 'pinch';
        initialTransformRef.current = { ...t };
        pinchStartDistRef.current = distance(ptrs[0], ptrs[1]);
        pinchStartMidRef.current = midpoint(ptrs[0], ptrs[1]);
        singleStartRef.current = null;
      }
    },
    [getMode, getTransform]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const stored = pointersRef.current.get(e.pointerId);
      if (!stored) return;
      stored.x = e.clientX;
      stored.y = e.clientY;

      if (kindRef.current === 'idle') return;
      if (preventDefaultOnMove) {
        // Stop iOS rubber-band / page scroll while a gesture is active.
        e.preventDefault();
      }

      const initial = initialTransformRef.current;
      if (!initial) return;

      if (kindRef.current === 'pinch') {
        const ptrs = Array.from(pointersRef.current.values());
        if (ptrs.length < 2 || !pinchStartMidRef.current) return;
        const currDist = distance(ptrs[0], ptrs[1]);
        if (pinchStartDistRef.current <= 0) return;
        const ratio = currDist / pinchStartDistRef.current;
        const newScaleX = clamp(initial.scaleX * ratio, minScale, maxScale);
        const newScaleY = constrainProportions
          ? newScaleX
          : clamp(initial.scaleY * ratio, minScale, maxScale);
        const currMid = midpoint(ptrs[0], ptrs[1]);
        const startMid = pinchStartMidRef.current;
        // Anchor scale around the (moving) midpoint AND follow midpoint drift.
        const sxRatio = newScaleX / initial.scaleX || 1;
        const syRatio = newScaleY / initial.scaleY || 1;
        const newX =
          currMid.x - (startMid.x - initial.x) * sxRatio;
        const newY =
          currMid.y - (startMid.y - initial.y) * syRatio;
        schedule({
          x: newX,
          y: newY,
          scaleX: newScaleX,
          scaleY: newScaleY,
          rotation: initial.rotation,
        });
        return;
      }

      const start = singleStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (kindRef.current === 'drag') {
        schedule({
          x: initial.x + dx,
          y: initial.y + dy,
          scaleX: initial.scaleX,
          scaleY: initial.scaleY,
          rotation: initial.rotation,
        });
        return;
      }

      // Corner resize: scale anchored to the OPPOSITE corner.
      // Approximation that works for centered-anchor layouts: dominant axis
      // delta drives a uniform scale factor, then position is shifted so the
      // opposite corner stays put.
      let signX = 1;
      let signY = 1;
      if (kindRef.current === 'resize-nw') {
        signX = -1;
        signY = -1;
      } else if (kindRef.current === 'resize-ne') {
        signX = 1;
        signY = -1;
      } else if (kindRef.current === 'resize-sw') {
        signX = -1;
        signY = 1;
      } else if (kindRef.current === 'resize-se') {
        signX = 1;
        signY = 1;
      }
      // Use diagonal projection so cross-axis drift doesn't fight you.
      const diag = (signX * dx + signY * dy) / Math.SQRT2;
      // 200px of diagonal ≈ 1.0x scale change; tunable.
      const scaleDelta = diag / 200;
      const newScaleX = clamp(initial.scaleX + scaleDelta, minScale, maxScale);
      const newScaleY = constrainProportions
        ? newScaleX
        : clamp(initial.scaleY + scaleDelta, minScale, maxScale);
      schedule({
        x: initial.x,
        y: initial.y,
        scaleX: newScaleX,
        scaleY: newScaleY,
        rotation: initial.rotation,
      });
    },
    [
      constrainProportions,
      maxScale,
      minScale,
      preventDefaultOnMove,
      schedule,
    ]
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      // Flush any pending transform so the React state is up to date.
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pendingRef.current) {
        lastAppliedRef.current = pendingRef.current;
        onChange(pendingRef.current, kindRef.current);
        pendingRef.current = null;
      }

      if (pointersRef.current.size === 0) {
        const finalT = lastAppliedRef.current ?? getTransform();
        const kind = kindRef.current;
        reset();
        onCommit?.(finalT, kind);
      } else if (pointersRef.current.size === 1 && kindRef.current === 'pinch') {
        // Pinch released into a single-finger drag: rebase from current state.
        const remaining = Array.from(pointersRef.current.values())[0];
        kindRef.current = 'drag';
        initialTransformRef.current = lastAppliedRef.current
          ? { ...lastAppliedRef.current }
          : getTransform();
        singleStartRef.current = { x: remaining.x, y: remaining.y };
        pinchStartDistRef.current = 0;
        pinchStartMidRef.current = null;
      }
    },
    [getTransform, onChange, onCommit, reset]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => finish(e),
    [finish]
  );
  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => finish(e),
    [finish]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    /** True if a gesture (drag/resize/pinch) is currently in progress. */
    isActive: () => kindRef.current !== 'idle',
  };
}
