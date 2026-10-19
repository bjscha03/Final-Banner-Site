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

  if (!design) {
    return (
      <div
        className="relative isolate w-full overflow-hidden rounded-lg bg-[#e7e0d5]"
        style={{ aspectRatio: '1 / 1' }}
        data-yard-sign-mockup={withStakes ? 'with-stakes' : 'without-stakes'}
        role="img"
        aria-label={`Example yard sign ${withStakes ? 'with a wire H-stake' : 'without stakes'}`}
      >
        {/* Each half of the shared photo shows the same printed sign and its hardware option. */}
        <img
          src="/images/yard-sign-options/open-house-studio-v2.webp"
          width={1600}
          height={800}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-yard-sign-hardware={withStakes ? true : undefined}
          className="absolute top-0 h-full w-[200%] max-w-none"
          style={{ left: withStakes ? '0' : '-100%' }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-lg bg-gradient-to-b from-slate-100 to-slate-200/70"
      style={{ aspectRatio: '1 / 1' }}
      data-yard-sign-mockup={withStakes ? 'with-stakes' : 'without-stakes'}
      role="img"
      aria-label={`${design.fileName} ${withStakes ? 'with a wire H-stake' : 'without stakes'}`}
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
        {previewUrl && (
          <StablePreviewImage
            key={`${design?.id}:${previewUrl}`}
            src={previewUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
    </div>
  );
}
