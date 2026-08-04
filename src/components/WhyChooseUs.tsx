import React from 'react';
import { Clock, FileCheck2, Headphones, PackageCheck, ShieldCheck, Truck } from 'lucide-react';

const features = [
  {
    icon: Clock,
    title: 'Fast standard production',
    description: 'Most standard orders are produced within 24 hours. Large, custom, or file-dependent work can take longer.',
  },
  {
    icon: Truck,
    title: 'Nationwide next-day air',
    description: 'Free next-day air describes carrier transit after production, with timing shown separately and clearly.',
  },
  {
    icon: FileCheck2,
    title: 'Live print preview',
    description: 'Review size, placement, cropping, and the configured product before you submit the order.',
  },
  {
    icon: PackageCheck,
    title: 'Transparent product facts',
    description: 'Sizes, materials, add-ons, minimums, limitations, and current price examples are available before checkout.',
  },
  {
    icon: ShieldCheck,
    title: 'Damage and defect review',
    description: 'Verified shipping damage or production defects reported within five business days can qualify for a reprint.',
  },
  {
    icon: Headphones,
    title: 'Real support when needed',
    description: 'Ask about artwork, fixed event dates, large quantities, or unusual specifications before placing the order.',
  },
];

const WhyChooseUs: React.FC = () => (
  <section className="brand-section border-y border-slate-200 bg-[#F7F7F7]" aria-labelledby="why-heading">
    <div className="brand-shell grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
      <div>
        <p className="brand-eyebrow">A clearer way to order print</p>
        <h2 id="why-heading" className="brand-title mt-3">The details you need, before you pay.</h2>
        <p className="brand-copy mt-5">Speed matters, but so does knowing exactly what is being made. Our ordering experience keeps product facts, timing, artwork review, and pricing in view.</p>
      </div>

      <div className="grid border-t border-slate-300 sm:grid-cols-2">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className={`border-b border-slate-300 py-6 ${index % 2 === 0 ? 'sm:pr-7' : 'sm:border-l sm:pl-7'}`}>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center border border-[#0B1F3A]/15 bg-white text-[#0B1F3A]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#0B1F3A]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);

export default WhyChooseUs;
