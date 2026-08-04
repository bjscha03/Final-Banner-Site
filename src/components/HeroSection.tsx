import React from 'react';
import { ArrowRight, Check, Eye, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ProductVisual from '@/components/product/ProductVisual';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  const startOrder = () => {
    navigate('/design');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden bg-[#0B1F3A] text-white">
      <div className="absolute inset-y-0 right-0 hidden w-[42%] border-l border-white/10 bg-[#102A4C] lg:block" aria-hidden="true" />
      <div className="brand-shell relative grid min-h-[650px] items-center gap-10 py-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#FF8A3D]">Custom printing · Nationwide shipping</p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.25rem]">
            Custom banners and signs that get noticed.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Choose your product, upload artwork, and review a live print preview before checkout. Most standard orders are produced within 24 hours, followed by free next-day air.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={startOrder} className="brand-button-primary gap-2 px-7">
              Start your order <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link to="/vinyl-banners" className="brand-button-on-dark px-7">
              Compare products & pricing
            </Link>
          </div>

          <ul className="mt-9 grid gap-4 border-t border-white/15 pt-6 text-sm text-slate-200 sm:grid-cols-3" aria-label="Ordering benefits">
            <li className="flex items-center gap-2"><Eye className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Live print preview</li>
            <li className="flex items-center gap-2"><Check className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Current pricing shown</li>
            <li className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Ships nationwide</li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="absolute -left-3 top-8 h-[82%] w-1 bg-[#FF6A00]" aria-hidden="true" />
          <ProductVisual productSlug="vinyl-banners" priority className="aspect-[4/3] border border-white/15 bg-white" />
          <div className="grid grid-cols-2 border-x border-b border-white/15 bg-white text-[#0B1F3A]">
            <div className="border-r border-slate-200 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Made to size</p>
              <p className="mt-1 font-display font-bold">6″ to 600″ per side</p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Starting at</p>
              <p className="mt-1 font-display text-xl font-bold">$20</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
