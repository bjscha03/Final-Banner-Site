import React from 'react';
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  HeartHandshake,
  Landmark,
  MapPin,
  Store,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getActiveSeasonalCampaign } from '@/lib/seasonalCampaigns';

const iconMap = {
  school: GraduationCap,
  trophy: Trophy,
  store: Store,
  calendar: CalendarDays,
  map: MapPin,
  heart: HeartHandshake,
  landmark: Landmark,
};

const SeasonalMerchandising: React.FC = () => {
  const campaign = getActiveSeasonalCampaign();
  if (!campaign?.merchandising?.length) return null;

  return (
    <section
      data-seasonal-merchandising={campaign.id}
      className="border-y-4 border-[#F45B08] bg-[#FBF8F2] py-12 sm:py-14"
      aria-labelledby="seasonal-merchandising-heading"
    >
      <div className="mx-auto max-w-[1500px] px-4 sm:px-7 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94008] sm:text-sm">Popular right now</p>
            <h2 id="seasonal-merchandising-heading" className="homepage-condensed mt-3 max-w-[720px] [--homepage-mobile-size:3rem] text-5xl font-black uppercase leading-[0.9] text-[#061A31] sm:text-6xl lg:text-[4.6rem]">
              Plan the next event before it gets busy.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-slate-600 lg:justify-self-end lg:text-lg">
            Practical banner and sign ideas for the events customers are preparing for now, with clear paths to the right product.
          </p>
        </div>

        <div className="mt-8 grid border-t border-[#6f91ab] lg:grid-cols-3 lg:border-l">
          {campaign.merchandising.map((item, index) => {
            const Icon = iconMap[item.icon];
            return (
              <article
                key={item.title}
                className={`group px-5 py-7 sm:px-7 lg:py-8 ${index > 0 ? 'border-t border-[#6f91ab] lg:border-l lg:border-t-0' : ''}`}
              >
                <Icon className="h-10 w-10 stroke-[1.6] text-[#F45B08]" aria-hidden="true" />
                <h3 className="homepage-condensed mt-5 [--homepage-mobile-size:1.7rem] text-[1.7rem] font-black uppercase leading-[0.95] text-[#061A31] sm:text-[2rem]">
                  {item.title}
                </h3>
                <p className="mt-4 min-h-[72px] text-sm leading-6 text-slate-600">{item.description}</p>
                <Link to={item.href} className="mt-4 inline-flex items-center gap-2 border-b-2 border-[#F45B08] pb-1 font-extrabold text-[#061A31] transition-colors group-hover:text-[#C94008]">
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
