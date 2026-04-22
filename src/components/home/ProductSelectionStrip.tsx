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
    <section className="relative z-20 mt-8 bg-transparent pb-10 sm:pb-12 md:mt-14 md:pb-14">
      <div className="w-full px-4 sm:px-6 md:px-5 lg:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-4 lg:gap-5">
          {products.map((product) => (
            <article
              key={product.title}
              className="group relative min-h-[360px] overflow-hidden rounded-3xl border border-white/30 bg-slate-900 shadow-[0_18px_40px_rgba(2,6,23,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(2,6,23,0.38)] md:min-h-[440px]"
            >
              <div className="absolute inset-0 overflow-hidden bg-slate-900">
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                />
              </div>
              <div className="absolute bottom-0 left-0 h-3/5 w-11/12 bg-gradient-to-tr from-slate-950/58 via-slate-900/24 to-transparent md:h-1/2 md:w-4/5" />
              <div className="relative z-10 flex h-full flex-col justify-end p-5 sm:p-7 md:p-8">
                <div className="max-w-lg rounded-2xl border border-white/30 bg-slate-950/34 px-4 py-4 text-white shadow-[0_14px_34px_rgba(15,23,42,0.3)] backdrop-blur-md md:px-5 md:py-5">
                  <h2 className="text-[1.95rem] font-black leading-[1.05] tracking-tight text-white [text-shadow:0_2px_14px_rgba(15,23,42,0.65)] md:text-[2.15rem]">
                    {product.title}
                  </h2>
                  <p className="mt-2.5 text-base font-medium leading-snug text-white/95 [text-shadow:0_1px_10px_rgba(15,23,42,0.55)] md:text-[1.05rem]">
                    {product.description}
                  </p>
                  <Link
                    to={product.href}
                    className="mt-5 inline-flex w-fit items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:from-orange-600 hover:to-red-500 hover:shadow-lg"
                  >
                    {product.cta}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductSelectionStrip;
