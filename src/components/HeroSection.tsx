import React from 'react';
import { ArrowRight, Monitor, Timer, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EVERGREEN_HERO, getHomepageHeroCampaign } from '@/lib/seasonalCampaigns';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const campaign = getHomepageHeroCampaign();
  const isSeasonal = campaign.id !== EVERGREEN_HERO.id && Boolean(campaign.artwork);
  const artwork = campaign.artwork;
  const headlineScale = campaign.headline.length > 44
    ? '[--homepage-mobile-size:clamp(2.55rem,10vw,2.9rem)] text-[2.9rem] sm:text-[4rem] lg:text-[4.8rem] xl:text-[5.2rem]'
    : campaign.headline.length > 30
      ? '[--homepage-mobile-size:clamp(2.9rem,11vw,3.25rem)] text-[3.25rem] sm:text-[4.3rem] lg:text-[5rem] xl:text-[5.4rem]'
      : '[--homepage-mobile-size:clamp(3rem,12vw,3.6rem)] text-[3.6rem] sm:text-[5rem] lg:text-[6.7rem] xl:text-[7.1rem]';

  const goTo = (href: string) => {
    navigate(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section
      data-homepage-hero={campaign.id}
      {...(isSeasonal ? { 'data-seasonal-campaign': campaign.id } : {})}
      className="relative isolate overflow-hidden bg-[#071C35] text-[#061A31]"
    >
      {isSeasonal && artwork ? (
        <picture
          data-seasonal-hero-art="desktop"
          className="absolute inset-y-0 right-0 z-0 hidden w-[84%] sm:block lg:w-[73%]"
        >
          {artwork.desktopAvifSrc ? <source type="image/avif" srcSet={artwork.desktopAvifSrc} /> : null}
          <img
            src={artwork.desktopSrc}
            alt={artwork.alt}
            width={artwork.desktopWidth}
            height={artwork.desktopHeight}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="h-full w-full object-cover object-center"
          />
        </picture>
      ) : null}

      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,#ff6900_0%,#ff6900_42%,rgba(255,105,0,0.97)_67%,rgba(255,120,0,0.82)_86%,rgba(6,26,49,0.2)_100%)] sm:bg-[linear-gradient(90deg,#ff6900_0%,rgba(255,118,0,0.98)_24%,rgba(247,158,0,0.87)_46%,rgba(247,158,0,0.14)_70%,transparent_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 z-[1] h-44 bg-gradient-to-b from-[#061A31]/65 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-[#061A31]/35 to-transparent" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-[640px] max-w-[1740px] items-center px-5 pb-24 pt-[104px] sm:min-h-[690px] sm:px-8 sm:pb-32 sm:pt-[120px] lg:min-h-[748px] lg:px-10 lg:pb-28 lg:pt-[142px]">
        <div className="max-w-[430px] sm:max-w-[680px] xl:max-w-[720px]">
          <p className="text-xs font-black uppercase tracking-[0.09em] text-[#08213d] sm:text-sm lg:text-base">
            {campaign.eyebrow}
          </p>
          <h1
            className={`homepage-condensed mt-4 max-w-[430px] font-black uppercase leading-[0.84] tracking-[-0.02em] text-[#061A31] sm:max-w-[700px] ${headlineScale}`}
          >
            {campaign.headline}
          </h1>
          {isSeasonal && artwork ? (
            <picture
              data-seasonal-hero-art="mobile"
              className="relative mt-5 block h-[300px] w-full overflow-hidden border-y-4 border-[#071C35] bg-[#071C35] shadow-[0_18px_38px_rgba(6,26,49,0.22)] sm:hidden"
            >
              {artwork.mobileAvifSrc ? <source type="image/avif" srcSet={artwork.mobileAvifSrc} /> : null}
              <img
                src={artwork.mobileSrc}
                alt={artwork.alt}
                width={artwork.mobileWidth}
                height={artwork.mobileHeight}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="h-full w-full object-cover object-[center_65%]"
              />
            </picture>
          ) : null}
          {!isSeasonal ? (
            <p className="mt-4 max-w-[410px] text-base font-medium leading-6 text-[#102a43] sm:max-w-xl sm:text-lg sm:leading-7 lg:text-xl">
              {campaign.description}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col items-start gap-3 sm:mt-6 sm:flex-row sm:items-center sm:gap-7">
            <button
              type="button"
              onClick={() => goTo(campaign.primaryCta.href)}
              className="inline-flex min-h-12 max-w-full items-center justify-center gap-3 rounded-md bg-[#071C35] px-6 py-3 text-[13px] font-extrabold uppercase tracking-[0.01em] text-white transition-colors hover:bg-[#0e3157] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6900] sm:px-7 sm:text-base"
            >
              {campaign.primaryCta.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link
              to={campaign.secondaryCta.href}
              className="inline-flex min-h-11 items-center gap-2 border-b-2 border-[#071C35] text-sm font-black uppercase tracking-[0.01em] text-[#071C35] transition-colors hover:border-white hover:text-white sm:text-base"
            >
              {campaign.secondaryCta.label}
            </Link>
          </div>
          <HeroDeliveryStatus className="mt-5 w-full max-w-[570px]" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/15 bg-[#071C35]/78 text-white backdrop-blur-sm">
        <ul className="mx-auto grid max-w-[1740px] grid-cols-3 divide-x divide-[#FF6900]/80 px-3 py-3 sm:px-8 lg:max-w-[1000px] lg:py-4" aria-label="Ordering benefits">
          <li className="flex items-center justify-center gap-2 px-2 sm:gap-3 sm:px-5">
            <Timer className="h-5 w-5 flex-none text-[#FF6900] sm:h-7 sm:w-7" aria-hidden="true" />
            <span className="text-[9px] font-extrabold uppercase leading-3 sm:text-sm">24-hour production</span>
          </li>
          <li className="flex items-center justify-center gap-2 px-2 sm:gap-3 sm:px-5">
            <Truck className="h-5 w-5 flex-none text-[#FF6900] sm:h-7 sm:w-7" aria-hidden="true" />
            <span className="text-[9px] font-extrabold uppercase leading-3 sm:text-sm">Free next-day air</span>
          </li>
          <li className="flex items-center justify-center gap-2 px-2 sm:gap-3 sm:px-5">
            <Monitor className="h-5 w-5 flex-none text-[#FF6900] sm:h-7 sm:w-7" aria-hidden="true" />
            <span className="text-[9px] font-extrabold uppercase leading-3 sm:text-sm">Live print preview</span>
          </li>
        </ul>
      </div>
    </section>
  );
};

export default HeroSection;
