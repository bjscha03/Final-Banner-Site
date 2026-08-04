import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, Clock3, Eye, MapPin, Truck } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import Layout from '@/components/Layout';
import ProductBuyingGuide from '@/components/product/ProductBuyingGuide';
import ProductVisual from '@/components/product/ProductVisual';
import SEO from '@/components/SEO';
import { buildLocalPageSchema } from '@/lib/seo/localPageSchema';
import {
  buildCityProductPageContent,
  getCityBySlug,
  getProduct,
  type CityProductSlug,
} from '@/lib/seo/cityData';
import { formatMoney } from '@/lib/seo/productLandingData';
import NotFound from '@/pages/NotFound';

interface CityProductPageProps {
  productSlug: CityProductSlug;
}

interface MobileStickyCtaProps {
  heroElement: HTMLElement | null;
  href: string;
  label: string;
  price: string;
}

const MobileStickyCta: React.FC<MobileStickyCtaProps> = ({ heroElement, href, label, price }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!heroElement || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0.05 });
    observer.observe(heroElement);
    return () => observer.disconnect();
  }, [heroElement]);

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-[0_-8px_24px_rgba(11,31,58,0.12)] md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">Starting at</p>
          <p className="font-display text-lg font-bold text-[#0B1F3A]">{price}</p>
        </div>
        <Link to={href} className="brand-button-primary min-h-11 px-5 text-sm">{label}</Link>
      </div>
    </div>
  );
};

const CityProductPage: React.FC<CityProductPageProps> = ({ productSlug }) => {
  const { citySlug } = useParams<{ citySlug: string }>();
  const city = getCityBySlug(citySlug);
  const product = getProduct(productSlug);
  const heroRef = useRef<HTMLElement>(null);
  const [heroElement, setHeroElement] = useState<HTMLElement | null>(null);

  useEffect(() => setHeroElement(heroRef.current), []);

  if (!city || !product) return <NotFound />;

  const content = buildCityProductPageContent(productSlug, city);
  const schema = buildLocalPageSchema(productSlug, city, content);
  const startingPrice = formatMoney(product.startingPriceCents);
  const hasLocalLinks = content.siblingProductLinks.length > 0 || content.nearbyCityLinks.length > 0;

  return (
    <Layout showFooterBanner={false}>
      <SEO
        title={content.metaTitle}
        description={content.metaDescription}
        canonical={content.canonicalUrl}
        ogImage={product.socialImage}
        ogImageAlt={product.heroImageAlt}
        ogType="product"
        noindex={!content.indexable}
        nofollow={false}
        schema={schema}
      />

      <div className="border-b border-slate-200 bg-white">
        <div className="brand-shell py-3"><Breadcrumbs items={content.breadcrumbs} /></div>
      </div>

      <section ref={heroRef} className="relative overflow-hidden bg-[#0B1F3A] text-white">
        <div className="absolute inset-y-0 right-0 hidden w-[43%] border-l border-white/10 bg-[#102A4C] lg:block" aria-hidden="true" />
        <div className="brand-shell relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:py-20">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#FF8A3D] sm:text-sm">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Online ordering · Shipping to {city.city}, {city.state}
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{content.h1}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{content.heroSubtitle} {product.productionSummary}</p>

            <div className="mt-7 flex flex-wrap items-end gap-x-6 gap-y-3 border-l-4 border-[#FF6A00] pl-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Starting price</p>
                <p className="mt-1 font-display text-4xl font-bold">{startingPrice}</p>
              </div>
              <p className="max-w-sm pb-1 text-sm leading-6 text-slate-300">{product.minimumOrderLabel}. Your total updates before checkout.</p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={content.configuratorUrl} className="brand-button-primary gap-2 px-7">
                {product.ctaLabel}<ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <a href="#sizes-pricing" className="brand-button-on-dark px-7">See sizes and pricing</a>
            </div>

            <ul className="mt-8 grid gap-3 border-t border-white/15 pt-6 text-sm text-slate-200 sm:grid-cols-3" aria-label="Order facts">
              <li className="flex items-center gap-2"><Eye className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Live print preview</li>
              <li className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Most standard orders: 24-hour production</li>
              <li className="flex items-center gap-2"><Truck className="h-5 w-5 text-[#FF8A3D]" aria-hidden="true" />Free next-day air after production</li>
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -left-3 top-8 h-[80%] w-1 bg-[#FF6A00]" aria-hidden="true" />
            <ProductVisual productSlug={productSlug} priority className="aspect-[4/3] border border-white/15 bg-white" />
            <div className="border-x border-b border-white/15 bg-white px-5 py-4 text-[#0B1F3A]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Delivered product</p>
              <p className="mt-1 font-display text-lg font-bold">Configured online · Shipped nationwide</p>
            </div>
          </div>
        </div>
      </section>

      <div className="brand-shell">
        <section className="grid border-b border-slate-200 sm:grid-cols-3" aria-label="Fast answer facts">
          {[
            ['Price & minimum', product.minimumOrderLabel],
            ['Production', 'Most standard orders are produced within 24 hours; exceptions are disclosed before ordering.'],
            ['Shipping', 'Free next-day air is carrier transit after production; delivery dates are estimates.'],
          ].map(([label, value], index) => (
            <article key={label} className={`py-6 sm:px-6 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : 'sm:pr-6'}`}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D95700]">{label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
            </article>
          ))}
        </section>

        <ProductBuyingGuide product={product} includeFaq={false} />

        <section className="my-10 grid border-y border-slate-200 bg-[#F7F7F7] lg:grid-cols-[0.72fr_1.28fr]" aria-labelledby="service-area-heading">
          <div className="border-b border-slate-200 p-7 lg:border-b-0 lg:border-r lg:p-10">
            <p className="brand-eyebrow">Nationwide fulfillment</p>
            <h2 id="service-area-heading" className="mt-3 font-display text-3xl font-bold leading-tight text-[#0B1F3A]">Shipping {product.lower} to {city.city}.</h2>
          </div>
          <div className="p-7 lg:p-10">
            <p className="leading-7 text-slate-600">{content.introParagraph}</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">Production and carrier transit are separate. Use the checkout address and current order options for the most relevant shipping information.</p>
          </div>
        </section>

        <section className="py-12" aria-labelledby="uses-heading">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
            <div>
              <p className="brand-eyebrow">Common applications</p>
              <h2 id="uses-heading" className="brand-title mt-3">Ways customers use {product.lower}.</h2>
            </div>
            <ol className="grid border-t border-slate-200 sm:grid-cols-2">
              {product.useCases.map((useCase, index) => (
                <li key={useCase} className={`flex gap-4 border-b border-slate-200 py-5 ${index % 2 === 0 ? 'sm:pr-6' : 'sm:border-l sm:pl-6'}`}>
                  <span className="font-display font-bold text-[#FF6A00]">0{index + 1}</span>
                  <span className="font-semibold leading-6 text-[#0B1F3A]">{useCase}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-12" aria-labelledby="helpful-links-heading">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
            <div>
              <p className="brand-eyebrow">Continue with confidence</p>
              <h2 id="helpful-links-heading" className="brand-title mt-3">Useful next steps.</h2>
            </div>
            <div className="border-t border-slate-200">
              {content.internalLinks.map((item) => (
                <Link key={`${item.to}-${item.label}`} to={item.to} className="group grid gap-2 border-b border-slate-200 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] sm:grid-cols-[0.7fr_1.3fr_auto] sm:items-center sm:gap-6">
                  <h3 className="font-display font-bold text-[#0B1F3A] group-hover:text-[#D95700]">{item.label}</h3>
                  <p className="text-sm leading-6 text-slate-600">{item.description}</p>
                  <ArrowRight className="hidden h-4 w-4 text-[#FF6A00] sm:block" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {hasLocalLinks && (
          <section className="grid gap-10 border-y border-slate-200 py-10 lg:grid-cols-2">
            {content.siblingProductLinks.length > 0 && (
              <div>
                <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">Other products shipped to {city.city}</h2>
                <div className="mt-5 border-t border-slate-200">
                  {content.siblingProductLinks.map((item) => (
                    <Link key={item.to} to={item.to} className="flex min-h-12 items-center justify-between border-b border-slate-200 py-3 font-semibold text-slate-700 hover:text-[#D95700]">{item.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                  ))}
                </div>
              </div>
            )}
            {content.nearbyCityLinks.length > 0 && (
              <div>
                <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">Nearby service areas</h2>
                <div className="mt-5 border-t border-slate-200">
                  {content.nearbyCityLinks.map((item) => (
                    <Link key={item.to} to={item.to} className="flex min-h-12 items-center justify-between border-b border-slate-200 py-3 font-semibold text-slate-700 hover:text-[#D95700]">{item.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="py-14 sm:py-16" aria-labelledby="city-faq-heading">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
            <div>
              <p className="brand-eyebrow">Questions before ordering</p>
              <h2 id="city-faq-heading" className="brand-title mt-3">{city.city} {product.singular} FAQs.</h2>
            </div>
            <div className="border-t border-slate-200">
              {content.faqs.map((faq) => (
                <details key={faq.question} className="group border-b border-slate-200 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-[#0B1F3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]">
                    {faq.question}<ChevronDown className="h-5 w-5 flex-none transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="max-w-3xl pt-4 leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-16 border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-7 text-white sm:p-10 lg:p-12">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">Ready to configure</p>
              <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Start the right {product.singular.toLowerCase()} order.</h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">See the current price, upload artwork, and review the on-screen preview before checkout.</p>
            </div>
            <Link to={content.configuratorUrl} className="brand-button-primary flex-none gap-2 px-8">{product.ctaLabel}<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      <MobileStickyCta heroElement={heroElement} href={content.configuratorUrl} label={product.ctaLabel} price={startingPrice} />
    </Layout>
  );
};

export default CityProductPage;
