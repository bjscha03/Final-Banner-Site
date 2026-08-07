import React from 'react';
import { ArrowRight, GraduationCap, Store, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getActiveSeasonalCampaign } from '@/lib/seasonalCampaigns';

const iconMap = {
  school: GraduationCap,
  trophy: Trophy,
  store: Store,
};

const SeasonalMerchandising: React.FC = () => {
  const campaign = getActiveSeasonalCampaign();
  if (!campaign?.merchandising?.length) return null;

  return (
    <section
      data-seasonal-merchandising={campaign.id}
      className="border-b border-slate-200 bg-[#F6F9F4] py-10 sm:py-12"
      aria-labelledby="seasonal-merchandising-heading"
    >
      <div className="brand-shell">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="brand-eyebrow">Popular right now</p>
            <h2 id="seasonal-merchandising-heading" className="mt-2 font-display text-2xl font-bold tracking-[-0.025em] text-[#0B1F3A] sm:text-3xl">
              What customers are preparing for next.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600 lg:text-right">
            Timely ideas based on real seasonal signage needs—not a made-up holiday promotion.
          </p>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {campaign.merchandising.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <article key={item.title} className="group border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(11,31,58,0.05)] transition hover:-translate-y-0.5 hover:border-[#0B1F3A]/35">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF1E7] text-[#A63C00]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-[#0B1F3A]">{item.title}</h3>
                <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{item.description}</p>
                <Link to={item.href} className="mt-4 inline-flex items-center gap-2 font-bold text-[#0B1F3A] underline decoration-[#FF6A00] decoration-2 underline-offset-4 group-hover:text-[#A63C00]">
                  {item.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SeasonalMerchandising;
