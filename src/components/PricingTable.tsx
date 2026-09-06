import React from 'react';
import { ArrowRight, CircleDot, Link2, SquareDashed } from 'lucide-react';
import { Link } from 'react-router-dom';

const materials = [
  {
    name: '13oz Vinyl',
    profile: 'Lightweight vinyl',
    use: 'Indoor displays and short-term outdoor campaigns',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1788721124/banners-on-the-fly/homepage/material-13oz-printed-20260906.webp',
    imageWidth: 275,
    alt: '13 ounce vinyl coffee shop banner displayed on an indoor stand',
  },
  {
    name: '15oz Vinyl',
    profile: 'Versatile outdoor vinyl',
    use: 'Everyday outdoor promotions, events, and storefronts',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1788721351/banners-on-the-fly/homepage/material-15oz-printed-20260906.webp',
    imageWidth: 273,
    alt: '15 ounce vinyl restaurant grand opening banner mounted on a storefront railing',
    recommended: true,
  },
  {
    name: '18oz Vinyl',
    profile: 'Heavy-duty vinyl',
    use: 'Heavy-duty and longer-term outdoor display needs',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1788721479/banners-on-the-fly/homepage/material-18oz-printed-20260906.webp',
    imageWidth: 272,
    alt: 'Heavy-duty 18 ounce vinyl construction hiring banner mounted outside a commercial building',
  },
  {
    name: 'Mesh Banner',
    profile: 'Wind-permeable mesh',
    use: 'Fences and outdoor placements where wind can pass through',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1788721642/banners-on-the-fly/homepage/material-mesh-printed-20260906.webp',
    imageWidth: 274,
    alt: 'Youth baseball mesh banner secured to a chain-link fence at a sports field',
  },
];

const finishingOptions = [
  { icon: CircleDot, title: 'Grommets', detail: 'Available placements · no separate charge' },
  { icon: SquareDashed, title: 'Pole pockets', detail: '$15 setup + $2 per linear foot' },
  { icon: Link2, title: 'Rope', detail: '$2 per linear foot' },
];

const PricingTable: React.FC = () => (
  <section className="border-t-4 border-[#F45B08] bg-[#FBF8F2] py-14 sm:py-16 lg:py-20" aria-labelledby="material-heading">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
      <div className="grid gap-9 lg:grid-cols-[310px_1fr] lg:gap-12 xl:grid-cols-[335px_1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.17em] text-[#C94008] sm:text-sm">Vinyl banner materials</p>
          <h2 id="material-heading" className="homepage-condensed mt-4 [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.9] text-[#061A31] sm:text-6xl lg:text-[4.55rem]">
            Pick the material for the environment.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-7 text-[#102a43] sm:text-lg">
            Compare finish, durability, and where the banner will hang.
          </p>
          <Link to="/vinyl-banners" className="mt-7 inline-flex items-center gap-2 border-b-2 border-[#F45B08] pb-1 text-sm font-black uppercase text-[#061A31] transition-colors hover:text-[#C94008]">
            Full banner buying guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {materials.map((material) => (
            <article
              key={material.name}
              className={`relative flex flex-col bg-[#FBF8F2] ${material.recommended ? 'border border-[#F45B08]' : ''}`}
            >
              <picture className="block overflow-hidden bg-[#E8E4DC]">
                <img
                  src={material.image}
                  alt={material.alt}
                  width={material.imageWidth}
                  height="448"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="aspect-[0.62] w-full object-cover transition-transform duration-500 motion-safe:hover:scale-[1.015]"
                />
              </picture>
              <div className={`flex-1 py-5 ${material.recommended ? 'px-3' : 'px-1'}`}>
                <h3 className="text-xl font-extrabold text-[#061A31] sm:text-2xl">{material.name}</h3>
                <p className="mt-1 text-xs font-black uppercase text-[#C94008]">{material.profile}</p>
                <p className="mt-5 text-sm leading-6 text-[#263d54]">{material.use}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-10 grid border-t border-[#6f7d86] sm:grid-cols-3 lg:ml-[380px] lg:mt-8">
        {finishingOptions.map((option, index) => {
          const Icon = option.icon;
          return (
            <div key={option.title} className={`flex items-start gap-4 px-4 py-5 sm:px-7 ${index > 0 ? 'border-t border-[#6f7d86] sm:border-l sm:border-t-0' : ''}`}>
              <Icon className="mt-0.5 h-9 w-9 flex-none stroke-[1.6] text-[#F45B08]" aria-hidden="true" />
              <div>
                <p className="font-extrabold text-[#061A31]">{option.title}</p>
                <p className="mt-1 text-sm leading-5 text-[#263d54]">{option.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

export default PricingTable;
