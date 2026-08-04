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

    <section className="border-b border-slate-200 bg-slate-950 px-4 py-14 text-white sm:py-20">
      <div className="mx-auto max-w-4xl text-center">
        <Truck className="mx-auto h-10 w-10 text-orange-400" aria-hidden="true" />
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">Production and shipping information</h1>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-200">
          Production happens first. Carrier transit begins after the finished order ships. Review both parts of the timeline before choosing an event date.
        </p>
      </div>
    </section>

    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-5 md:grid-cols-2" aria-label="Production and transit timing">
        <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <Clock className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-black text-slate-950">1. Production time</h2>
          <p className="mt-3 leading-7 text-slate-600">{SITE_POLICIES.production.detail}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <Truck className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-black text-slate-950">2. Carrier transit</h2>
          <p className="mt-3 leading-7 text-slate-600">{SITE_POLICIES.shipping.detail}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-7" aria-labelledby="event-date-heading">
        <AlertTriangle className="h-7 w-7 text-amber-700" aria-hidden="true" />
        <h2 id="event-date-heading" className="mt-4 text-2xl font-black text-slate-950">Ordering for a fixed event date</h2>
        <p className="mt-3 leading-7 text-slate-700">
          Build in time for file corrections, production, carrier transit, and possible delays. A next-day air shipping method describes transit speed after shipment; it does not mean the product will arrive within 24 hours of checkout.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-7" aria-labelledby="tracking-heading">
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
            <details key={faq.question} className="rounded-2xl border border-slate-200 bg-white p-5 open:border-[#18448D]">
              <summary className="cursor-pointer font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                {faq.question}
              </summary>
              <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-[#18448D] p-8 text-center text-white sm:p-10">
        <Mail className="mx-auto h-7 w-7 text-orange-300" aria-hidden="true" />
        <h2 className="mt-3 text-3xl font-black">Need help planning an order?</h2>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-blue-100">
          Contact support before ordering if you have a fixed deadline, unusual quantity, or custom production requirement.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a className="inline-flex min-h-12 items-center justify-center rounded-md bg-orange-700 px-6 font-bold text-white hover:bg-orange-800" href="mailto:support@bannersonthefly.com">
            Email support
          </a>
          <Link className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-white px-6 font-bold text-white hover:bg-white hover:text-[#18448D]" to="/faq">
            Review all FAQs
          </Link>
        </div>
      </section>
    </div>
  </Layout>
);

export default Shipping;
