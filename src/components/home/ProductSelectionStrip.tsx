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
    <section className="bg-white py-10 sm:py-12 md:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {products.map((product) => (
            <article
              key={product.title}
              className="group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.09)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(15,23,42,0.16)]"
            >
              <div className="aspect-[16/11] overflow-hidden bg-slate-100">
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-6 sm:p-7 md:p-8">
                <h2 className="text-3xl md:text-[2rem] font-black tracking-tight text-slate-900">{product.title}</h2>
                <p className="mt-3 text-base md:text-lg text-slate-600 leading-relaxed min-h-[3.25rem]">{product.description}</p>
                <Link
                  to={product.href}
                  className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:from-orange-600 hover:to-red-500 hover:shadow-lg"
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
