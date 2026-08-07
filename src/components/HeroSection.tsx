import React from 'react';
import { ArrowRight, Check, Eye, Sparkles, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ProductVisual from '@/components/product/ProductVisual';
import { EVERGREEN_HERO, getHomepageHeroCampaign } from '@/lib/seasonalCampaigns';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const campaign = getHomepageHeroCampaign();
  const isSeasonal = campaign.id !== EVERGREEN_HERO.id && Boolean(campaign.artwork);

  const goTo = (href: string) => {
    navigate(href);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section
      data-homepage-hero={campaign.id}
      {...(isSeasonal ? { 'data-seasonal-campaign': campaign.id } : {})}
      className="relative overflow-hidden border-b border-slate-200 bg-[#F8FAF7] text-[#0B1F3A]"
    >
      <div className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-[#FFE8D7]/70 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-[#DDEBE6]/70 blur-3xl" aria-hidden="true" />

      <div className="brand-shell relative grid min-h-[620px] items-center gap-10 py-12 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A63C00]">{campaign.eyebrow}</p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-[#0B1F3A] sm:text-5xl lg:text-[4rem]">
            {campaign.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            {campaign.description}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => goTo(campaign.primaryCta.href)} className="brand-button-primary gap-2 px-7">
              {campaign.primaryCta.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link to={campaign.secondaryCta.href} className="brand-button-secondary px-7">
              {campaign.secondaryCta.label}
            </Link>
          </div>

          <ul className="mt-9 grid gap-3 border-t border-slate-300 pt-6 text-sm font-semibold text-slate-700 sm:grid-cols-3" aria-label="Ordering benefits">
            {campaign.valueProps.map((item, index) => {
              const Icon = [Truck, Check, Eye][index] ?? Sparkles;
              return (
                <li key={item} className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-5 w-5 flex-none text-[#C94E00]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          {isSeasonal && campaign.artwork ? (
            <div className="overflow-hidden border border-slate-200 bg-white shadow-[0_24px_65px_rgba(11,31,58,0.14)]">
              <picture data-seasonal-hero-art>
                <source media="(max-width: 639px)" srcSet={campaign.artwork.mobileSrc} />
                <img
                  src={campaign.artwork.desktopSrc}
                  alt={campaign.artwork.alt}
                  width={campaign.artwork.desktopWidth}
                  height={campaign.artwork.desktopHeight}
                  loading="eager"
                  className="aspect-[4/5] h-full w-full object-cover sm:aspect-[16/10]"
                />
              </picture>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-200 bg-white shadow-[0_24px_65px_rgba(11,31,58,0.12)]">
              <ProductVisual productSlug="vinyl-banners" priority className="aspect-[16/10] bg-white" />
              <div className="border-t border-slate-200 bg-white text-[#0B1F3A]">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-5">
                  <div className="shrink-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Starting at</p>
                    <p className="mt-1 font-display text-xl font-bold">$20</p>
                  </div>
                  <p className="max-w-xs text-sm leading-6 text-slate-500 sm:text-right">Includes free next-day air shipping after production</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
