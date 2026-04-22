import React from 'react';
import { Link } from 'react-router-dom';

const products = [
  {
    title: 'Banners',
    description: 'Perfect for events, businesses, and promotions',
    cta: 'Start Banner →',
    href: '/design',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776748080/gemini-watermark-removed_1_t2dpdb.png',
    imageAlt: 'Banner display example',
  },
  {
    title: 'Yard Signs',
    description: 'Perfect for real estate, political, and local marketing',
    cta: 'Start Yard Sign →',
    href: '/design?product=yard-signs',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776748102/gemini-watermark-removed_2_n85erj.png',
    imageAlt: 'Yard sign display example',
  },
  {
    title: 'Car Magnets',
    description: 'Removable vehicle magnets with rounded corner options',
    cta: 'Start Car Magnets →',
    href: '/design?product=car-magnets',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776755781/car_magnet_yinavh.png',
    imageAlt: 'Car magnet display example',
  },
];

const ProductSelectionStrip: React.FC = () => {
  return (
    <section className="relative z-20 -mt-8 bg-transparent pb-10 sm:-mt-10 sm:pb-12 md:-mt-14 md:pb-14">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-0">
          {products.map((product) => (
            <article
              key={product.title}
              className="group relative min-h-[360px] overflow-hidden rounded-3xl border border-white/15 bg-slate-950 shadow-[0_18px_40px_rgba(2,6,23,0.38)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(2,6,23,0.48)] md:min-h-[420px] md:rounded-none md:border-y md:border-r-0 md:first:rounded-l-3xl md:first:border-l md:last:rounded-r-3xl md:last:border-r"
            >
              <div className="absolute inset-0 overflow-hidden bg-slate-100">
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/20" aria-hidden="true" />
              <div className="relative z-10 flex h-full flex-col justify-end p-6 sm:p-7 md:p-8">
                <h2 className="text-3xl font-black tracking-tight text-white md:text-[2rem]">{product.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-slate-100 md:text-lg">{product.description}</p>
                <Link
                  to={product.href}
                  className="mt-6 inline-flex w-fit items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:from-orange-600 hover:to-red-500 hover:shadow-lg"
                >
                  {product.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductSelectionStrip;
