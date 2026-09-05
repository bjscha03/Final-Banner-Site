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

const HERO_INDUSTRY_SHORTCUTS = [
  { label: 'Apparel', industry: 'Fashion & Retail' },
  { label: 'Manufacturing', industry: 'Manufacturing & Technology' },
  { label: 'Gifts', query: 'gift' },
  { label: 'Healthcare', industry: 'Healthcare & Wellness' },
  { label: 'Home & Garden', industry: 'Agriculture & Landscape' },
] as const;

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
  const stateCount = states.filter((value) => value !== 'DC').length;
  const startDays = TRADE_SHOWS.map((event) => Number(event.startDate.slice(-2)));
  const showDateRange = `Aug. ${Math.min(...startDays)}–${Math.max(...startDays)} • Nationwide`;

  const scrollToResults = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('trade-show-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleHeroSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    scrollToResults();
  };

  const applyIndustryShortcut = (shortcut: (typeof HERO_INDUSTRY_SHORTCUTS)[number]) => {
    setState('all');
    if ('industry' in shortcut) {
      setIndustry(shortcut.industry);
      setQuery('');
    } else {
      setIndustry('all');
      setQuery(shortcut.query);
    }
    scrollToResults();
  };

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

      <section
        aria-labelledby="trade-show-calendar-title"
        className="overflow-hidden border-t-[8px] border-[#E84B14] bg-[#E7E0DA]"
        data-trade-show-hero
      >
        <div className="mx-auto grid w-full max-w-[1740px] lg:grid-cols-[40.58fr_59.42fr] 2xl:aspect-[1678/756]">
          <div
            className="flex min-w-0 flex-col justify-center px-5 py-10 text-[#061A31] sm:px-8 sm:py-14 lg:px-[clamp(2rem,3.3vw,3.5rem)] lg:py-10 xl:py-[clamp(2rem,4.2vw,4.4rem)]"
            style={{
              backgroundImage: 'radial-gradient(circle at 22% 15%, rgba(255,255,255,.62), transparent 34%), linear-gradient(110deg, #F6F2ED 0%, #E6DED8 100%)',
            }}
          >
            <p className="homepage-condensed text-xl uppercase leading-none tracking-[-0.01em] text-[#D84512] [--homepage-mobile-size:1.25rem] xl:text-[clamp(1.15rem,1.2vw,1.35rem)]">
              Exhibitor planning resource
            </p>

            <h1
              id="trade-show-calendar-title"
              className="homepage-condensed mt-6 font-black uppercase leading-[0.91] tracking-[-0.015em] [--homepage-mobile-size:clamp(2.8rem,14vw,4rem)] sm:text-[4.8rem] lg:mt-4 lg:text-[clamp(3.2rem,5.2vw,5.5rem)] xl:mt-[clamp(1.15rem,1.5vw,1.6rem)]"
            >
              <span className="block whitespace-nowrap text-[#DF4A14]">August 2026</span>
              <span className="block whitespace-nowrap text-[#061A31]">U.S. Trade Show</span>
              <span className="block whitespace-nowrap text-[#061A31]">Calendar</span>
            </h1>

            <p className="mt-6 max-w-[560px] text-base font-medium leading-7 text-[#14283E] sm:text-lg sm:leading-8 lg:mt-4 lg:text-base lg:leading-7 xl:mt-[clamp(1rem,1.5vw,1.6rem)] xl:text-lg xl:leading-8">
              Find upcoming exhibitions by event, city, state, or industry—then open a practical banner planner built around each show.
            </p>

            <div className="mt-5 h-0.5 w-[92px] bg-[#DF4A14] xl:mt-[clamp(.8rem,1.4vw,1.5rem)]" aria-hidden="true" />

            <form className="mt-5" onSubmit={handleHeroSearch} role="search">
              <label htmlFor="hero-trade-show-search" className="homepage-condensed block text-xl font-black uppercase leading-none tracking-[0.01em] [--homepage-mobile-size:1.25rem]">
                Find your next show
              </label>
              <div className="mt-3 overflow-hidden rounded-md border-2 border-[#061A31] bg-[#FBFAF7] transition focus-within:border-[#E84B14] focus-within:ring-2 focus-within:ring-[#E84B14]/35 sm:flex">
                <label className="relative block min-w-0 flex-1">
                  <span className="sr-only">Search events, cities, states, or industries</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-7 w-7 -translate-y-1/2 stroke-[2.5] text-[#061A31]" aria-hidden="true" />
                  <input
                    id="hero-trade-show-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search event, city, state, or industry"
                    className="h-14 w-full bg-transparent pl-14 pr-4 text-sm font-semibold text-[#061A31] outline-none placeholder:font-medium placeholder:text-[#14283E] sm:h-[60px] xl:h-16"
                  />
                </label>
                <button
                  type="submit"
                  className="group relative inline-flex h-14 w-full items-center justify-center gap-3 bg-[#061A31] px-5 font-mono text-xs font-black uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#123251] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F45B08] sm:h-auto sm:w-[33%] sm:min-w-[176px]"
                >
                  Search shows
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  <span className="absolute inset-y-0 right-0 w-1.5 bg-[#F45B08]" aria-hidden="true" />
                </button>
              </div>
            </form>

            <nav aria-label="Popular trade show industries" className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5 sm:gap-x-3 lg:grid-cols-3 xl:mt-[clamp(1rem,1.4vw,1.5rem)] xl:grid-cols-5">
              {HERO_INDUSTRY_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => applyIndustryShortcut(shortcut)}
                  className="group flex min-h-11 flex-col items-center justify-start gap-2 font-sans text-[11px] font-black uppercase leading-tight text-[#061A31] transition-colors hover:text-[#C94008] sm:text-[10px] xl:text-xs"
                >
                  <span className="whitespace-nowrap">{shortcut.label}</span>
                  <span className="h-0.5 w-8 bg-[#E84B14] transition-all group-hover:w-12" aria-hidden="true" />
                </button>
              ))}
            </nav>
          </div>

          <div className="relative aspect-[997/756] min-w-0 overflow-hidden bg-[#071B31] lg:aspect-auto">
            <img
              src="/images/trade-shows/august-2026-trade-show-hero.webp"
              alt="Northfork Tackle Co. trade show booth using coordinated vinyl wall, stand, and table banners"
              width="997"
              height="756"
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />

            <div className="absolute right-0 top-[7.4%] flex h-[5.85%] min-h-9 w-[30.1%] items-center justify-center rounded-l bg-[#E94B16] px-2 text-center font-mono text-[clamp(.55rem,1.18vw,1.25rem)] font-medium uppercase tracking-[-0.03em] text-white">
              {showDateRange}
            </div>

            <aside
              aria-label={`${TRADE_SHOWS.length} shows, ${TRADE_SHOWS.length} exhibitor guides, and ${stateCount} states plus the District of Columbia`}
              className="absolute bottom-[8.1%] right-[1.7%] top-[32.8%] flex w-[17.65%] flex-col justify-evenly rounded-[clamp(.35rem,.75vw,.75rem)] border-2 border-[#36506A] bg-[linear-gradient(145deg,#09243F_0%,#04192E_100%)] px-[3%] text-center shadow-[inset_0_0_18px_rgba(92,142,181,.18)]"
            >
              <div className="flex flex-1 flex-col items-center justify-center">
                <strong className="homepage-condensed text-[clamp(1.35rem,3.7vw,3.9rem)] font-black leading-none text-white [--homepage-mobile-size:clamp(1.35rem,3.7vw,3.9rem)]">{TRADE_SHOWS.length}</strong>
                <span className="mt-1 font-sans text-[clamp(.38rem,.83vw,.88rem)] font-black uppercase leading-tight text-[#F45B08]">Shows</span>
              </div>
              <div className="h-px w-full bg-white/25" aria-hidden="true" />
              <div className="flex flex-1 flex-col items-center justify-center">
                <strong className="homepage-condensed text-[clamp(1.35rem,3.7vw,3.9rem)] font-black leading-none text-white [--homepage-mobile-size:clamp(1.35rem,3.7vw,3.9rem)]">{TRADE_SHOWS.length}</strong>
                <span className="mt-1 font-sans text-[clamp(.35rem,.76vw,.82rem)] font-black uppercase leading-tight text-[#F45B08]">Exhibitor guides</span>
              </div>
              <div className="h-px w-full bg-white/25" aria-hidden="true" />
              <div className="flex flex-1 flex-col items-center justify-center">
                <strong className="homepage-condensed text-[clamp(1.35rem,3.7vw,3.9rem)] font-black leading-none text-white [--homepage-mobile-size:clamp(1.35rem,3.7vw,3.9rem)]">{stateCount}</strong>
                <span className="mt-1 font-sans text-[clamp(.35rem,.76vw,.82rem)] font-black uppercase leading-tight text-[#F45B08]">States + D.C.</span>
              </div>
            </aside>
          </div>
        </div>

        <HeroDeliveryStatus variant="trade-show" />
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

      <section id="trade-show-results" className="brand-shell scroll-mt-24 py-10 sm:py-14">
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
