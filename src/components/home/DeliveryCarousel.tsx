import React from 'react';
import { PackageCheck } from 'lucide-react';
import {
  featuredDeliveryProofImages,
  getDeliveryProofImageUrl,
} from '@/lib/deliveryProofImages';

const DeliveryCarousel: React.FC = () => (
  <section className="bg-[#FBF8F2] py-14 sm:py-16 lg:py-20" aria-labelledby="delivery-proof-heading">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C94008] sm:text-sm">Documented delivery proof</p>
      <h2 id="delivery-proof-heading" className="homepage-condensed mt-3 [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.9] text-[#061A31] sm:text-6xl lg:text-[4.8rem]">
        Real orders. Real doorsteps.
      </h2>
      <p className="mt-2 text-base text-[#263d54]">Customer-submitted delivery photos—not generated lifestyle scenes.</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[270px_1fr] lg:gap-10">
        <div className="flex items-start gap-4 lg:pt-3">
          <PackageCheck className="mt-0.5 h-7 w-7 flex-none text-[#F45B08]" aria-hidden="true" />
          <p className="text-sm leading-7 text-[#263d54]">
            Production time and carrier transit are separate. Tracking is sent after the finished order ships.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {featuredDeliveryProofImages.map((image, index) => (
            <figure key={image.id} className="relative overflow-hidden border border-[#d5d1c8] bg-slate-100">
              <span className="absolute left-0 top-0 z-10 bg-[#C94008] px-2 py-1 text-xs font-black text-white">
                {String(index + 1).padStart(2, '0')}
              </span>
              <img
                src={getDeliveryProofImageUrl(image, 'w_650,q_auto,f_auto')}
                alt={`Customer-submitted package delivery photo ${index + 1}`}
                width="650"
                height="488"
                loading="lazy"
                className="aspect-[4/3] h-full w-full object-cover"
              />
            </figure>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default DeliveryCarousel;
