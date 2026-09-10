import React from 'react';
import { ArrowRight, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';

const CompanySpotlight: React.FC = () => (
  <section className="bg-[#061A31] text-white" aria-labelledby="spotlight-heading">
    <article className="grid w-full overflow-hidden lg:grid-cols-[1fr_1.08fr]">
      <div className="relative min-h-[430px] bg-[#0a294a] sm:min-h-[520px] lg:min-h-[610px]">
        <img
          src="https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1100/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
          alt="Dan Oliver, founder of Dan-O's Seasoning"
          width="1100"
          height="900"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#061A31]/20" aria-hidden="true" />
      </div>
      <div className="flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:px-16 xl:px-20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF6900] sm:text-sm">Customer spotlight</p>
        <h2 id="spotlight-heading" className="homepage-condensed mt-4 max-w-2xl [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.9] text-white sm:text-6xl lg:text-[5rem]">
          Print support for a brand on the move.
        </h2>
        <Quote className="mt-7 h-9 w-9 fill-none stroke-[2.2] text-[#FF6900]" aria-hidden="true" />
        <blockquote className="mt-3 max-w-2xl text-xl font-semibold italic leading-8 text-white sm:text-2xl sm:leading-9">
          “Banners on the Fly delivered exactly what we needed for our nationwide events. Fast, professional, and high quality every time.”
        </blockquote>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-slate-300 sm:text-sm">Dan Oliver · Founder, Dan-O's Seasoning</p>
        <Link to="/design" className="mt-7 inline-flex min-h-12 w-fit items-center justify-center gap-3 rounded-md bg-[#C94008] px-6 py-3 font-extrabold uppercase text-white transition-colors hover:bg-[#B93808] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          Start an order <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  </section>
);

export default CompanySpotlight;
