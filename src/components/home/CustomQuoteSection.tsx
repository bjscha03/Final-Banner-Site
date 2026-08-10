import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const CustomQuoteSection: React.FC = () => (
  <section
    className="bg-[#F45B08] px-4 py-6 sm:px-7 sm:py-7 lg:px-10"
    style={{ backgroundImage: 'radial-gradient(circle at 18% 22%, rgba(255,255,255,.13) 0 1px, transparent 2px), radial-gradient(circle at 74% 66%, rgba(6,26,49,.13) 0 1px, transparent 2px)' }}
  >
    <div className="mx-auto max-w-[1400px] bg-[#061A31] text-white shadow-[0_16px_50px_rgba(6,26,49,.24)]">
      <div className="grid gap-9 px-7 py-9 sm:px-10 sm:py-11 lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:px-14 lg:py-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6900] sm:text-sm">Outside the standard configurator?</p>
          <h2 className="homepage-condensed mt-3 max-w-3xl [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.88] text-white sm:text-6xl lg:text-[4.6rem]">
            Tell us what the job actually requires.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200">
            Use the custom quote form for unusual dimensions, large quantities, specialized finishing, or production planning.
          </p>
          <Link to="/custom-quote" className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-[#F45B08] px-6 py-3 font-extrabold uppercase text-white transition-colors hover:bg-[#ff741f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Request a custom quote <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <ul className="divide-y divide-[#5c7690] border-y border-[#5c7690] text-sm text-white lg:border-l lg:border-y-0 lg:pl-10">
          {['Special sizes or configurations', 'Bulk quantities across product types', 'Artwork, finishing, and deadline notes'].map((item) => (
            <li key={item} className="flex items-center gap-4 py-4 text-base">
              <Check className="h-5 w-5 flex-none stroke-[3] text-[#FF6900]" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default CustomQuoteSection;
