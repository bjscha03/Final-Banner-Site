import React from 'react';
import { ArrowRight, Eye, FileCheck2, PackageCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import SEO from '@/components/SEO';

const principles = [
  {
    icon: PackageCheck,
    title: 'Product facts first',
    copy: 'Supported sizes, materials, add-ons, minimums, price examples, and product limitations are available before checkout.',
  },
  {
    icon: Eye,
    title: 'Artwork stays visible',
    copy: 'The on-screen preview helps customers review dimensions, placement, cropping, and the configured product before submitting an order.',
  },
  {
    icon: Truck,
    title: 'Timing explained clearly',
    copy: 'Production and carrier transit are treated as two separate parts of the schedule so customers can plan around realistic delivery estimates.',
  },
  {
    icon: FileCheck2,
    title: 'Support for the exceptions',
    copy: 'Custom sizes, unusual quantities, complex finishing, and fixed deadlines can be reviewed through the quote and support process.',
  },
];

const About: React.FC = () => (
  <Layout showFooterBanner={false}>
    <SEO
      title="About Banners On The Fly | Online Custom Printing"
      description="Learn how Banners On The Fly approaches custom banners, yard signs, car magnets, artwork review, pricing clarity, production, and nationwide shipping."
      canonical="https://bannersonthefly.com/about"
    />
    <PageHeader
      title="About Banners On The Fly"
      subtitle="An online custom-printing experience designed to make product choices, artwork review, pricing, and fulfillment easier to understand."
      centered={false}
    />

    <section className="brand-section bg-white">
      <div className="brand-shell grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
        <div>
          <p className="brand-eyebrow">What we are building</p>
          <h2 className="brand-title mt-3">Professional print ordering without the guesswork.</h2>
        </div>
        <div className="space-y-5 text-lg leading-8 text-slate-600">
          <p>Banners On The Fly sells custom vinyl banners, yard signs, and car magnets through an online ordering system built around clear product specifications and a live print preview.</p>
          <p>Most standard orders are produced within 24 hours. Carrier transit begins after production, and free next-day air describes that transit step—not the full time from checkout to delivery.</p>
          <p>When a project falls outside the supported online configurations, customers can request a custom quote instead of forcing the job through the wrong product setup.</p>
        </div>
      </div>
    </section>

    <section className="brand-section border-y border-slate-200 bg-[#F7F7F7]" aria-labelledby="principles-heading">
      <div className="brand-shell">
        <div className="max-w-3xl">
          <p className="brand-eyebrow">How we approach the experience</p>
          <h2 id="principles-heading" className="brand-title mt-3">Four principles behind every product page.</h2>
        </div>
        <div className="mt-10 grid border-t border-slate-300 md:grid-cols-2">
          {principles.map((principle, index) => {
            const Icon = principle.icon;
            return (
              <article key={principle.title} className={`border-b border-slate-300 py-7 md:px-8 ${index % 2 === 0 ? 'md:pl-0' : 'md:border-l'}`}>
                <Icon className="h-6 w-6 text-[#FF6A00]" aria-hidden="true" />
                <h3 className="mt-4 font-display text-xl font-bold text-[#0B1F3A]">{principle.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{principle.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section className="brand-section bg-white" aria-labelledby="order-process-heading">
      <div className="brand-shell grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
        <div>
          <p className="brand-eyebrow">From screen to shipment</p>
          <h2 id="order-process-heading" className="brand-title mt-3">A visible, four-step process.</h2>
        </div>
        <ol className="border-t border-slate-200">
          {[
            ['01', 'Choose the product', 'Compare current sizes, materials, quantities, and finishing options.'],
            ['02', 'Add the artwork', 'Upload a supported file and review the configured print preview.'],
            ['03', 'Confirm the order', 'Check the current total, shipping address, and order details before payment.'],
            ['04', 'Production and transit', 'The order is produced first; tracking follows when carrier transit begins.'],
          ].map(([number, title, description]) => (
            <li key={number} className="grid gap-2 border-b border-slate-200 py-5 sm:grid-cols-[56px_0.6fr_1.4fr] sm:items-start sm:gap-5">
              <span className="font-display font-bold text-[#FF6A00]">{number}</span>
              <h3 className="font-display font-bold text-[#0B1F3A]">{title}</h3>
              <p className="text-sm leading-6 text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section className="border-l-4 border-[#FF6A00] bg-[#0B1F3A] text-white">
      <div className="brand-shell flex flex-col justify-between gap-7 py-10 lg:flex-row lg:items-center">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em]">Ready to see the products?</h2>
          <p className="mt-3 max-w-2xl text-slate-300">Compare the supported options and current pricing before opening the design tool.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/vinyl-banners" className="brand-button-primary gap-2">Browse product guides <ArrowRight className="h-5 w-5" /></Link>
          <Link to="/contact" className="brand-button-on-dark">Contact support</Link>
        </div>
      </div>
    </section>
  </Layout>
);

export default About;
