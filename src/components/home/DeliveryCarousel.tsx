import React from 'react';
import { PackageCheck } from 'lucide-react';

const deliveryImages = [
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460966/download_cz20yn.jpg',
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460965/download-13_vmyxvp.jpg',
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460966/download-16_hck4qs.jpg',
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460966/download-18_yyyu7k.jpg',
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460966/download-17_htewfz.jpg',
  'https://res.cloudinary.com/dtrxl120u/image/upload/w_650,q_auto,f_auto/v1774460966/download-15_rpzqgf.jpg',
];

const DeliveryCarousel: React.FC = () => (
  <section className="brand-section bg-white" aria-labelledby="delivery-proof-heading">
    <div className="brand-shell">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
        <div>
          <p className="brand-eyebrow">Documented delivery proof</p>
          <h2 id="delivery-proof-heading" className="brand-title mt-3">Real orders, photographed at delivery.</h2>
          <p className="brand-copy mt-5">These are customer-submitted delivery photos—not generated lifestyle scenes. Personal and shipping details are obscured or unreadable.</p>
          <div className="mt-7 flex items-start gap-3 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
            <PackageCheck className="mt-0.5 h-5 w-5 flex-none text-[#FF6A00]" aria-hidden="true" />
            Production time and carrier transit are separate. Tracking is sent after the finished order ships.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {deliveryImages.map((src, index) => (
            <figure key={src} className="overflow-hidden border border-slate-200 bg-slate-100">
              <img
                src={src}
                alt={`Customer-submitted package delivery photo ${index + 1}`}
                width={650}
                height={488}
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
