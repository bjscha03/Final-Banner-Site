import React, { useId, useMemo } from 'react';
import { ZoomIn } from 'lucide-react';
import type { CartItem } from '@/store/cart';
import StableBannerPreview from '@/components/cart/StableBannerPreview';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { getExpandedPreviewSelection, getSmallPreviewSelection } from '@/lib/previewSelection';
import { getGrommetLabelForDisplay } from '@/lib/cartGrommet';
import { normalizeOrderItemDisplay } from '@/lib/product-display';
import { createBannerSurfaceMask, formatBannerDimensions, getRealisticBannerGeometry, isRealisticBannerItem, type RealisticBannerGeometry } from '@/lib/preview/realisticBanner';
import BannerDimensions from './BannerDimensions';
import './realistic-banner-preview.css';

function attachment(point: { x: number; y: number }, geometry: RealisticBannerGeometry) {
  const { w, h } = geometry;
  const inset = Math.min(1, w / 2, h / 2) + 0.01;
  const length = Math.min(2.4, Math.min(w, h) * 0.08);
  return {
    x: point.x <= inset ? -length : point.x >= w - inset ? w + length : point.x,
    y: point.y <= inset ? -length : point.y >= h - inset ? h + length : point.y,
  };
}

/** A deterministic display-only scene. Customer artwork never leaves the image pipeline. */
export function RealisticBannerScene({ item, expanded = false }: { item: CartItem; expanded?: boolean }) {
  const id = useId().replace(/:/g, '');
  const geometry = useMemo(() => getRealisticBannerGeometry(item), [item]);
  const surfaceMask = useMemo(() => createBannerSurfaceMask(geometry), [geometry]);
  const selection = expanded ? getExpandedPreviewSelection(item) : getSmallPreviewSelection(item);
  const { w, h, x, y, sceneWidth, sceneHeight, sceneRatio, grommets, isMesh, pocketEdges, pocketDepth, ropeEdges } = geometry;
  const radius = geometry.grommetRadius;
  const surfaceStyle: React.CSSProperties = {
    left: `${x / sceneWidth * 100}%`, top: `${y / sceneHeight * 100}%`,
    width: `${w / sceneWidth * 100}%`, height: `${h / sceneHeight * 100}%`,
  };
  const background = /^#[\da-f]{3,8}$/i.test(item.canvas_background_color || '') ? item.canvas_background_color : '#ffffff';
  return (
    <div
      className={`realistic-banner-scene${expanded ? ' realistic-banner-scene-expanded' : ''}`}
      style={{ aspectRatio: sceneRatio, '--scene-ratio': sceneRatio } as React.CSSProperties}
      role="img"
      aria-label={`${formatBannerDimensions(w, h).feet} ${isMesh ? 'mesh' : 'vinyl'} banner on brick, ${grommets.length} grommets`}
      data-realistic-scene
      data-realistic-material={isMesh ? 'mesh' : 'vinyl'}
      data-banner-width={w}
      data-banner-height={h}
    >
      <div className="realistic-banner-wall" style={{ backgroundSize: `${60 / sceneWidth * 100}% ${40 / sceneHeight * 100}%` }} aria-hidden="true" />
      <div className={`realistic-banner-shadow${grommets.length ? ' is-suspended' : ''}`} style={surfaceStyle} aria-hidden="true" />

      {/* Anchors and tension ties appear only where the order has a grommet. */}
      <svg className="realistic-banner-hardware" viewBox={`0 0 ${sceneWidth} ${sceneHeight}`} aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-anchor`} cx="32%" cy="25%"><stop stopColor="#fafafa"/><stop offset=".5" stopColor="#a6abb0"/><stop offset=".8" stopColor="#51565a"/><stop offset="1" stopColor="#d8dadd"/></radialGradient>
        </defs>
        <g transform={`translate(${x} ${y})`}>
          {grommets.map((point, index) => {
            const end = attachment(point, geometry);
            return <g key={index} data-realistic-anchor>
              <path d={`M${point.x + 0.13} ${point.y + 0.28} L${end.x + 0.13} ${end.y + 0.28}`} stroke="#211c18" strokeOpacity=".24" strokeWidth=".25" />
              <circle cx={end.x} cy={end.y} r=".33" fill={`url(#${id}-anchor)`}/>
              <circle cx={end.x} cy={end.y} r=".10" fill="#3f4244"/>
              <path d={`M${point.x} ${point.y} L${end.x} ${end.y}`} stroke="#252b2d" strokeWidth=".18" strokeLinecap="round"/>
              <path d={`M${point.x - 0.03} ${point.y - 0.03} L${end.x - 0.03} ${end.y - 0.03}`} stroke="#7a7e7f" strokeWidth=".035" strokeLinecap="round"/>
            </g>;
          })}
          {ropeEdges.map((edge) => {
            const ropeY = edge === 'bottom' ? h - 0.3 : 0.3;
            return <g key={edge} data-realistic-rope={edge}>
              <path d={`M-2.5 ${ropeY + 2} Q-2.5 ${ropeY} 0 ${ropeY} L${w} ${ropeY} Q${w + 2.5} ${ropeY} ${w + 2.5} ${ropeY + 2}`} fill="none" stroke="#55483b" strokeWidth=".25"/>
              <path d={`M-2.5 ${ropeY + 2} Q-2.5 ${ropeY} 0 ${ropeY} L${w} ${ropeY} Q${w + 2.5} ${ropeY} ${w + 2.5} ${ropeY + 2}`} fill="none" stroke="#f0e7cf" strokeWidth=".16" strokeDasharray=".07 .025"/>
            </g>;
          })}
        </g>
      </svg>

      <div className="realistic-banner-surface" style={{ ...surfaceStyle, maskImage: surfaceMask, WebkitMaskImage: surfaceMask }} data-realistic-surface>
        <StableBannerPreview
          key={`${item.id}:${selection.url}:${item.placement_preview?.compositionSignature || item.composition_signature || ''}`}
          widthIn={w} heightIn={h} grommets="none"
          imageUrl={selection.url}
          isFinalizedSnapshot={selection.isExactComposition}
          compositionSignature={item.placement_preview?.compositionSignature || item.composition_signature}
          imageScale={item.image_scale} imageScaleY={item.image_scale_y}
          imagePosition={item.image_position} fitMode={item.fit_mode || 'fill'}
          overlayImage={item.overlay_image} textElements={item.text_elements}
          maxSize={expanded ? 1600 : 320}
          surfaceOnly backgroundColor={background}
        />
        <div className="realistic-banner-material-texture" style={{ opacity: isMesh ? 0.4 : grommets.length ? 0.94 : 0.5 }} aria-hidden="true" />
        <svg className="realistic-banner-surface-light" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-satin`} x1="0" y1="0" x2=".8" y2="1">
              <stop stopColor="white" stopOpacity=".13"/><stop offset=".16" stopColor="white" stopOpacity="0"/>
              <stop offset=".35" stopColor="black" stopOpacity=".045"/><stop offset=".44" stopColor="white" stopOpacity=".08"/>
              <stop offset=".58" stopColor="white" stopOpacity="0"/><stop offset=".84" stopColor="black" stopOpacity=".05"/>
              <stop offset="1" stopColor="white" stopOpacity=".1"/>
            </linearGradient>
            <linearGradient id={`${id}-hem`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="white" stopOpacity=".19"/><stop offset=".45" stopColor="white" stopOpacity="0"/><stop offset="1" stopColor="black" stopOpacity=".12"/></linearGradient>
            <filter id={`${id}-grain`}><feTurbulence type="fractalNoise" baseFrequency="2.7" numOctaves="2" seed="8"/><feColorMatrix type="saturate" values="0"/></filter>
          </defs>
          <rect width={w} height={h} fill={`url(#${id}-satin)`} opacity={isMesh ? 0.35 : 1}/>
          <rect width={w} height={h} filter={`url(#${id}-grain)`} opacity={isMesh ? 0.025 : 0.045} style={{ mixBlendMode: 'soft-light' }}/>
          <rect x=".12" y=".12" width={Math.max(0, w - 0.24)} height={Math.max(0, h - 0.24)} fill="none" stroke="white" strokeOpacity=".28" strokeWidth=".09"/>
          <rect x=".7" y=".7" width={Math.max(0, w - 1.4)} height={Math.max(0, h - 1.4)} fill="none" stroke="#171c23" strokeOpacity=".12" strokeWidth=".065"/>
          <rect x=".12" y=".12" width={Math.max(0, w - 0.24)} height=".58" fill={`url(#${id}-hem)`}/>
          <rect x=".12" y={h - 0.7} width={Math.max(0, w - 0.24)} height=".58" fill={`url(#${id}-hem)`}/>
          {pocketEdges.map((edge) => {
            const vertical = edge === 'left' || edge === 'right';
            const px = edge === 'right' ? w - pocketDepth : 0;
            const py = edge === 'bottom' ? h - pocketDepth : 0;
            return <g key={edge} data-realistic-pocket={edge}>
              <rect x={px} y={py} width={vertical ? pocketDepth : w} height={vertical ? h : pocketDepth} fill={`url(#${id}-hem)`}/>
              <path d={vertical ? `M${edge === 'left' ? pocketDepth : px} 0 V${h}` : `M0 ${edge === 'top' ? pocketDepth : py} H${w}`} stroke="#15191d" strokeWidth=".075" strokeOpacity=".27"/>
            </g>;
          })}
        </svg>
      </div>

      <svg className="realistic-banner-hardware" viewBox={`0 0 ${sceneWidth} ${sceneHeight}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#e7e4d9"/><stop offset=".25" stopColor="#aca28b"/><stop offset=".46" stopColor="#faf6e9"/><stop offset=".62" stopColor="#77746b"/><stop offset=".85" stopColor="#d2c6a8"/><stop offset="1" stopColor="#f0e8d3"/></linearGradient>
        </defs>
        <g transform={`translate(${x} ${y})`}>
          {grommets.map((point, index) => {
            const end = attachment(point, geometry);
            const dx = end.x - point.x; const dy = end.y - point.y;
            const distance = Math.hypot(dx, dy) || 1;
            return <g key={index} data-realistic-grommet data-x-in={point.x} data-y-in={point.y}>
              <circle cx={point.x} cy={point.y} r={radius * 0.78} fill="none" stroke="#383830" strokeWidth={radius * 0.6} strokeOpacity=".45"/>
              <circle cx={point.x} cy={point.y} r={radius * 0.76} fill="none" stroke={`url(#${id}-metal)`} strokeWidth={radius * 0.46}/>
              <circle cx={point.x} cy={point.y} r={radius * 0.52} fill="none" stroke="#4c4941" strokeWidth=".045"/>
              <path d={`M${point.x} ${point.y} L${point.x + dx / distance * radius * 1.5} ${point.y + dy / distance * radius * 1.5}`} stroke="#2d3232" strokeWidth=".16" strokeLinecap="round"/>
            </g>;
          })}
        </g>
      </svg>
    </div>
  );
}

export default function RealisticBannerPreview({ item, className = '' }: { item: CartItem; className?: string }) {
  const small = getSmallPreviewSelection(item);
  // A design-service reference image is not a finished banner composition.
  if (!isRealisticBannerItem(item) || !small.url || item.design_service_enabled) return null;
  const details = normalizeOrderItemDisplay(item);
  const grommets = getGrommetLabelForDisplay(item, details.grommetsDisplay || 'None');
  const expanded = getExpandedPreviewSelection(item);
  return (
    <Dialog>
      <div className={`realistic-banner-preview ${className}`} data-realistic-preview={item.id}>
        <p className="mb-1.5 text-xs font-semibold text-[#18448D]">Realistic preview</p>
        <DialogTrigger asChild>
          <button type="button" className="realistic-banner-trigger group" aria-label={`Enlarge realistic preview: ${formatBannerDimensions(item.width_in, item.height_in).feet} ${details.materialDisplay}`}>
            <RealisticBannerScene item={item}/>
            <span className="realistic-banner-zoom" aria-hidden="true"><ZoomIn size={16}/></span>
            <span className="realistic-banner-expand-label">Click to expand</span>
          </button>
        </DialogTrigger>
      </div>
      <DialogContent className="realistic-banner-dialog z-[11020] gap-0 overflow-hidden rounded-2xl p-0" data-realistic-lightbox>
        <header className="border-b border-slate-100 px-4 py-4 pr-14 sm:px-6">
          <DialogTitle className="text-xl font-bold text-[#0B1F3A]">Realistic preview</DialogTitle>
          <DialogDescription asChild><div className="mt-1.5 text-sm text-slate-600">
            <BannerDimensions widthIn={item.width_in} heightIn={item.height_in}/>
            <span className="mt-1 block">{details.materialDisplay} · {grommets}</span>
          </div></DialogDescription>
        </header>
        <div className="realistic-banner-dialog-body">
          <RealisticBannerScene item={item} expanded/>
          <div className="px-4 py-3 sm:px-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
              <div><dt className="font-semibold text-slate-800">Grommets</dt><dd>{grommets}</dd></div>
              <div><dt className="font-semibold text-slate-800">Pole pockets</dt><dd>{details.polePocketsDisplay || 'None'}</dd></div>
              <div><dt className="font-semibold text-slate-800">Rope</dt><dd>{details.ropeDisplay || 'None'}</dd></div>
              <div><dt className="font-semibold text-slate-800">Print</dt><dd>{details.printDisplay}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Material, lighting and mounting are illustrative. Refer to your print layout for artwork placement and color.</p>
            {expanded.isLowResolutionFallback && <p className="mt-1 text-xs text-slate-500">A temporary artwork preview is shown while the full-resolution image finishes.</p>}
          </div>
        </div>
        <footer className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 sm:px-6">
          <DialogClose asChild><button type="button" className="min-h-11 rounded-lg bg-[#0B1F3A] px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Close preview</button></DialogClose>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
