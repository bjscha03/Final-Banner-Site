import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Clock, Truck, ShieldCheck, CheckCircle, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';
import ProductVisual from '@/components/product/ProductVisual';

type ProductType = 'banner' | 'yard_sign' | 'car_magnet';

const PRODUCTS: {
  key: ProductType;
  name: string;
  description: string;
  slug: string;
}[] = [
  {
    key: 'banner',
    name: 'Vinyl Banners',
    description: 'Durable campaign banners shipped fast nationwide.',
    slug: 'banner',
  },
  {
    key: 'yard_sign',
    name: 'Yard Signs',
    description: 'Corrugated political yard signs printed within 24 hours.',
    slug: 'yard-signs',
  },
  {
    key: 'car_magnet',
    name: 'Car Magnets',
    description: 'Removable campaign car magnets with vibrant full-color printing.',
    slug: 'car-magnets',
  },
];

const FAQS = [
  {
    q: 'How fast can you print political signs?',
    a: 'Most political sign orders are printed within 24 hours after artwork upload and order placement.',
  },
  {
    q: 'How fast is shipping?',
    a: 'Free next-day air describes carrier transit after production. Delivery dates are estimates and can change.',
  },
  {
    q: 'How do I upload artwork?',
    a: 'Choose your product, continue to the builder, upload your file, and finalize your order at checkout.',
  },
  {
    q: 'Are materials weather-resistant?',
    a: 'Yes. Our banners, yard signs, and car magnets are built with outdoor-ready, weather-resistant materials.',
  },
  {
    q: 'What order quantities are available?',
    a: 'You can configure quantity in the builder for each product type before adding your order to cart.',
  },
];

const PoliticalSigns: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <Helmet>
        <title>Political Campaign Signs & Banners | Banners On The Fly</title>
        <meta
          name="description"
          content="Configure political banners, yard signs, and car magnets online. Most standard orders are produced within 24 hours; carrier transit follows production."
        />
        <link rel="canonical" href="https://bannersonthefly.com/political-signs" />
      </Helmet>

      <section className="border-b-4 border-[#FF6A00] bg-[#0B1F3A] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#FF8A3D]">Campaign print essentials</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight text-white">
              Political signs, configured with confidence
            </h1>
            <p className="mt-5 text-lg md:text-xl text-white/90">
              Custom political banners, yard signs, and car magnets with production and carrier transit shown separately.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => document.getElementById('choose-product')?.scrollIntoView({ behavior: 'smooth' })}
                className="brand-button-on-dark"
              >
                Order Political Signs <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm font-medium">
              {[{ icon: Clock, text: 'Most standard orders: 24-hour production' }, { icon: Truck, text: 'Free next-day air after production' }].map(
                ({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-white/90">
                    <Icon className="h-4 w-4 flex-shrink-0 text-[#FF6A00]" />
                    <span>{text}</span>
                  </li>
                )
              )}
            </ul>
          </div>
          <ProductVisual productSlug="yard-signs" priority className="min-h-[330px] border border-white/20 sm:min-h-[410px]" />
        </div>
      </section>

      <section id="choose-product" className="bg-white py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] text-center mb-8">Choose Your Product</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRODUCTS.map((product) => (
              <button
                key={product.key}
                type="button"
                onClick={() => navigate(`/design?product=${product.slug}&theme=political`)}
                className="group overflow-hidden border border-slate-200 bg-white text-left transition-colors hover:border-[#FF6A00]"
              >
                <ProductVisual
                  productSlug={product.key === 'banner' ? 'vinyl-banners' : product.key === 'yard_sign' ? 'yard-signs' : 'car-magnets'}
                  presentation="selector"
                  className="aspect-video border-b border-slate-200"
                />
                <div className="p-5">
                  <h3 className="text-2xl font-bold text-[#0B1F3A]">{product.name}</h3>
                  <p className="mt-2 text-gray-600">{product.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Clock, title: 'Most standard orders: 24-hour production' },
              { icon: Truck, title: 'Free next-day air after production' },
              { icon: ShieldCheck, title: 'Weather-resistant materials' },
              { icon: CheckCircle, title: 'Live design preview' },
            ].map(({ icon: Icon, title }) => (
              <div key={title} className="border-t-2 border-[#FF6A00] bg-[#F7F7F7] p-5">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center text-[#FF6A00]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-[#0B1F3A]">{title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-[#0B1F3A] text-center">Political Campaign FAQ</h2>
          <div className="mt-8 border-t border-slate-200">
            {FAQS.map((f) => (
              <details key={f.q} className="group border-b border-slate-200">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-5 font-semibold text-[#0B1F3A]">
                  <span>{f.q}</span>
                  <span className="text-[#FF6A00] group-open:rotate-45 transition">+</span>
                </summary>
                <div className="px-5 pb-5 text-gray-700">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default PoliticalSigns;
