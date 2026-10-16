import React from 'react';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import { isReadyPlacementPreview } from '@/lib/previewLifecycle';
import type { YardSignDesign } from '@/lib/yard-sign-pricing';

/** Display-only hardware preview. Never becomes artwork or a print-file source. */
export default function YardSignMockup({
  withStakes,
  design,
}: {
  withStakes: boolean;
  design?: YardSignDesign;
}) {
  const previewUrl = design && (
    isReadyPlacementPreview(design.placementPreview)
      ? design.placementPreview.previewUrl
      : design.previewThumbnailUrl || design.thumbnailUrl
  );

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-lg bg-gradient-to-b from-slate-100 to-slate-200/70"
      style={{ aspectRatio: '1 / 1' }}
      data-yard-sign-mockup={withStakes ? 'with-stakes' : 'without-stakes'}
      role="img"
      aria-label={`${design ? design.fileName : 'Example yard sign'} ${withStakes ? 'with a wire H-stake' : 'without stakes'}`}
    >
      <div className="absolute bottom-[8%] left-[20%] h-[3%] w-[60%] rounded-[50%] bg-slate-800/10 blur-sm" />
      {withStakes && (
        <div aria-hidden="true" data-yard-sign-hardware className="absolute inset-0">
          {[32, 68].map(left => (
            <div key={left} className="absolute top-[48%] h-[44%] w-[1%] min-w-[2px] shadow-sm" style={{ left: `${left}%`, background: 'linear-gradient(90deg, #77818b, #edf1f4 48%, #87919a)' }} />
          ))}
          <div className="absolute left-[32%] top-[75%] h-[1%] min-h-[2px] w-[37%] shadow-sm" style={{ background: 'linear-gradient(#78838d, #edf1f4 48%, #87919a)' }} />
        </div>
      )}
      <div className={`absolute left-[10%] z-10 w-[80%] overflow-hidden border border-black/10 bg-white shadow-md ${withStakes ? 'top-[9%]' : 'top-[20%]'}`} style={{ aspectRatio: '4 / 3' }}>
        {previewUrl ? (
          <StablePreviewImage
            key={`${design?.id}:${previewUrl}`}
            src={previewUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <svg viewBox="0 0 240 180" className="h-full w-full" aria-hidden="true">
            <rect width="240" height="180" fill="#f3f0e7" />
            <g fill="none" stroke="#294c39" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M100 63V38l20-15 20 15v25M95 39l25-19 25 19M114 63V47h12v16M104 40h5v7h-5zm27 0h5v7h-5zM91 64h58" />
              <path d="M91 60c-12-12-14-25-8-36m-2 16-6-6m8 17-8-5m72 14c12-12 14-25 8-36m2 16 6-6m-8 17 8-5" />
            </g>
            <text x="120" y="96" textAnchor="middle" fill="#294c39" fontFamily="Georgia, serif" fontSize="26">OPEN HOUSE</text>
            <text x="120" y="120" textAnchor="middle" fill="#294c39" fontFamily="Arial, sans-serif" fontSize="10" letterSpacing="2">YOUR DESIGN HERE</text>
            <path d="M48 146h140m-12-8 13 8-13 8" fill="none" stroke="#294c39" strokeWidth="3" />
          </svg>
        )}
      </div>
    </div>
  );
}
