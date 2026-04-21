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
    href: '/design?tab=yard-sign',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776748102/gemini-watermark-removed_2_n85erj.png',
    imageAlt: 'Yard sign display example',
  },
];

const ProductSelectionStrip: React.FC = () => {
  return (
    <section className="bg-white py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {products.map((product) => (
            <article
              key={product.title}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_28px_rgba(15,23,42,0.14)]"
            >
              <div className="aspect-[16/9] overflow-hidden bg-slate-100">
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h2 className="text-2xl font-bold text-slate-900">{product.title}</h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600">{product.description}</p>
                <Link
                  to={product.href}
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:from-orange-600 hover:to-red-500 hover:shadow-lg"
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
