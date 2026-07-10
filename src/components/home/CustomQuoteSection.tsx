import React from 'react';
import { ArrowRight, ClipboardList, PackageCheck, Ruler } from 'lucide-react';
import { Link } from 'react-router-dom';

const CustomQuoteSection: React.FC = () => (
  <section className="bg-white px-4 py-12 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#18448D] via-[#12366f] to-slate-950 shadow-2xl">
      <div className="grid gap-8 p-8 text-white md:grid-cols-[1.2fr_0.8fr] md:p-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-300">Custom Quote</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Need Something Custom?</h2>
          <p className="mt-4 max-w-2xl text-lg text-blue-100">Need a special size, large quantity, or custom setup? Tell us what you need and we’ll prepare a personalized quote.</p>
          <Link to="/custom-quote" className="mt-7 inline-flex items-center rounded-full bg-[#FF6A00] px-6 py-3 font-black text-white shadow-lg transition hover:bg-orange-700">Request a Custom Quote <ArrowRight className="ml-2 h-5 w-5" /></Link>
        </div>
        <div className="grid gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><Ruler className="mb-2 h-5 w-5 text-orange-300" /> Special sizes and unusual dimensions</div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><PackageCheck className="mb-2 h-5 w-5 text-orange-300" /> Bulk quantities for banners, yard signs, and magnets</div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15"><ClipboardList className="mb-2 h-5 w-5 text-orange-300" /> Custom finishing, setup, and artwork notes</div>
        </div>
      </div>
    </div>
  </section>
);
export default CustomQuoteSection;
