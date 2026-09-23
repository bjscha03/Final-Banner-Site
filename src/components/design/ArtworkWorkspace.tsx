import React, { createContext, useLayoutEffect, useRef, useState } from 'react';

export const ArtworkWorkspaceZoomContext = createContext(1);
export const ArtworkCameraGestureContext = createContext<React.MutableRefObject<boolean> | null>(null);

/** Camera controls only. The child canvas retains its own unscaled print geometry. */
export default function ArtworkWorkspace({ children, aspect, expanded = false }: { children: React.ReactNode; aspect: number; expanded?: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 240, stageW: 236, stageH: 146 });
  const cameraGesture = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | { kind: 'pan' | 'pinch'; startX: number; startY: number; distance: number; zoom: number; cx: number; cy: number; anchorX: number; anchorY: number }>(null);
  const [view, setView] = useState({ zoom: 1, cx: 0.5, cy: 0.5 });
  useLayoutEffect(() => {
    const viewport = viewportRef.current, stage = stageRef.current;
    if (!viewport || !stage) return;
    const measure = () => setSize(previous => {
      const next = { w: viewport.clientWidth, h: viewport.clientHeight, stageW: stage.offsetWidth, stageH: stage.offsetHeight };
      return Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next;
    });
    const observer = new ResizeObserver(measure);
    observer.observe(viewport); observer.observe(stage); measure();
    return () => observer.disconnect();
  }, []);
  const showAll = () => {
    const stage = stageRef.current;
    const outline = stage?.querySelector('[data-artwork-frame]');
    if (!stage || !outline) { setView({ zoom: 1, cx: 0.5, cy: 0.5 }); return; }
    const page = stage.getBoundingClientRect(), art = outline.getBoundingClientRect();
    const left = Math.min(0, (art.left - page.left) / view.zoom);
    const top = Math.min(0, (art.top - page.top) / view.zoom);
    const right = Math.max(size.stageW, (art.right - page.left) / view.zoom);
    const bottom = Math.max(size.stageH, (art.bottom - page.top) / view.zoom);
    setView({ zoom: Math.min(1, (size.w - 56) / (right - left), (size.h - 56) / (bottom - top)),
      cx: (left + right) / 2 / size.stageW, cy: (top + bottom) / 2 / size.stageH });
  };
  const startCamera = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = (a.x + b.x) / 2, centerY = (a.y + b.y) / 2;
      cameraGesture.current = true;
      gesture.current = { kind: 'pinch', startX: centerX, startY: centerY,
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), ...view,
        anchorX: (centerX - rect.left - size.w / 2) / view.zoom + size.stageW * view.cx,
        anchorY: (centerY - rect.top - size.h / 2) / view.zoom + size.stageH * view.cy };
    } else if (!(event.target as HTMLElement).closest('[data-artwork-canvas]')) {
      cameraGesture.current = true;
      gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY,
        distance: 1, ...view, anchorX: 0, anchorY: 0 };
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported capture */ }
  };
  const moveCamera = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = gesture.current;
    if (!cameraGesture.current || !start) return;
    event.preventDefault();
    if (start.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const zoom = Math.max(0.02, Math.min(2, start.zoom * Math.hypot(a.x - b.x, a.y - b.y) / start.distance));
      setView({ zoom,
        cx: (size.w / 2 - ((a.x + b.x) / 2 - rect.left) + start.anchorX * zoom) / (size.stageW * zoom),
        cy: (size.h / 2 - ((a.y + b.y) / 2 - rect.top) + start.anchorY * zoom) / (size.stageH * zoom) });
    } else if (start.kind === 'pan') {
      setView({ zoom: start.zoom, cx: start.cx - (event.clientX - start.startX) / (size.stageW * start.zoom),
        cy: start.cy - (event.clientY - start.startY) / (size.stageH * start.zoom) });
    }
  };
  const endCamera = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    // Do not turn the remaining finger after a view pinch into an artwork drag.
    if (pointers.current.size < 2 && gesture.current?.kind === 'pinch') gesture.current = null;
    if (!pointers.current.size) { cameraGesture.current = false; gesture.current = null; }
  };
  return <div className={`w-full ${expanded ? 'flex h-full min-h-0 flex-col' : ''}`} data-artwork-workspace="true">
    <div data-artwork-toolbar="true" className="flex shrink-0 items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 py-1 text-xs">
      <div className="flex items-center gap-1" role="group" aria-label="Workspace zoom">
        <button type="button" aria-label="Zoom workspace out" className="min-h-11 min-w-11 rounded-lg hover:bg-slate-100" onClick={() => setView(v => ({ ...v, zoom: Math.max(0.02, v.zoom / 1.25) }))}>−</button>
        <button type="button" aria-label="Fit banner in workspace" title="Fit banner in workspace" className="min-h-11 w-10 text-center tabular-nums" onClick={() => setView({ zoom: 1, cx: 0.5, cy: 0.5 })}>{Math.round(view.zoom * 100)}%</button>
        <button type="button" aria-label="Zoom workspace in" className="min-h-11 min-w-11 rounded-lg hover:bg-slate-100" onClick={() => setView(v => ({ ...v, zoom: Math.min(2, v.zoom * 1.25) }))}>+</button>
      </div>
      <button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-slate-700 hover:bg-slate-100" aria-label="Show whole artwork" title="Show whole artwork and resize handles" onClick={showAll}>Show all</button>
    </div>
    <div ref={viewportRef} className={`relative isolate overflow-hidden bg-slate-100 ${expanded ? 'min-h-0 flex-1' : ''}`}
      onPointerDownCapture={startCamera} onPointerMoveCapture={moveCamera} onPointerUpCapture={endCamera} onPointerCancelCapture={endCamera}
      style={{ touchAction: 'none', ...(expanded ? {} : { height: Math.max(120, Math.min(620, (size.w - 76) * aspect + 76)) }) }}>
      <div ref={stageRef} style={{ position: 'absolute', width: Math.max(48, Math.min(size.w - 48, (size.h - 76) / aspect + 28)),
        left: size.w / 2 - size.stageW * view.cx * view.zoom, top: size.h / 2 - size.stageH * view.cy * view.zoom,
        transform: `scale(${view.zoom})`, transformOrigin: 'top left' }}>
        <ArtworkCameraGestureContext.Provider value={cameraGesture}><ArtworkWorkspaceZoomContext.Provider value={view.zoom}>{children}</ArtworkWorkspaceZoomContext.Provider></ArtworkCameraGestureContext.Provider>
      </div>
    </div>
    <p className="shrink-0 bg-white px-3 py-1 text-center text-[11px] text-slate-500">Only the banner area prints.</p>
  </div>;
}
