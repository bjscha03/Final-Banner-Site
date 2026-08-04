import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const CustomQuoteSection: React.FC = () => (
  <section className="bg-white px-4 pb-14 pt-2 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20">
    <div className="mx-auto max-w-7xl border-l-4 border-[#FF6A00] bg-[#0B1F3A] text-white">
      <div className="grid gap-9 p-7 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:p-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF8A3D]">Outside the standard configurator?</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.035em] sm:text-4xl">Tell us what the job actually requires.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Use the custom quote form for unusual dimensions, large quantities, specialized finishing, or an order that needs extra production planning.</p>
          <Link to="/custom-quote" className="brand-button-primary mt-7 gap-2">
            Request a custom quote <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
        <ul className="divide-y divide-white/15 border-y border-white/15 text-sm text-slate-200">
          {['Special sizes or configurations', 'Bulk quantities across product types', 'Artwork, finishing, and deadline notes'].map((item) => (
            <li key={item} className="flex items-center gap-3 py-4"><Check className="h-5 w-5 flex-none text-[#FF8A3D]" aria-hidden="true" />{item}</li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default CustomQuoteSection;
