import React from 'react';
import { Link } from 'react-router-dom';

interface Product {
  title: string;
  subtext: string;
  cta: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
  imageFit: 'object-contain' | 'object-cover';
}

const products: Product[] = [
  {
    title: 'Banners',
    subtext: 'Events • Promotions • Business',
    cta: 'Start Banner →',
    href: '/design',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020723/Vinyl_Banners_ycsdpm.png',
    imageAlt: 'Vinyl banners display example',
    imageFit: 'object-contain',
  },
  {
    title: 'Yard Signs',
    subtext: 'Real Estate • Local • Political',
    cta: 'Start Yard Sign →',
    href: '/design?product=yard-signs',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020710/Yard_Signs_incb8x.png',
    imageAlt: 'Yard signs display example',
    imageFit: 'object-cover',
  },
  {
    title: 'Car Magnets',
    subtext: 'Mobile Advertising • Removable',
    cta: 'Start Car Magnets →',
    href: '/design?product=car-magnets',
    imageUrl: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777020742/car_magnets_dwoq8q.png',
    imageAlt: 'Car magnets display example',
    imageFit: 'object-cover',
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
              className="group relative min-h-[360px] overflow-hidden rounded-2xl bg-slate-900 shadow-[0_18px_40px_rgba(2,6,23,0.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(2,6,23,0.38)] md:min-h-[440px]"
            >
              {/* Product image — fills entire card */}
              <img
                src={product.imageUrl}
                alt={product.imageAlt}
                loading="lazy"
                className={`absolute inset-0 h-full w-full ${product.imageFit} transition-transform duration-[250ms] ease-in-out group-hover:scale-[1.03]`}
              />

              {/* Orange pill label — top-left */}
              <span className="absolute left-4 top-4 z-10 rounded-full bg-[#FF6A00] px-3 py-1 text-xs font-bold text-white shadow-sm">
                {product.title}
              </span>

              {/* Subtle subtext — bottom-left, no background box */}
              <p className="absolute bottom-[4.5rem] left-4 z-10 text-xs font-medium text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
                {product.subtext}
              </p>

              {/* CTA button — bottom-left */}
              <div className="absolute bottom-4 left-4 z-10">
                <Link
                  to={product.href}
                  className="inline-flex items-center justify-center rounded-full bg-[#FF6A00] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-orange-700 hover:shadow-lg"
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
