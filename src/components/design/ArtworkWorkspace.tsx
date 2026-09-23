import React, { createContext, useLayoutEffect, useRef, useState } from 'react';

export const ArtworkWorkspaceZoomContext = createContext(1);

/** Camera controls only. The child canvas retains its own unscaled print geometry. */
export default function ArtworkWorkspace({ children, aspect }: { children: React.ReactNode; aspect: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 240, stageW: 236, stageH: 146 });
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
  return <div className="w-full" data-artwork-workspace="true">
    <div data-artwork-toolbar="true" className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 bg-white px-2 py-1 text-xs">
      <div className="flex items-center gap-1" role="group" aria-label="Workspace zoom">
        <button type="button" aria-label="Zoom workspace out" className="min-h-11 min-w-11 rounded-lg hover:bg-slate-100" onClick={() => setView(v => ({ ...v, zoom: Math.max(0.02, v.zoom / 1.25) }))}>−</button>
        <span className="w-12 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <button type="button" aria-label="Zoom workspace in" className="min-h-11 min-w-11 rounded-lg hover:bg-slate-100" onClick={() => setView(v => ({ ...v, zoom: Math.min(2, v.zoom * 1.25) }))}>+</button>
      </div>
      <button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-slate-700 hover:bg-slate-100" onClick={showAll}>Show whole artwork</button>
    </div>
    <div ref={viewportRef} className="relative isolate overflow-hidden bg-slate-100" style={{ height: 'clamp(220px, 42vw, 400px)' }}>
      <div ref={stageRef} style={{ position: 'absolute', width: Math.max(48, Math.min(size.w - 64, (size.h - 92) / aspect + 28)),
        left: size.w / 2 - size.stageW * view.cx * view.zoom, top: size.h / 2 - size.stageH * view.cy * view.zoom,
        transform: `scale(${view.zoom})`, transformOrigin: 'top left' }}>
        <ArtworkWorkspaceZoomContext.Provider value={view.zoom}>{children}</ArtworkWorkspaceZoomContext.Provider>
      </div>
    </div>
    <p className="bg-white px-3 py-2 text-center text-xs text-slate-500">Only artwork inside the banner prints. View zoom does not change your design.</p>
  </div>;
}
