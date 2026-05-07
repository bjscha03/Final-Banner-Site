import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Clock, Truck, ShieldCheck, ArrowRight, CheckCircle, Star, MessageSquare, ChevronDown } from 'lucide-react';

const productCards = [
  'Yard Signs',
  'Vinyl Banners',
  'Mesh Fence Banners',
  'Rally Signs',
  'Campaign Packages',
  'Event Displays',
];

const useCases = ['Elections', 'Fundraisers', 'Volunteer Drives', 'Campaign HQs', 'Local Events', 'Community Promotions'];

const faqs = [
  ['How fast can campaign signs be printed?', 'Most orders are printed within 24 hours after proof approval and ship free via next-day air.'],
  ['Can I upload my own campaign artwork?', 'Yes. Upload ready-to-print files or start with one of our campaign templates.'],
  ['Do you offer design support?', 'Yes. Upload artwork or have our design team create campaign-ready layouts for your signs and banners.'],
  ['What materials are available?', 'We offer corrugated plastic yard signs plus premium vinyl and mesh banner materials for indoor and outdoor campaign use.'],
];

const GraduationSigns: React.FC = () => {
  return (
    <div className="bg-white text-[#07162F]">
      <Helmet>
        <title>Political Campaign Signs & Banners | Banners On The Fly</title>
      </Helmet>

      <header className="fixed top-0 z-50 w-full transition-all bg-transparent backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="text-white font-black tracking-wide text-lg">BANNERS ON THE FLY</Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex text-xs font-bold rounded-full bg-white/10 text-white px-3 py-1 border border-white/30">24-Hour Production</span>
            <a href="#order" className="rounded-lg bg-[#F45A12] hover:bg-[#dd4f0f] text-white px-5 py-2.5 font-bold">Start Your Order</a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden min-h-[780px] flex items-center pt-20">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://res.cloudinary.com/dtrxl120u/image/upload/v1778177853/political_banners_cdgdgp.png')" }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(7,22,47,0.95) 0%, rgba(7,22,47,0.9) 34%, rgba(7,22,47,0.65) 54%, rgba(7,22,47,0.2) 72%, rgba(7,22,47,0) 100%)' }} />

        <div className="relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl text-white">
            <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold mb-6">POLITICAL CAMPAIGN SIGNS</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight">Get Campaign <span className="text-[#F45A12]">Signs &amp; Banners</span> Printed Fast</h1>
            <p className="mt-5 text-lg text-white/90">24-hour production, free next-day air shipping, and durable political signage built to help your campaign get noticed.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#order" className="w-full sm:w-auto text-center rounded-lg bg-[#F45A12] hover:bg-[#dd4f0f] font-bold px-7 py-3.5">Start Your Order Today</a>
              <a href="#categories" className="w-full sm:w-auto text-center rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 font-bold px-7 py-3.5">Shop Yard Signs</a>
            </div>
            <p className="mt-4 text-sm text-white/75">Need help with design? Upload artwork or let our designers create it for you.</p>
            <div className="mt-8 grid sm:grid-cols-3 gap-3">
              {([
                ['Printed in 24 hours after approval', Clock],
                ['FREE next-day air shipping', Truck],
                ['Premium vinyl, mesh & corrugated signs', ShieldCheck],
              ] as const).map(([text, Icon]) => (
                <div key={String(text)} className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#F45A12]" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="py-16 sm:py-20 bg-[#F7F9FC]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center">Campaign Product Categories</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{productCards.map((name) => <div key={name} className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm hover:shadow-md transition p-6 font-bold">{name}</div>)}</div>
        </div>
      </section>

      <section className="py-16 sm:py-20"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"><h2 className="text-3xl sm:text-4xl font-extrabold text-center">Why Campaigns Choose Us</h2></div></section>
      <section className="py-16 bg-[#F7F9FC]"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"><h2 className="text-3xl font-extrabold text-center">Reviews & Social Proof</h2></div></section>

      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center">Perfect For</h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{useCases.map((u) => <div key={u} className="rounded-xl border p-5 font-semibold flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#D71920]" />{u}</div>)}</div>
        </div>
      </section>

      <section className="py-14 bg-[#102A5C] text-white text-center"><h3 className="text-2xl font-black">Need Signs Fast for Election Day?</h3><p className="mt-2 text-white/80">Submit your order now for 24-hour production and free next-day air shipping.</p><a href="#order" className="inline-flex mt-6 rounded-lg bg-[#F45A12] px-7 py-3 font-bold">Start Your Order <ArrowRight className="ml-2 h-5 w-5" /></a></section>

      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-center">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-3">{faqs.map(([q,a]) => <details key={q} className="rounded-xl border bg-[#F7F9FC] p-5"><summary className="list-none cursor-pointer font-bold flex justify-between">{q}<ChevronDown className="h-5 w-5" /></summary><p className="mt-3 text-[#334155]">{a}</p></details>)}</div>
        </div>
      </section>

      <footer id="order" className="py-16 bg-[#07162F] text-white text-center"><h3 className="text-3xl font-black">Ready to Launch Your Campaign?</h3><p className="mt-2 text-white/75">Order campaign signs and banners built for speed, quality, and visibility.</p><a href="/design?product=yard-signs" className="inline-flex mt-6 rounded-lg bg-[#F45A12] px-8 py-3.5 font-bold">Start Your Order Today</a></footer>
    </div>
  );
};

export default GraduationSigns;
