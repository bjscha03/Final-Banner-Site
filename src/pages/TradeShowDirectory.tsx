import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ExternalLink,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import Layout from '@/components/Layout';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import SEO from '@/components/SEO';
import { getConfiguratorUrl } from '@/lib/configurator';
import { getTradeShowPageContent } from '@/lib/tradeShows/tradeShowContent';
import { buildTradeShowDirectorySchema } from '@/lib/tradeShows/tradeShowSchema';
import {
  TRADE_SHOWS,
  TRADE_SHOW_INDUSTRIES,
  formatTradeShowDateRange,
  getTradeShowPath,
} from '@/lib/tradeShows/tradeShows';

const DESCRIPTION = 'Search 75 August 2026 U.S. trade shows and open a detailed exhibitor guide with show-specific banner messaging, sizing, setup, and organizer links.';
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function getMonthLabel(date: string): string {
  return monthFormatter.format(new Date(`${date}T12:00:00Z`));
}

const TradeShowDirectory: React.FC = () => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [industry, setIndustry] = useState('all');
  const states = useMemo(() => [...new Set(TRADE_SHOWS.map((event) => event.state))].sort(), []);
  const designUrl = getConfiguratorUrl('vinyl-banners', '/trade-shows', 'trade-show');

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return TRADE_SHOWS.filter((event) => {
      const searchable = `${event.name} ${event.shortName} ${event.city} ${event.state} ${event.industry}`.toLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (state === 'all' || event.state === state)
        && (industry === 'all' || event.industry === industry);
    });
  }, [industry, query, state]);

  const hasFilters = Boolean(query || state !== 'all' || industry !== 'all');
  const clearFilters = () => {
    setQuery('');
    setState('all');
    setIndustry('all');
  };

  return (
    <Layout>
      <SEO
        title="August 2026 U.S. Trade Shows & Exhibitor Planner"
        description={DESCRIPTION}
        canonical="https://bannersonthefly.com/trade-shows"
        schema={buildTradeShowDirectorySchema(DESCRIPTION)}
      />

      <section className="relative overflow-hidden bg-[#0B1F3A] text-white">
        <div className="brand-shell relative py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF8A3D]">Exhibitor planning resource</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">August 2026 U.S. Trade Show Calendar</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Find upcoming exhibitions by event, location, or industry—then open a practical booth-banner planner built around each show.</p>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/15 pt-6 text-sm text-slate-200">
              <span><strong className="font-display text-2xl text-white">75</strong> shows starting Aug. 6–31</span>
              <span><strong className="font-display text-2xl text-white">75</strong> detailed exhibitor guides</span>
              <span><strong className="font-display text-2xl text-white">22</strong> states + D.C.</span>
            </div>
            <HeroDeliveryStatus className="mt-7 w-full max-w-[570px]" />
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#F7F7F7]">
        <div className="brand-shell py-5">
          <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Trade Shows', url: '/trade-shows' }]} className="mb-5" />
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_190px_260px_auto]">
            <label className="relative block">
              <span className="sr-only">Search events, cities, or industries</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search event, city, state, or industry"
                className="h-12 w-full rounded-none border border-slate-300 bg-white pl-11 pr-4 text-sm text-[#0B1F3A] outline-none transition focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
              />
            </label>
            <label>
              <span className="sr-only">Filter by state</span>
              <select value={state} onChange={(event) => setState(event.target.value)} className="h-12 w-full rounded-none border border-slate-300 bg-white px-3 text-sm font-medium text-[#0B1F3A] outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20">
                <option value="all">All states</option>
                {states.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by industry</span>
              <select value={industry} onChange={(event) => setIndustry(event.target.value)} className="h-12 w-full rounded-none border border-slate-300 bg-white px-3 text-sm font-medium text-[#0B1F3A] outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20">
                <option value="all">All industries</option>
                {TRADE_SHOW_INDUSTRIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button type="button" onClick={clearFilters} disabled={!hasFilters} className="inline-flex h-12 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-bold text-[#0B1F3A] transition hover:border-[#0B1F3A] disabled:cursor-not-allowed disabled:opacity-40">
              {hasFilters ? <X className="h-4 w-4" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="brand-shell py-10 sm:py-14">
        <div className="mb-7 flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A00]">Calendar results</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em] text-[#0B1F3A]">{filteredEvents.length} upcoming {filteredEvents.length === 1 ? 'show' : 'shows'}</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">Dates and locations can change. Each listing links to the organizer so exhibitors can confirm registration, venue, and move-in rules.</p>
        </div>

        {filteredEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-trade-show-results>
            {filteredEvents.map((event) => {
              const content = getTradeShowPageContent(event);
              return (
                <article key={event.slug} className="group flex min-h-[270px] flex-col border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_35px_rgba(11,31,58,0.09)]" data-trade-show-card>
                  <div className="flex border-b border-slate-200">
                    <div className="flex w-[76px] flex-none flex-col items-center justify-center bg-[#0B1F3A] px-2 py-4 text-white">
                      <span className="text-xs font-bold uppercase tracking-[0.15em] text-[#FF8A3D]">{getMonthLabel(event.startDate)}</span>
                      <span className="mt-1 font-display text-3xl font-bold leading-none">{Number(event.startDate.slice(-2))}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{event.industry}</span>
                      {content.organizerVerified && <span className="inline-flex flex-none items-center gap-1 text-xs font-bold text-emerald-700"><BadgeCheck className="h-4 w-4" aria-hidden="true" />Organizer reviewed</span>}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-xl font-bold leading-6 text-[#0B1F3A]">
                      <Link to={getTradeShowPath(event)} className="transition group-hover:text-[#C94F00]">{event.name}</Link>
                    </h3>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p className="flex gap-2"><CalendarDays className="mt-0.5 h-4 w-4 flex-none text-[#FF6A00]" aria-hidden="true" />{formatTradeShowDateRange(event)}</p>
                      <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-none text-[#FF6A00]" aria-hidden="true" />{event.city}, {event.state}{content.venue ? ` · ${content.venue}` : ''}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                      <Link to={getTradeShowPath(event)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Exhibitor planner<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                      <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#0B1F3A]">Official site<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-slate-300 bg-[#F7F7F7] px-6 py-14 text-center">
            <Search className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
            <h3 className="mt-4 font-display text-2xl font-bold text-[#0B1F3A]">No shows match those filters</h3>
            <p className="mt-2 text-slate-600">Try a broader search or clear the state and industry filters.</p>
            <button type="button" onClick={clearFilters} className="mt-5 font-bold text-[#18448D] underline decoration-2 underline-offset-4 hover:text-[#C94F00]">Show all August events</button>
          </div>
        )}
      </section>

      <section className="bg-[#F7F7F7] py-12 sm:py-16">
        <div className="brand-shell grid gap-8 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">Exhibiting this month?</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Turn the calendar into a booth-banner plan.</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">Choose a size, upload artwork, preview the design, and see the current delivery estimate before checkout. Banner production and transit are separate timelines.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link to={designUrl} className="brand-button-primary gap-2 px-7" data-trade-show-cta>Design a trade show banner<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
            <Link to="/trade-show-banners" className="brand-button-on-dark px-7">See banner options</Link>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default TradeShowDirectory;
