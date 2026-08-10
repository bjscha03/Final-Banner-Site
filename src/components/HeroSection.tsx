import React from 'react';
import { ArrowRight, Monitor, Timer, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EVERGREEN_HERO, getHomepageHeroCampaign } from '@/lib/seasonalCampaigns';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const campaign = getHomepageHeroCampaign();
  const isSeasonal = campaign.id !== EVERGREEN_HERO.id && Boolean(campaign.artwork);

  const goTo = (href: string) => {
    navigate(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const heroDescription = isSeasonal
    ? 'Custom vinyl banners produced in 24 hours, followed by free next-day air.'
    : campaign.description;

  return (
    <section
      data-homepage-hero={campaign.id}
      {...(isSeasonal ? { 'data-seasonal-campaign': campaign.id } : {})}
      className="relative isolate overflow-hidden bg-[#071C35] text-[#061A31]"
    >
      {isSeasonal ? (
        <picture className="absolute inset-y-0 right-0 z-0 w-full sm:w-[84%] lg:w-[73%]" aria-hidden="true">
          <source media="(max-width: 639px)" srcSet="/images/homepage/school-hero-mobile.webp" />
          <img
            src="/images/homepage/school-hero-desktop.webp"
            alt=""
            width="1127"
            height="657"
            loading="eager"
            fetchPriority="high"
            className="h-full w-full object-cover object-center sm:object-[58%_center]"
          />
        </picture>
      ) : null}

      <div className="absolute inset-0 z-[1] bg-[linear-gradient(90deg,#ff6900_0%,rgba(255,115,0,0.98)_25%,rgba(245,150,0,0.88)_44%,rgba(245,150,0,0.25)_64%,rgba(6,26,49,0.08)_100%)] sm:bg-[linear-gradient(90deg,#ff6900_0%,rgba(255,118,0,0.98)_24%,rgba(247,158,0,0.87)_46%,rgba(247,158,0,0.14)_70%,transparent_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 z-[1] h-44 bg-gradient-to-b from-[#061A31]/65 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 z-[1] h-40 bg-gradient-to-t from-[#061A31]/35 to-transparent" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-[690px] max-w-[1740px] items-center px-5 pb-28 pt-[120px] sm:px-8 sm:pb-32 lg:min-h-[748px] lg:px-10 lg:pb-28 lg:pt-[142px]">
        <div className="max-w-[680px] xl:max-w-[720px]">
          <p className="text-xs font-black uppercase tracking-[0.09em] text-[#08213d] sm:text-sm lg:text-base">
            {campaign.eyebrow}
          </p>
          <h1 className="homepage-condensed mt-4 max-w-[700px] [--homepage-mobile-size:3.75rem] text-[3.75rem] font-black uppercase leading-[0.84] tracking-[-0.02em] text-[#061A31] sm:text-[5rem] lg:text-[6.7rem] xl:text-[7.1rem]">
            {campaign.headline}
          </h1>
          <p className="mt-4 max-w-xl text-base font-medium leading-6 text-[#102a43] sm:text-lg sm:leading-7 lg:text-xl">
            {heroDescription}
          </p>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-7">
            <button
              type="button"
              onClick={() => goTo(campaign.primaryCta.href)}
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-[#071C35] px-7 py-3 text-sm font-extrabold uppercase tracking-[0.01em] text-white transition-colors hover:bg-[#0e3157] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF6900] sm:text-base"
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
