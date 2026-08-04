import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Eye, MapPin, PackageCheck, Truck } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import Layout from '@/components/Layout';
import ProductBuyingGuide from '@/components/product/ProductBuyingGuide';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">Current starting price</p>
          <p className="font-black text-slate-950">{price}</p>
        </div>
        <Button asChild className="min-h-11 bg-orange-700 px-5 font-bold text-white hover:bg-orange-800">
          <Link to={href}>{label}</Link>
        </Button>
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
        preloadImage={product.heroImage}
        schema={schema}
      />

      <section ref={heroRef} className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pb-14 lg:px-8">
          <Breadcrumbs items={content.breadcrumbs} />
          <div className="grid items-center gap-8 pt-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-[#18448D] sm:text-sm">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Shipped to {city.city}, {city.state} — no local storefront claimed
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-4xl lg:text-6xl">
                {content.h1}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                {content.heroSubtitle} {product.productionSummary}
              </p>

              <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Current starting price</p>
                  <p className="mt-1 text-3xl font-black text-[#18448D]">{startingPrice}</p>
                </div>
                <p className="max-w-sm text-sm leading-6 text-slate-600">{product.minimumOrderLabel}. Price updates before checkout.</p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="min-h-12 bg-orange-700 px-6 font-bold text-white shadow-lg hover:bg-orange-800">
                  <Link to={content.configuratorUrl}>
                    {product.ctaLabel}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <a
                  href="#sizes-pricing"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-[#18448D] px-6 font-bold text-[#18448D] transition hover:bg-[#18448D] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                >
                  See sizes and pricing
                </a>
              </div>

              <ul className="mt-6 grid gap-2 text-sm text-slate-700 sm:grid-cols-3" aria-label="Order facts">
                <li className="flex items-center gap-2"><Eye className="h-5 w-5 flex-none text-[#18448D]" aria-hidden="true" />Live on-screen preview</li>
                <li className="flex items-center gap-2"><Clock3 className="h-5 w-5 flex-none text-[#18448D]" aria-hidden="true" />Most standard orders: 24-hour production</li>
                <li className="flex items-center gap-2"><Truck className="h-5 w-5 flex-none text-[#18448D]" aria-hidden="true" />Free next-day air after production</li>
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                <img
                  src={product.heroImage}
                  alt={product.heroImageAlt}
                  width={900}
                  height={675}
                  loading="eager"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Available online</p>
                  <p className="font-black text-slate-950">{product.plural}</p>
                </div>
                <PackageCheck className="h-8 w-8 text-emerald-600" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="grid gap-5 py-10 sm:grid-cols-3" aria-label="Fast answer facts">
          {[
            ['Price/minimum', product.minimumOrderLabel],
            ['Production', 'Most standard orders are produced within 24 hours; exceptions are disclosed before ordering.'],
            ['Shipping', 'Free next-day air is carrier transit after production; delivery estimates can change.'],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#18448D]">{label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
            </article>
          ))}
        </section>

        <ProductBuyingGuide product={product} includeFaq={false} />

        <section className="grid gap-8 border-y border-slate-200 py-12 lg:grid-cols-[0.9fr_1.1fr]" aria-labelledby="service-area-heading">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">Service-area information</p>
            <h2 id="service-area-heading" className="mt-2 text-3xl font-black text-slate-950">Shipping {product.lower} to {city.city}</h2>
          </div>
          <div>
            <p className="leading-7 text-slate-600">{content.introParagraph}</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Production and carrier transit are separate. Use the checkout address and current order options for the most relevant shipping information.
            </p>
          </div>
        </section>

        <section className="py-12" aria-labelledby="uses-heading">
          <h2 id="uses-heading" className="text-3xl font-black text-slate-950">Common uses for {product.lower}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {product.useCases.map((useCase) => (
              <li key={useCase} className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-700">
                <Check className="h-5 w-5 flex-none text-emerald-600" aria-hidden="true" />
                {useCase}
              </li>
            ))}
          </ul>
        </section>

        <section className="py-12" aria-labelledby="helpful-links-heading">
          <h2 id="helpful-links-heading" className="text-3xl font-black text-slate-950">Useful next steps</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.internalLinks.map((item) => (
              <Link key={`${item.to}-${item.label}`} to={item.to} className="group rounded-2xl border border-slate-200 p-5 transition hover:border-[#18448D] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                <h3 className="font-black text-slate-950 group-hover:text-[#18448D]">{item.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-8 py-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Other products shipped to {city.city}</h2>
            <div className="mt-5 space-y-3">
              {content.siblingProductLinks.map((item) => (
                <Link key={item.to} to={item.to} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 hover:border-[#18448D] hover:text-[#18448D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  {item.label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-950">Nearby service areas</h2>
            <div className="mt-5 space-y-3">
              {content.nearbyCityLinks.map((item) => (
                <Link key={item.to} to={item.to} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 hover:border-[#18448D] hover:text-[#18448D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  {item.label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12" aria-labelledby="city-faq-heading">
          <h2 id="city-faq-heading" className="text-3xl font-black text-slate-950 sm:text-4xl">{city.city} {product.singular} FAQs</h2>
          <div className="mt-7 space-y-4">
            {content.faqs.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-slate-200 bg-white p-5 open:border-[#18448D]">
                <summary className="cursor-pointer list-none pr-8 font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  {faq.question}
                </summary>
                <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-16 rounded-3xl bg-[#18448D] p-8 text-center text-white sm:p-12">
          <h2 className="text-3xl font-black sm:text-4xl">Start the correct {product.singular.toLowerCase()} order</h2>
          <p className="mx-auto mt-3 max-w-2xl text-blue-100">See the current price, upload artwork, and review the on-screen preview before checkout.</p>
          <Button asChild size="lg" className="mt-7 min-h-12 bg-orange-700 px-8 font-bold text-white hover:bg-orange-800">
            <Link to={content.configuratorUrl}>{product.ctaLabel}<ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></Link>
          </Button>
        </section>
      </div>

      <MobileStickyCta heroElement={heroElement} href={content.configuratorUrl} label={product.ctaLabel} price={startingPrice} />
    </Layout>
  );
};

export default CityProductPage;
