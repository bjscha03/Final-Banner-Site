import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageSquareText,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Target,
  Truck,
  Users,
} from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import Layout from '@/components/Layout';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import SEO from '@/components/SEO';
import { getConfiguratorUrl } from '@/lib/configurator';
import { getTradeShowFaqs, getTradeShowPageContent } from '@/lib/tradeShows/tradeShowContent';
import { buildTradeShowDetailSchema } from '@/lib/tradeShows/tradeShowSchema';
import {
  TRADE_SHOWS,
  formatMonthDay,
  formatTradeShowDateRange,
  getArtworkReadyDate,
  getRelatedTradeShows,
  getTradeShowBySlug,
  getTradeShowPath,
  getTradeShowSeo,
  isIndexableTradeShow,
  type TradeShowIndustry,
} from '@/lib/tradeShows/tradeShows';
import NotFound from './NotFound';

const bannerStartingPoints = [
  { size: '6 × 2 ft', use: 'Table-front banner', note: 'A compact brand-and-category message for a standard six-foot table.' },
  { size: '8 × 3 ft', use: 'Back-wall banner', note: 'A wide aisle-facing format for a brand, category, and single proof point.' },
  { size: '8 × 8 ft', use: 'Booth backdrop', note: 'A high-impact field for photos, interviews, demonstrations, or a unified booth story.' },
];

const industryThemes: Record<TradeShowIndustry, { accent: string; label: string }> = {
  'Agriculture & Landscape': { accent: '#91D36E', label: 'FIELD + GROWTH' },
  'Business & Professional': { accent: '#78B9FF', label: 'BUSINESS + CONNECTION' },
  'Construction & Infrastructure': { accent: '#FFC857', label: 'BUILD + DELIVER' },
  'Education & Research': { accent: '#A8A4FF', label: 'LEARN + DISCOVER' },
  'Energy & Utilities': { accent: '#65D6C4', label: 'POWER + INFRASTRUCTURE' },
  'Entertainment & Culture': { accent: '#FF83B6', label: 'CREATE + EXPERIENCE' },
  'Fashion & Retail': { accent: '#FF9C7A', label: 'BRAND + BUYING' },
  'Food & Hospitality': { accent: '#F8C15C', label: 'TASTE + OPERATE' },
  'Healthcare & Wellness': { accent: '#7ED8DE', label: 'CARE + PRACTICE' },
  'Manufacturing & Technology': { accent: '#7FB5FF', label: 'MAKE + INNOVATE' },
  'Pets & Veterinary': { accent: '#E2A4FF', label: 'CARE + RETAIL' },
  'Public Safety & Government': { accent: '#FFB06A', label: 'MISSION + READINESS' },
  Cannabis: { accent: '#85CF91', label: 'OPERATE + GROW' },
};

function formatReviewedDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

const TradeShowDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const event = getTradeShowBySlug(slug);
  if (!event) return <NotFound />;

  const indexable = isIndexableTradeShow(event);
  const content = getTradeShowPageContent(event);
  const faqs = getTradeShowFaqs(event);
  const relatedEvents = getRelatedTradeShows(event);
  const path = getTradeShowPath(event);
  const seo = getTradeShowSeo(event);
  const designUrl = getConfiguratorUrl('vinyl-banners', path, 'trade-show');
  const artworkReadyDate = getArtworkReadyDate(event.startDate);
  const theme = industryThemes[event.industry];
  const eventNumber = String(TRADE_SHOWS.findIndex((item) => item.slug === event.slug) + 1).padStart(2, '0');

  return (
    <Layout>
      <SEO
        title={seo.title}
        description={seo.description}
        canonical={`https://bannersonthefly.com${path}`}
        noindex={!indexable}
        schema={buildTradeShowDetailSchema(event, seo.description)}
        ogImageAlt={`${event.name} 2026 exhibitor banner guide`}
      />

      <section className="relative overflow-hidden bg-[#07182E] text-white">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] border-l border-white/10 lg:block" aria-hidden="true">
          <div className="absolute inset-x-0 top-0 h-3" style={{ backgroundColor: theme.accent }} />
          <div className="absolute -right-5 top-14 font-display text-[15rem] font-black leading-none text-white/[0.035]">{eventNumber}</div>
          <div className="absolute bottom-0 right-0 h-40 w-40 border-l border-t border-white/10" />
        </div>
        <div className="brand-shell relative py-9 sm:py-12 lg:py-16">
          <Breadcrumbs
            items={[{ name: 'Home', url: '/' }, { name: 'Trade Shows', url: '/trade-shows' }, { name: event.shortName, url: path }]}
            className="mb-8 [&_span]:text-slate-300 [&_a]:text-slate-300 [&_a:hover]:text-white [&_svg]:text-slate-500"
          />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#07182E]" style={{ backgroundColor: theme.accent }}>2026 exhibitor field guide</span>
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{theme.label}</span>
                {content.organizerVerified && (
                  <span className="inline-flex items-center gap-1.5 border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-1 text-xs font-bold text-emerald-200">
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />Organizer details reviewed
                  </span>
                )}
              </div>
              <h1 className="mt-5 max-w-5xl font-display text-4xl font-bold leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-[4.25rem]">{event.name}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{content.summary}</p>
              <HeroDeliveryStatus className="mt-7 w-full max-w-[570px]" />
            </div>

            <div className="relative bg-white p-6 text-[#0B1F3A] shadow-[12px_12px_0_rgba(255,255,255,0.08)] sm:p-7">
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: theme.accent }} aria-hidden="true" />
              <dl className="space-y-5 text-sm">
                <div>
                  <dt className="flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500"><CalendarDays className="h-4 w-4 text-[#FF6A00]" aria-hidden="true" />Show dates</dt>
                  <dd className="mt-1.5 font-display text-xl font-bold">{formatTradeShowDateRange(event)}</dd>
                </div>
                <div className="border-t border-slate-200 pt-5">
                  <dt className="flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-slate-500"><MapPin className="h-4 w-4 text-[#FF6A00]" aria-hidden="true" />Show location</dt>
                  <dd className="mt-1.5 font-display text-xl font-bold">{event.city}, {event.state}</dd>
                  <dd className="mt-1 text-slate-600">{content.venue || 'Confirm venue on the official event site'}</dd>
                </div>
              </dl>
              <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Check current organizer details<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="On this event guide" className="border-b border-slate-200 bg-white">
        <div className="brand-shell flex gap-6 overflow-x-auto py-4 text-sm font-bold text-[#18448D] sm:gap-9">
          <a href="#show-strategy" className="whitespace-nowrap hover:text-[#C94F00]">Show strategy</a>
          <a href="#banner-plan" className="whitespace-nowrap hover:text-[#C94F00]">Banner plan</a>
          <a href="#production-plan" className="whitespace-nowrap hover:text-[#C94F00]">Production plan</a>
          <a href="#event-faq" className="whitespace-nowrap hover:text-[#C94F00]">Event FAQ</a>
        </div>
      </nav>

      <section className="border-b border-slate-200 bg-[#F4F6F8]">
        <div className="brand-shell grid gap-px bg-slate-200 md:grid-cols-3">
          <div className="flex gap-3 bg-[#F4F6F8] py-6 pr-5 md:px-5 md:first:pl-0">
            <CalendarCheck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Planning checkpoint</p><p className="mt-1 text-sm leading-6 text-slate-600">Aim for artwork ready by {formatMonthDay(artworkReadyDate)}—five business days before opening.</p></div>
          </div>
          <div className="flex gap-3 bg-[#F4F6F8] py-6 pr-5 md:px-5">
            <Truck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Fast fulfillment</p><p className="mt-1 text-sm leading-6 text-slate-600"><strong>24-hour production</strong> and <strong>FREE next-day air</strong> are separate timelines.</p></div>
          </div>
          <div className="flex gap-3 bg-[#F4F6F8] py-6 md:pl-5">
            <ShieldCheck className="mt-0.5 h-6 w-6 flex-none text-[#FF6A00]" aria-hidden="true" />
            <div><p className="font-bold text-[#0B1F3A]">Use the live estimate</p><p className="mt-1 text-sm leading-6 text-slate-600">Match checkout delivery timing to your hotel, warehouse, or show receiving plan.</p></div>
          </div>
        </div>
      </section>

      <div className="brand-shell py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_350px]">
          <main className="min-w-0 space-y-16">
            <section id="show-strategy" className="scroll-mt-28">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94F00]">01 / Show strategy</p>
              <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">Understand the room before designing the banner.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">A useful trade-show banner is not a miniature brochure. It is a fast filter: the right attendees should recognize the category, understand the relevance, and know why to step into the booth.</p>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <article className="relative overflow-hidden border border-slate-200 bg-[#0B1F3A] p-7 text-white">
                  <div className="absolute right-0 top-0 h-2 w-24" style={{ backgroundColor: theme.accent }} aria-hidden="true" />
                  <Users className="h-7 w-7" style={{ color: theme.accent }} aria-hidden="true" />
                  <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Likely audience</p>
                  <p className="mt-2 text-lg font-semibold leading-8">{content.audience}</p>
                </article>
                <article className="border border-slate-200 bg-[#F4F6F8] p-7">
                  <Target className="h-7 w-7 text-[#FF6A00]" aria-hidden="true" />
                  <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Show focus</p>
                  <p className="mt-2 text-lg font-semibold leading-8 text-[#0B1F3A]">{content.showFocus}</p>
                </article>
              </div>

              <div className="mt-6 border-l-4 border-[#FF6A00] bg-[#FFF7F1] px-6 py-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#C94F00]">Three ideas worth making obvious</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {content.focusAreas.map((item, index) => <p key={item} className="border-t border-[#FF6A00]/25 pt-3 text-sm font-bold leading-6 text-[#0B1F3A]"><span className="mr-2 text-[#C94F00]">0{index + 1}</span>{item}</p>)}
                </div>
              </div>
            </section>

            <section id="banner-plan" className="scroll-mt-28">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94F00]">02 / Banner plan</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">A show-specific direction for the main graphic.</h2>
              <p className="mt-6 border-y border-slate-200 py-7 font-display text-2xl font-semibold leading-9 text-[#0B1F3A]">{content.bannerAdvice}</p>

              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {content.bannerGoals.map((goal, index) => (
                  <article key={goal} className="relative min-h-[190px] border border-slate-200 bg-white p-6 shadow-[5px_5px_0_#E7EBEF]">
                    <span className="font-display text-4xl font-black text-slate-200">0{index + 1}</span>
                    <p className="mt-5 text-sm font-semibold leading-6 text-slate-700">{goal}</p>
                  </article>
                ))}
              </div>

              <div className="mt-12 bg-[#07182E] p-7 text-white sm:p-9">
                <div className="flex items-center gap-3">
                  <MessageSquareText className="h-7 w-7" style={{ color: theme.accent }} aria-hidden="true" />
                  <div><p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: theme.accent }}>Message stack</p><h3 className="mt-1 font-display text-2xl font-bold">Build the banner in this order</h3></div>
                </div>
                <ol className="mt-7 grid gap-px bg-white/15 sm:grid-cols-2">
                  {content.messagePlan.map((step, index) => (
                    <li key={step.label} className="bg-[#07182E] p-5 sm:p-6">
                      <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center text-xs font-black text-[#07182E]" style={{ backgroundColor: theme.accent }}>{index + 1}</span><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{step.label}</p></div>
                      <p className="mt-4 font-display text-xl font-bold leading-7">{step.value}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{step.note}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3">
                <Ruler className="h-7 w-7 text-[#FF6A00]" aria-hidden="true" />
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#C94F00]">Size ideas</p><h2 className="mt-1 font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A]">Three practical starting formats</h2></div>
              </div>
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {bannerStartingPoints.map((item) => (
                  <article key={item.size} className="border-t-4 bg-[#F4F6F8] p-6" style={{ borderTopColor: theme.accent }}>
                    <p className="font-display text-3xl font-black text-[#0B1F3A]">{item.size}</p>
                    <h3 className="mt-3 font-bold text-[#0B1F3A]">{item.use}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">These are planning examples, not event specifications. Confirm booth dimensions, permitted display height, mounting, and fire-code requirements in the exhibitor manual before ordering.</p>
            </section>

            <section id="production-plan" className="scroll-mt-28">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94F00]">03 / Production plan</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">Make the receiving plan before the banner ships.</h2>
              <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                <div className="border border-slate-200 p-6 sm:p-7">
                  <PackageCheck className="h-8 w-8 text-[#FF6A00]" aria-hidden="true" />
                  <h3 className="mt-5 font-display text-2xl font-bold text-[#0B1F3A]">Installation note for this show type</h3>
                  <p className="mt-3 leading-7 text-slate-700">{content.installPlan}</p>
                </div>
                <ol className="divide-y divide-slate-200 border border-slate-200 bg-[#F4F6F8]">
                  {[
                    'Confirm the usable booth width and display-height limit.',
                    'Choose hotel, advance warehouse, venue, or personal delivery.',
                    'Verify the named recipient, labeling format, and receiving hours.',
                    'Compare the live checkout estimate with the actual handoff date.',
                  ].map((item, index) => <li key={item} className="flex gap-3 p-4 text-sm font-semibold leading-6 text-[#0B1F3A]"><span className="font-display font-black text-[#C94F00]">0{index + 1}</span>{item}</li>)}
                </ol>
              </div>
            </section>

            <section className="border border-slate-200 bg-[#F4F6F8] p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                {content.organizerVerified ? <BadgeCheck className="h-6 w-6 text-emerald-700" aria-hidden="true" /> : <CheckCircle2 className="h-6 w-6 text-[#18448D]" aria-hidden="true" />}
                <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">Event source notes</h2>
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Content reviewed {formatReviewedDate(content.contentReviewedAt)}</span>
              </div>
              <ul className="mt-5 space-y-3">
                {content.sourceNotes.map((fact) => <li key={fact} className="flex gap-3 text-sm leading-6 text-slate-700"><Check className="mt-0.5 h-5 w-5 flex-none text-emerald-700" aria-hidden="true" />{fact}</li>)}
              </ul>
              <a href={content.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Verify details with the official organizer<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
            </section>

            <section id="event-faq" className="scroll-mt-28">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94F00]">04 / Quick answers</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">{event.shortName} exhibitor FAQ</h2>
              <div className="mt-7 divide-y divide-slate-200 border-y border-slate-200">
                {faqs.map((faq, index) => (
                  <details key={faq.question} className="group py-5" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-display text-lg font-bold text-[#0B1F3A] marker:content-none">
                      {faq.question}<span className="flex h-8 w-8 flex-none items-center justify-center border border-slate-300 text-[#C94F00] transition group-open:rotate-45" aria-hidden="true">+</span>
                    </summary>
                    <p className="mt-4 max-w-3xl pr-12 leading-7 text-slate-700">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#C94F00]">Keep planning</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-[#0B1F3A]">Related 2026 exhibitor guides</h2></div>
                <Link to="/trade-shows" className="inline-flex items-center gap-2 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Browse all 75 shows<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {relatedEvents.map((related) => (
                  <article key={related.slug} className="flex min-h-[190px] flex-col border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[5px_5px_0_#E7EBEF]">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{related.industry}</p>
                    <h3 className="mt-3 font-display text-lg font-bold leading-6 text-[#0B1F3A]"><Link to={getTradeShowPath(related)} className="hover:text-[#C94F00]">{related.name}</Link></h3>
                    <p className="mt-3 text-sm text-slate-600">{formatTradeShowDateRange(related)} · {related.city}, {related.state}</p>
                    <Link to={getTradeShowPath(related)} className="mt-auto pt-5 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Open exhibitor guide →</Link>
                  </article>
                ))}
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border-t-4 bg-[#0B1F3A] p-7 text-white" style={{ borderTopColor: theme.accent }}>
              <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: theme.accent }}>Build your show banner</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em]">Ready for {event.shortName}?</h2>
              <p className="mt-4 leading-7 text-slate-300">Choose a size and finishing options, upload artwork, and review the live preview before adding it to your cart.</p>
              <div className="mt-5 space-y-2 border-y border-white/15 py-5 text-sm">
                <p className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: theme.accent }} aria-hidden="true" />24-hour production</p>
                <p className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: theme.accent }} aria-hidden="true" />FREE next-day air</p>
                <p className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none" style={{ color: theme.accent }} aria-hidden="true" />Custom sizing + live preview</p>
              </div>
              <Link to={designUrl} className="brand-button-primary mt-6 w-full gap-2 px-5" data-trade-show-cta>Start your banner<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
              <Link to="/trade-show-banners" className="mt-3 inline-flex w-full items-center justify-center border border-white/25 px-5 py-3 text-sm font-bold text-white hover:border-white">Compare trade show banners</Link>
              <p className="mt-5 text-xs leading-5 text-slate-400">Use the delivery estimate shown at checkout. Banners On The Fly does not set event or warehouse deadlines.</p>
            </div>

            <div className="border-x border-b border-slate-200 bg-[#F4F6F8] p-6">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Independent resource</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Banners On The Fly is not affiliated with, endorsed by, or an official supplier of {event.name} or its organizer.</p>
              <a href={event.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#18448D] hover:text-[#C94F00]">Open official event site<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
            </div>
          </aside>
        </div>
      </div>

      <section className="border-t border-slate-200 bg-[#F4F6F8] py-8">
        <div className="brand-shell text-xs leading-5 text-slate-500">
          <strong className="text-slate-600">Trademark and affiliation notice:</strong> Event names and trademarks belong to their respective owners. This page is an independent exhibitor-planning and banner-printing resource; it is not an official event page, sponsorship, endorsement, or statement of supplier status.
        </div>
      </section>
    </Layout>
  );
};

export default TradeShowDetail;
