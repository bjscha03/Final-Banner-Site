import React from 'react';
import { ArrowRight, CircleDot, Link2, SquareDashed } from 'lucide-react';
import { Link } from 'react-router-dom';

const materials = [
  {
    name: '13oz Vinyl',
    profile: 'Everyday displays',
    use: 'Indoor displays & short-term outdoor use.',
    imageStem: 'material-13oz',
    alt: '13 ounce vinyl coffee shop banner displayed on an indoor stand',
  },
  {
    name: '15oz Vinyl',
    profile: 'Outdoor promotions',
    use: 'Storefronts, events & everyday outdoor use.',
    imageStem: 'material-15oz',
    alt: '15 ounce vinyl restaurant grand opening banner mounted on a storefront railing',
  },
  {
    name: '18oz Vinyl',
    profile: 'Heavy-duty jobs',
    use: 'Heavy-duty & longer-term outdoor displays.',
    imageStem: 'material-18oz',
    alt: 'Heavy-duty 18 ounce vinyl construction hiring banner mounted outside a commercial building',
  },
  {
    name: 'Mesh Banner',
    profile: 'Windy locations',
    use: 'Fences & outdoor spaces with airflow.',
    imageStem: 'material-mesh',
    alt: 'Youth baseball mesh banner secured to a chain-link fence at a sports field',
  },
];

const finishingOptions = [
  { icon: CircleDot, title: 'Grommets', detail: 'Included' },
  { icon: SquareDashed, title: 'Pole pockets', detail: '$15 setup + $2 per linear foot' },
  { icon: Link2, title: 'Rope', detail: '$2 per linear foot' },
];

const PricingTable: React.FC = () => (
  <section className="bg-white pt-12 sm:pt-14 lg:pt-16" aria-labelledby="material-heading">
    <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
      <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.17em] text-[#C94008] sm:text-sm">Banner materials</p>
          <h2 id="material-heading" className="homepage-condensed mt-2 [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.95] text-[#061A31] sm:text-6xl xl:text-[4.75rem]">
            Built for where you hang it.
          </h2>
          <p className="mt-2 text-base leading-7 text-[#102a43] sm:text-xl">
            Four materials. Find the right fit for your space.
          </p>
        </div>
        <Link to="/vinyl-banners" className="mb-1 inline-flex w-fit shrink-0 items-center gap-3 border-b border-[#061A31] pb-1 text-sm font-bold uppercase text-[#061A31] transition-colors hover:text-[#C94008] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          Compare materials <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

        <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {materials.map((material) => (
            <article
              key={material.name}
              className="flex min-w-0 flex-col"
            >
              <picture className="block overflow-hidden bg-[#E8E4DC]">
                <source
                  type="image/avif"
                  srcSet={`/images/homepage/materials-hd/${material.imageStem}-360.avif 360w, /images/homepage/materials-hd/${material.imageStem}-640.avif 640w, /images/homepage/materials-hd/${material.imageStem}-960.avif 960w`}
                  sizes="(min-width: 1500px) 343px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
                <source
                  type="image/webp"
                  srcSet={`/images/homepage/materials-hd/${material.imageStem}-360.webp 360w, /images/homepage/materials-hd/${material.imageStem}-640.webp 640w, /images/homepage/materials-hd/${material.imageStem}-960.webp 960w`}
                  sizes="(min-width: 1500px) 343px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
                <img
                  src={`/images/homepage/materials-hd/${material.imageStem}-640.webp`}
                  alt={material.alt}
                  width="640"
                  height="960"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="aspect-[0.88] w-full object-cover transition-transform duration-500 motion-safe:hover:scale-[1.015]"
                />
              </picture>
              <div className="mt-4 flex flex-1 flex-col border-l border-slate-200 px-4 pb-4 sm:px-5">
                <h3 className="homepage-condensed [--homepage-mobile-size:2rem] text-[2rem] font-black uppercase leading-tight text-[#061A31]">{material.profile}</h3>
                <p className="text-xl font-semibold text-[#C94008]">{material.name}</p>
                <p className="mb-4 mt-2 text-base leading-6 text-[#263d54]">{material.use}</p>
                <Link to={material.imageStem === 'material-mesh' ? '/mesh-banners' : '/vinyl-banners'} aria-label={`Explore ${material.name}`} className="mt-auto inline-flex w-fit items-center gap-3 border-b-2 border-[#F45B08] pb-1 text-sm font-bold uppercase text-[#061A31] transition-colors hover:text-[#C94008] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                  Explore material <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
    </div>
    <div className="mt-4 bg-[#062137] py-5 text-white">
      <div className="mx-auto grid max-w-[1500px] px-4 sm:grid-cols-2 sm:px-7 lg:grid-cols-[1.1fr_1fr_1.25fr_1fr] lg:px-10">
        <h3 className="homepage-condensed flex items-center py-4 pr-4 [--homepage-mobile-size:2rem] text-[2.25rem] font-black uppercase leading-none">Finish it your way.</h3>
        {finishingOptions.map((option, index) => {
          const Icon = option.icon;
          return (
            <div key={option.title} className={`flex items-center gap-4 border-t border-white/35 py-4 sm:px-5 lg:border-l lg:border-t-0 ${index === 0 ? 'sm:border-l sm:border-t-0' : index === 2 ? 'sm:border-l' : ''}`}>
              <Icon className="h-10 w-10 flex-none stroke-[1.6] text-[#FF6500]" aria-hidden="true" />
              <div>
                <p className="font-bold">{option.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-300">{option.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

export default PricingTable;
