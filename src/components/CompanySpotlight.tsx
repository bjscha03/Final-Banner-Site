import React from 'react';
import { ArrowRight, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';

const CompanySpotlight: React.FC = () => (
  <section className="bg-white py-8 text-[#061A31] lg:py-10" aria-labelledby="spotlight-heading">
    <article className="mx-auto grid max-w-[1500px] items-center gap-6 px-4 sm:grid-cols-[180px_1fr] sm:px-7 lg:grid-cols-[260px_0.85fr_1.25fr] lg:gap-10 lg:px-10">
      <div className="h-[220px] w-[220px] overflow-hidden bg-[#252727] sm:h-[200px] sm:w-full lg:h-[260px]">
        <img
          src="https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1100/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
          alt="Dan Oliver, founder of Dan-O's Seasoning"
          width="1100"
          height="900"
          loading="lazy"
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94008]">Customer spotlight</p>
        <h2 id="spotlight-heading" className="homepage-condensed mt-3 [--homepage-mobile-size:2.5rem] text-[2.5rem] font-black uppercase leading-none xl:text-5xl">
          Big flavor.<br />Bold presence.
        </h2>
        <p className="mt-3 text-lg">Dan-O's Seasoning</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <Quote className="h-7 w-7 fill-none stroke-[2.2] text-[#FF6900]" aria-hidden="true" />
        <blockquote className="mt-2 text-lg leading-7 xl:text-xl xl:leading-8">
          “Banners on the Fly delivered exactly what we needed for our nationwide events. Fast, professional, and high quality every time.”
        </blockquote>
        <p className="mt-3 text-[11px] font-bold uppercase leading-5 tracking-[0.12em]">Dan Oliver · Founder, Dan-O's Seasoning</p>
        <Link to="/design" className="mt-3 inline-flex min-h-11 w-fit items-center gap-3 border-b-2 border-[#F45B08] text-sm font-bold uppercase transition-colors hover:text-[#C94008] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
          Start an order <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
    <div className="mx-auto mt-8 max-w-[1420px] border-b border-slate-200" aria-hidden="true" />
  </section>
);

export default CompanySpotlight;
