import React from 'react';
import { Box, Eye, Timer, Truck } from 'lucide-react';

const features = [
  {
    icon: Timer,
    title: '24-hour standard production',
    description: 'Most standard orders are produced within 24 hours.',
  },
  {
    icon: Truck,
    title: 'Free next-day air',
    description: 'Carrier transit begins after production is complete.',
  },
  {
    icon: Eye,
    title: 'Review before ordering',
    description: 'Confirm size, placement, and cropping before checkout.',
  },
  {
    icon: Box,
    title: 'Clear product & price details',
    description: 'Materials, add-ons, minimums, and pricing are shown up front.',
  },
];

const WhyChooseUs: React.FC = () => (
  <section className="border-y-4 border-[#F45B08] bg-[#FBF8F2] py-12 sm:py-14" aria-labelledby="why-heading">
    <div className="mx-auto grid max-w-[1500px] gap-9 px-4 sm:px-7 lg:grid-cols-[280px_1fr] lg:gap-10 lg:px-10">
      <div className="lg:py-1">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94008]">Order with clarity</p>
        <h2 id="why-heading" className="homepage-condensed mt-3 [--homepage-mobile-size:2.7rem] text-4xl font-black uppercase leading-[0.92] text-[#061A31] sm:text-5xl lg:text-[3.75rem]">
          No surprises<br />before checkout.
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
          The important production, delivery, preview, and pricing facts—up front.
        </p>
      </div>

      <div className="grid border-t border-[#6f91ab] sm:grid-cols-2 lg:grid-cols-4 lg:border-l lg:border-t-0">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <article
              key={feature.title}
              className={`px-5 py-7 text-center sm:px-7 lg:py-2 ${index > 0 ? 'border-t border-[#6f91ab] sm:border-t-0 sm:border-l' : ''} ${index === 2 ? 'sm:border-l-0 sm:border-t lg:border-l lg:border-t-0' : ''}`}
            >
              <Icon className="mx-auto h-10 w-10 stroke-[1.6] text-[#F45B08]" aria-hidden="true" />
              <h3 className="homepage-condensed mx-auto mt-5 max-w-[190px] [--homepage-mobile-size:1.5rem] text-2xl font-black uppercase leading-[0.95] text-[#061A31]">
                {feature.title}
              </h3>
              <p className="mx-auto mt-4 max-w-[210px] text-sm leading-6 text-slate-600">{feature.description}</p>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);

export default WhyChooseUs;
