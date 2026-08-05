import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  ExternalLink,
  MapPin,
  Ruler,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import { getConfiguratorUrl } from '@/lib/configurator';
import { buildTradeShowDetailSchema } from '@/lib/tradeShows/tradeShowSchema';
import {
  formatMonthDay,
  formatTradeShowDateRange,
  getArtworkReadyDate,
  getTradeShowBySlug,
  getTradeShowPath,
  getTradeShowSeo,
  isIndexableTradeShow,
} from '@/lib/tradeShows/tradeShows';
import NotFound from './NotFound';

const bannerStartingPoints = [
  { size: '6 × 2 ft', use: 'Table-front or low rail', note: 'Confirm the visible table width and attachment method.' },
  { size: '8 × 3 ft', use: 'Back-wall or aisle header', note: 'Check pipe-and-drape width and neighboring sightlines.' },
  { size: '8 × 8 ft', use: 'Step-and-repeat backdrop', note: 'Verify booth depth, stand footprint, and fire rules.' },
];

const TradeShowDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const event = getTradeShowBySlug(slug);
  if (!event) return <NotFound />;

  const reviewed = isIndexableTradeShow(event);
  const path = getTradeShowPath(event);
  const seo = getTradeShowSeo(event);
  const designUrl = getConfiguratorUrl('vinyl-banners', path, 'trade-show');
  const artworkReadyDate = getArtworkReadyDate(event.startDate);
  const summary = reviewed
    ? event.editorial.summary
    : `${event.name} is scheduled for ${formatTradeShowDateRange(event)} in ${event.city}, ${event.state}. Use this planning page to organize booth graphics, then confirm every event detail and exhibitor rule with the organizer.`;
  const venue = reviewed ? event.editorial.venue : 'Confirm with organizer';

  return (
    <Layout>
      <SEO
        title={seo.title}
        description={seo.description}
        canonical={`https://bannersonthefly.com${path}`}
        noindex={!reviewed}
        schema={buildTradeShowDetailSchema(event, seo.description)}
      />

      <section className="bg-[#0B1F3A] text-white">
        <div className="brand-shell py-10 sm:py-14 lg:py-16">
          <Breadcrumbs
            items={[{ name: 'Home', url: '/' }, { name: 'Trade Shows', url: '/trade-shows' }, { name: event.shortName, url: path }]}
            className="mb-7 [&_span]:text-slate-300 [&_a]:text-slate-300 [&_a:hover]:text-white [&_svg]:text-slate-500"
          />
          <div className="grid gap-9 lg:grid-cols-[1fr_320px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">2026 exhibitor planner</span>
                {reviewed && <span className="inline-flex items-center gap-1.5 border border-emerald-400/35 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200"><BadgeCheck className="h-4 w-4" aria-hidden="true" />Official details reviewed</span>}
              </div>
              <h1 className="mt-4 max-w-4xl font-display text-4xl font-bold leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{event.name}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{summary}</p>
            </div>
            <div className="border-l-4 border-[#FF6A00] bg-white/5 p-6">
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-400"><CalendarDays className="h-4 w-4 text-[#FF8A3D]" aria-hidden="true" />Dates</dt>
                  <dd className="mt-1.5 font-display text-xl font-bold text-white">{formatTradeShowDateRange(event)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-400"><MapPin className="h-4 w-4 text-[#FF8A3D]" aria-hidden="true" />Location</dt>
                  <dd className="mt-1.5 font-display text-xl font-bold text-white">{event.city}, {event.state}</dd>
                  <dd className="mt-1 text-slate-300">{venue}</dd>
                </div>
              </dl>
              <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#FFB17A] hover:text-white">Confirm on official site<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#F7F7F7]">
        <div className="brand-shell grid gap-5 py-6 md:grid-cols-3">
          <div className="flex gap-3">
            <CalendarCheck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Artwork-ready checkpoint</p><p className="mt-1 text-sm text-slate-600">{formatMonthDay(artworkReadyDate)} · five business days before opening</p></div>
          </div>
          <div className="flex gap-3">
            <Truck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Production + shipping</p><p className="mt-1 text-sm text-slate-600">24-hour production and FREE next-day air are separate timelines.</p></div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Final check at checkout</p><p className="mt-1 text-sm text-slate-600">Use the displayed delivery estimate—not this planning checkpoint.</p></div>
          </div>
        </div>
      </section>

      <div className="brand-shell py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-14">
            <section>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A00]">Banner direction</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] text-[#0B1F3A]">Make the booth readable from the aisle.</h2>
              <p className="mt-5 text-lg leading-8 text-slate-700">{reviewed ? event.editorial.bannerAdvice : 'Start with a readable company name, a plain-language product category, and one useful reason for an attendee to stop. Keep detailed specifications, schedules, and QR instructions on smaller signs where visitors can read them comfortably.'}</p>
            </section>

            {reviewed && (
              <section className="border border-slate-200 bg-[#F7F7F7] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="h-6 w-6 text-emerald-700" aria-hidden="true" />
                  <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">Details verified with the organizer</h2>
                </div>
                <ul className="mt-5 space-y-3">
                  {event.editorial.verifiedFacts.map((fact) => <li key={fact} className="flex gap-3 text-slate-700"><Check className="mt-0.5 h-5 w-5 flex-none text-emerald-700" aria-hidden="true" />{fact}</li>)}
                </ul>
                <p className="mt-5 text-xs leading-5 text-slate-500">Last reviewed {event.editorial.reviewedAt}. Event details can change; the official organizer remains the source of truth.</p>
              </section>
            )}

            <section>
              <div className="flex items-center gap-3">
                <Ruler className="h-7 w-7 text-[#FF6A00]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A00]">Size ideas</p>
                  <h2 className="mt-1 font-display text-3xl font-bold tracking-[-0.03em] text-[#0B1F3A]">Three common starting points</h2>
                </div>
              </div>
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {bannerStartingPoints.map((item) => (
                  <article key={item.size} className="border-t-4 border-[#0B1F3A] bg-[#F7F7F7] p-5">
                    <p className="font-display text-3xl font-bold text-[#0B1F3A]">{item.size}</p>
                    <h3 className="mt-3 font-bold text-[#0B1F3A]">{item.use}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">These are planning examples, not event specifications. Confirm booth dimensions, permitted display height, mounting, and fire-code requirements in the exhibitor manual before ordering.</p>
            </section>

            <section>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A00]">Before artwork approval</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] text-[#0B1F3A]">Four checks that prevent show-floor surprises</h2>
              <ol className="mt-7 grid gap-px bg-slate-200 sm:grid-cols-2">
                {[
                  ['01', 'Booth dimensions', 'Measure the visible area after tables, displays, monitors, and neighboring booths are considered.'],
                  ['02', 'Hanging and fire rules', 'Confirm material, height, rigging, grommet, stand, and flame-resistance requirements with show management.'],
                  ['03', 'Shipping destination', 'Check advance-warehouse and direct-to-show dates. Do not assume the convention center accepts unattended packages.'],
                  ['04', 'Distance readability', 'Print a reduced proof, step back, and make sure the brand, category, and main message remain easy to scan.'],
                ].map(([number, title, text]) => (
                  <li key={number} className="bg-white p-6">
                    <span className="font-display text-sm font-bold text-[#FF6A00]">{number}</span>
                    <h3 className="mt-2 font-display text-xl font-bold text-[#0B1F3A]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border-t-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FF8A3D]">Build your banner</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em]">Ready for {event.shortName}?</h2>
              <p className="mt-4 leading-7 text-slate-300">Choose a size and finishing options, upload artwork, and review the live preview before adding it to your cart.</p>
              <Link to={designUrl} className="brand-button-primary mt-6 w-full gap-2 px-5" data-trade-show-cta>Start your banner<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
              <Link to="/trade-show-banners" className="mt-3 inline-flex w-full items-center justify-center border border-white/25 px-5 py-3 text-sm font-bold text-white hover:border-white">Compare trade show banners</Link>
              <p className="mt-5 border-t border-white/15 pt-5 text-xs leading-5 text-slate-400">Check the delivery estimate at checkout against your actual receiving plan. Banners On The Fly does not set organizer deadlines.</p>
            </div>
            <div className="border-x border-b border-slate-200 bg-[#F7F7F7] p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Event source</p>
              <p className="mt-2 font-bold text-[#0B1F3A]">{event.name}</p>
              <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Open official event site<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </aside>
        </div>
      </div>

      <section className="border-t border-slate-200 bg-[#F7F7F7] py-10">
        <div className="brand-shell flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="font-display text-2xl font-bold text-[#0B1F3A]">Planning another August show?</p><p className="mt-1 text-sm text-slate-600">Search the full calendar by state, city, event, or industry.</p></div>
          <Link to="/trade-shows" className="inline-flex items-center gap-2 font-bold text-[#18448D] hover:text-[#C94F00]">Back to all August trade shows<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>
    </Layout>
  );
};

export default TradeShowDetail;
