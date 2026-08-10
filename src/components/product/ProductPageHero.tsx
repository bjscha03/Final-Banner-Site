import React from 'react';
import {
  ArrowRight,
  Clock3,
  Copy,
  Layers3,
  Monitor,
  Signpost,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import type { CityProductSlug } from '@/lib/seo/cityData';

interface HeroBenefit {
  label: string;
  icon: LucideIcon;
}

interface ProductHeroDefinition {
  eyebrow: string;
  title: string[];
  primaryLabel: string;
  secondaryLabel: string;
  imageAlt: string;
  benefits: HeroBenefit[];
}

const sharedBenefits: HeroBenefit[] = [
  { label: '24-hour standard production', icon: Clock3 },
  { label: 'Free next-day air after production', icon: Truck },
  { label: 'Live print preview', icon: Monitor },
];

const HERO_DEFINITIONS: Record<CityProductSlug, ProductHeroDefinition> = {
  'vinyl-banners': {
    eyebrow: 'Custom vinyl banners · Indoor · Outdoor · Mesh',
    title: ['Custom banners', 'built to get', 'noticed.'],
    primaryLabel: 'Design your vinyl banner',
    secondaryLabel: 'Explore materials & options',
    imageAlt: 'Custom Northline Market grand opening vinyl banner mounted to an outdoor railing',
    benefits: sharedBenefits,
  },
  'yard-signs': {
    eyebrow: '24 × 18 yard signs · Single- or double-sided',
    title: ['Yard signs', 'built to', 'get seen.'],
    primaryLabel: 'Design your yard signs',
    secondaryLabel: 'View sign options',
    imageAlt: 'Custom Highland Park Homes open house yard sign displayed in a front lawn',
    benefits: [
      { label: '24 × 18 corrugated plastic', icon: Layers3 },
      { label: 'Single- or double-sided printing', icon: Copy },
      { label: 'Optional step stakes', icon: Signpost },
    ],
  },
  'car-magnets': {
    eyebrow: 'Custom car magnets · Square or rounded corners',
    title: ['Put your', 'business', 'in motion.'],
    primaryLabel: 'Design your car magnets',
    secondaryLabel: 'View size options',
    imageAlt: 'Custom Summit Home Services car magnet installed on a gray service vehicle',
    benefits: sharedBenefits,
  },
};

interface ProductSceneProps {
  productSlug: CityProductSlug;
  alt: string;
  className: string;
}

const ProductScene: React.FC<ProductSceneProps> = ({ productSlug, alt, className }) => (
  <picture className={className}>
    <source
      media="(max-width: 1023px)"
      type="image/avif"
      srcSet={`/images/product-heroes/${productSlug}-mobile-640.avif 640w`}
      sizes="100vw"
    />
    <source
      media="(max-width: 1023px)"
      type="image/webp"
      srcSet={`/images/product-heroes/${productSlug}-mobile-640.webp 640w`}
      sizes="100vw"
    />
    <source
      type="image/avif"
      srcSet={`/images/product-heroes/${productSlug}-720.avif 720w, /images/product-heroes/${productSlug}-1100.avif 1100w`}
      sizes="58vw"
    />
    <source
      type="image/webp"
      srcSet={`/images/product-heroes/${productSlug}-720.webp 720w, /images/product-heroes/${productSlug}-1100.webp 1100w`}
      sizes="58vw"
    />
    <img
      src={`/images/product-heroes/${productSlug}-1100.webp`}
      alt={alt}
      width="1100"
      height="720"
      loading="eager"
      decoding="sync"
      fetchPriority="high"
      className="h-full w-full object-cover object-center"
    />
  </picture>
);

interface ProductPageHeroProps {
  productSlug: CityProductSlug;
  ctaUrl: string;
}

const ProductPageHero: React.FC<ProductPageHeroProps> = ({ productSlug, ctaUrl }) => {
  const hero = HERO_DEFINITIONS[productSlug];

  return (
    <section
      data-product-page-hero={productSlug}
      className="relative isolate overflow-hidden border-t-4 border-[#F45B08] bg-[#F45B08] text-[#061A31]"
      aria-labelledby={`${productSlug}-hero-heading`}
    >
      <ProductScene
        productSlug={productSlug}
        alt={hero.imageAlt}
        className="absolute inset-y-0 right-0 hidden w-[61%] lg:block"
      />
      <div
        className="absolute inset-0 hidden bg-[linear-gradient(90deg,#F45B08_0%,#F45B08_34%,rgba(244,91,8,.96)_43%,rgba(244,91,8,.72)_51%,rgba(244,91,8,.12)_66%,transparent_79%)] lg:block"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 hidden bg-[linear-gradient(180deg,rgba(255,141,28,.2),transparent_42%,rgba(6,26,49,.08))] lg:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[1740px] px-5 py-9 sm:px-8 sm:py-12 lg:flex lg:min-h-[650px] lg:items-center lg:px-12 lg:py-14 xl:px-16">
        <div className="relative z-10 max-w-[690px] lg:w-[47%]">
          <p className="text-[11px] font-black uppercase tracking-[0.17em] text-[#061A31] sm:text-sm lg:text-base">
            {hero.eyebrow}
          </p>
          <h1
            id={`${productSlug}-hero-heading`}
            className="homepage-condensed mt-5 [--homepage-mobile-size:clamp(3.55rem,17vw,5.2rem)] text-[5.2rem] font-black uppercase leading-[0.84] tracking-[-0.018em] text-[#061A31] sm:text-[6.35rem] lg:text-[6.4rem] xl:text-[7.15rem]"
          >
            {hero.title.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </h1>

          <div className="mt-7 flex flex-col items-start gap-5 sm:mt-8">
            <Link
              to={ctaUrl}
              className="inline-flex min-h-14 w-full items-center justify-center gap-4 rounded-md bg-[#061A31] px-7 py-3.5 text-center text-sm font-black uppercase tracking-[0.035em] text-white shadow-[0_12px_30px_rgba(6,26,49,.22)] transition-colors hover:bg-[#0C2B50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto sm:text-base"
            >
              {hero.primaryLabel}
              <ArrowRight className="h-5 w-5 flex-none" aria-hidden="true" />
            </Link>
            <a
              href="#sizes-pricing"
              className="inline-flex min-h-11 items-center border-b-2 border-[#061A31] pb-0.5 text-sm font-black uppercase tracking-[0.035em] text-[#061A31] transition-colors hover:border-white hover:text-white sm:text-base"
            >
              {hero.secondaryLabel}
            </a>
          </div>
          <HeroDeliveryStatus className="mt-6 w-full max-w-[570px]" />
        </div>
      </div>

      <ProductScene
        productSlug={productSlug}
        alt={hero.imageAlt}
        className="relative block aspect-[4/3] w-full overflow-hidden border-t border-[#061A31]/20 lg:hidden"
      />

      <div className="relative z-20 bg-[#171B20]/95 text-white shadow-[0_-10px_30px_rgba(0,0,0,.16)]">
        <div className="mx-auto grid max-w-[1740px] divide-y divide-white/20 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8 lg:px-12 xl:px-16">
          {hero.benefits.map(({ label, icon: Icon }) => (
            <div key={label} className="flex min-h-[72px] items-center gap-4 py-4 sm:px-6 lg:min-h-[88px] lg:justify-center lg:gap-5">
              <Icon className="h-7 w-7 flex-none stroke-[1.7] text-[#F45B08] lg:h-9 lg:w-9" aria-hidden="true" />
              <span className="text-xs font-bold uppercase leading-5 tracking-[0.025em] text-white lg:text-sm">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductPageHero;
