import React, { useState } from 'react';
import { PackageCheck, Pause, Play } from 'lucide-react';
import {
  deliveryProofImages,
  getDeliveryProofImageUrl,
} from '@/lib/deliveryProofImages';

const STRIP_TRANSFORMATION = 'w_224,h_112,c_fill,g_auto,q_auto:eco,f_auto';

const DeliveryImageSet: React.FC<{ duplicate?: boolean }> = ({ duplicate = false }) => (
  <div
    className={`real-orders-strip-set flex h-full shrink-0 items-center gap-1 pr-1${
      duplicate ? ' real-orders-strip-set--duplicate' : ''
    }`}
    data-real-orders-strip-set
    aria-hidden="true"
  >
    {deliveryProofImages.map((image) => (
      <img
        key={image.id}
        src={getDeliveryProofImageUrl(image, STRIP_TRANSFORMATION)}
        alt=""
        width="112"
        height="56"
        loading="eager"
        decoding="async"
        className="h-14 w-28 max-w-none shrink-0 border-x border-white/10 object-cover"
      />
    ))}
  </div>
);

const RealOrdersStrip: React.FC = () => {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <section
      className="real-orders-strip relative h-16 overflow-hidden border-y border-[#F45B08]/70 bg-[#061A31] text-white"
      aria-label="Real customer order delivery photos"
      data-real-orders-strip
      data-paused={isPaused}
    >
      <div className="flex h-full min-w-0 items-stretch">
        <div className="relative z-20 flex w-[148px] shrink-0 items-center gap-2 bg-[#061A31] px-3 shadow-[10px_0_18px_rgba(6,26,49,0.9)] sm:w-[204px] sm:px-4">
          <PackageCheck className="hidden h-5 w-5 shrink-0 text-[#F45B08] sm:block" aria-hidden="true" />
          <p className="text-[11px] font-black uppercase leading-[1.1] tracking-[0.08em] sm:text-xs">
            <span>Real orders</span>{' '}
            <span className="block text-[#FF7A1A]">delivered fast</span>
          </p>
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden" aria-hidden="true">
          <div
            className="real-orders-strip-track flex h-full w-max items-center"
            data-real-orders-strip-track
          >
            <DeliveryImageSet />
            <DeliveryImageSet duplicate />
          </div>
        </div>

        <div className="relative z-20 flex w-12 shrink-0 items-center justify-center bg-[#061A31] shadow-[-10px_0_18px_rgba(6,26,49,0.9)]">
          <button
            type="button"
            className="real-orders-strip-control flex h-11 w-11 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A1A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#061A31]"
            aria-label={isPaused ? 'Play delivery photos' : 'Pause delivery photos'}
            aria-pressed={isPaused}
            onClick={() => setIsPaused((paused) => !paused)}
          >
            {isPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  );
};

export default RealOrdersStrip;
