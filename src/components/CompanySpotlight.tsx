import React from 'react';
import { ArrowRight, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';

const CompanySpotlight: React.FC = () => (
  <section className="brand-section border-y border-slate-200 bg-[#F7F7F7]" aria-labelledby="spotlight-heading">
    <div className="brand-shell">
      <article className="grid overflow-hidden border border-slate-200 bg-white lg:grid-cols-[0.88fr_1.12fr]">
        <div className="relative min-h-[360px] bg-slate-200 lg:min-h-[500px]">
          <img
            src="https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_900/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
            alt="Dan Oliver, founder of Dan-O's Seasoning"
            width={900}
            height={700}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
          <p className="brand-eyebrow">Customer spotlight</p>
          <h2 id="spotlight-heading" className="brand-title mt-3">Print support for a brand on the move.</h2>
          <Quote className="mt-8 h-8 w-8 text-[#FF6A00]" aria-hidden="true" />
          <blockquote className="mt-4 font-display text-2xl font-semibold leading-9 tracking-[-0.02em] text-[#0B1F3A] sm:text-3xl sm:leading-10">
            “Banners on the Fly delivered exactly what we needed for our nationwide events. Fast, professional, and high quality every time.”
          </blockquote>
          <p className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Dan Oliver · Founder, Dan-O's Seasoning</p>
          <Link to="/design" className="brand-button-primary mt-8 w-fit gap-2">
            Start an order <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </article>
    </div>
  </section>
);

export default CompanySpotlight;
