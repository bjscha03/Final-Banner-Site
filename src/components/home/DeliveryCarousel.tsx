import React from 'react';
import { ArrowRight, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  featuredDeliveryProofImages,
  getDeliveryProofImageUrl,
} from '@/lib/deliveryProofImages';

const DeliveryCarousel: React.FC = () => (
  <section className="bg-white py-8 lg:py-10" aria-labelledby="delivery-proof-heading">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C94008] sm:text-sm">Delivered daily</p>
      <h2 id="delivery-proof-heading" className="homepage-condensed mt-3 [--homepage-mobile-size:2.5rem] text-5xl font-black uppercase leading-none text-[#061A31] lg:text-6xl">
        From our shop. To your door.
      </h2>
      <p className="mt-2 text-base text-[#263d54]">A few recent arrivals from Banners On The Fly.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {featuredDeliveryProofImages.map((image, index) => (
            <figure key={image.id} className="overflow-hidden rounded-sm bg-slate-100">
              <img
                src={getDeliveryProofImageUrl(image, 'w_650,q_auto,f_auto')}
                alt={`Customer-submitted package delivery photo ${index + 1}`}
                width="650"
                height="488"
                loading="lazy"
                className="aspect-[1.05] w-full object-cover"
              />
            </figure>
          ))}
        </div>
      <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PackageCheck className="h-7 w-7 flex-none text-[#F45B08]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#263d54]">Tracking sent when your order ships.</p>
        </div>
        <Link to="/shipping" className="inline-flex min-h-11 w-fit items-center gap-3 border-b-2 border-[#F45B08] text-sm font-bold uppercase text-[#061A31] transition-colors hover:text-[#C94008] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          Shipping details <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  </section>
);

export default DeliveryCarousel;
