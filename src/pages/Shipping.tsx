import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Mail, PackageCheck, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import { SITE_URL } from '@/lib/seo/productLandingData';
import { SITE_POLICIES } from '@/lib/sitePolicies';

const shippingFaqs = [
  {
    question: 'How long does production take?',
    answer: SITE_POLICIES.production.detail,
  },
  {
    question: 'How does free next-day air work?',
    answer: SITE_POLICIES.shipping.detail,
  },
  {
    question: 'Is the delivery date guaranteed?',
    answer:
      'No. Delivery dates are estimates. Carrier delays, destination restrictions, weekends, holidays, quantity, file issues, and custom work can change the schedule.',
  },
  {
    question: 'What should I do if an order arrives damaged?',
    answer: SITE_POLICIES.returns.detail,
  },
] as const;

const shippingSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: shippingFaqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
};

const Shipping: React.FC = () => (
  <Layout showFooterBanner={false}>
    <SEO
      title="Production & Shipping Information | Banners On The Fly"
      description="Understand standard production time, free next-day air transit, delivery estimates, tracking, and damage reporting before ordering custom printed products."
      canonical={`${SITE_URL}/shipping`}
      ogImage="/images/og-vinyl-banners.png"
      ogImageAlt="Banners On The Fly production and shipping information"
      schema={shippingSchema}
    />

    <section className="border-b border-white/10 bg-[#0B1F3A] px-4 py-14 text-white sm:py-20">
      <div className="mx-auto max-w-4xl text-center">
        <Truck className="mx-auto h-9 w-9 text-[#FF8A3D]" aria-hidden="true" />
        <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Production and shipping information</h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-200">
          Production happens first. Carrier transit begins after the finished order ships. Review both parts of the timeline before choosing an event date.
        </p>
      </div>
    </section>

    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-5 md:grid-cols-2" aria-label="Production and transit timing">
        <article className="border-t-4 border-[#FF6A00] bg-white p-7">
          <Clock className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-bold text-[#0B1F3A]">1. Production time</h2>
          <p className="mt-3 leading-7 text-slate-600">{SITE_POLICIES.production.detail}</p>
        </article>
        <article className="border-t-4 border-[#FF6A00] bg-white p-7">
          <Truck className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-bold text-[#0B1F3A]">2. Carrier transit</h2>
          <p className="mt-3 leading-7 text-slate-600">{SITE_POLICIES.shipping.detail}</p>
        </article>
      </section>

      <section className="border-l-4 border-[#FF6A00] bg-[#FFF7F1] p-7" aria-labelledby="event-date-heading">
        <AlertTriangle className="h-7 w-7 text-amber-700" aria-hidden="true" />
        <h2 id="event-date-heading" className="mt-4 text-2xl font-black text-slate-950">Ordering for a fixed event date</h2>
        <p className="mt-3 leading-7 text-slate-700">
          Build in time for file corrections, production, carrier transit, and possible delays. A next-day air shipping method describes transit speed after shipment; it does not mean the product will arrive within 24 hours of checkout.
        </p>
      </section>

      <section className="border border-slate-200 bg-white p-7" aria-labelledby="tracking-heading">
        <PackageCheck className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
        <h2 id="tracking-heading" className="mt-4 text-2xl font-black text-slate-950">Tracking and delivery</h2>
        <ul className="mt-4 space-y-3 leading-7 text-slate-600">
          <li>Tracking information is sent after the order ships.</li>
          <li>Delivery estimates can change because of carrier, weather, destination, weekend, or holiday conditions.</li>
          <li>Confirm the complete delivery address before checkout. Address corrections can add time or carrier charges.</li>
          <li>{SITE_POLICIES.returns.detail}</li>
        </ul>
      </section>

      <section aria-labelledby="shipping-faq-heading">
        <h2 id="shipping-faq-heading" className="text-3xl font-black text-slate-950">Shipping FAQs</h2>
        <div className="mt-6 space-y-4">
          {shippingFaqs.map((faq) => (
            <details key={faq.question} className="border-b border-slate-200 bg-white py-5">
              <summary className="cursor-pointer font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                {faq.question}
              </summary>
              <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-l-4 border-[#FF6A00] bg-[#0B1F3A] p-8 text-center text-white sm:p-10">
        <Mail className="mx-auto h-7 w-7 text-orange-300" aria-hidden="true" />
        <h2 className="mt-3 text-3xl font-black">Need help planning an order?</h2>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-blue-100">
          Contact support before ordering if you have a fixed deadline, unusual quantity, or custom production requirement.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a className="brand-button-primary" href="mailto:support@bannersonthefly.com">
            Email support
          </a>
          <Link className="brand-button-on-dark" to="/faq">
            Review all FAQs
          </Link>
        </div>
      </section>
    </div>
  </Layout>
);

export default Shipping;
