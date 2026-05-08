import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Clock, Truck, ShieldCheck, CheckCircle, ArrowRight, Upload } from 'lucide-react';
import Layout from '@/components/Layout';

type ProductType = 'banner' | 'yard_sign' | 'car_magnet';

const PRODUCTS: {
  key: ProductType;
  name: string;
  description: string;
  image: string;
  slug: string;
}[] = [
  {
    key: 'banner',
    name: 'Vinyl Banners',
    description: 'Durable campaign banners shipped fast nationwide.',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778177853/political_banners_cdgdgp.png',
    slug: 'banner',
  },
  {
    key: 'yard_sign',
    name: 'Yard Signs',
    description: 'Corrugated political yard signs printed within 24 hours.',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778177853/political_banners_cdgdgp.png',
    slug: 'yard-signs',
  },
  {
    key: 'car_magnet',
    name: 'Car Magnets',
    description: 'Removable campaign car magnets with vibrant full-color printing.',
    image: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1778177853/political_banners_cdgdgp.png',
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
    a: 'Every political signs order includes FREE next-day air shipping after production.',
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
  const [selectedProduct, setSelectedProduct] = useState<ProductType>('banner');

  const activeProduct = useMemo(
    () => PRODUCTS.find((p) => p.key === selectedProduct) ?? PRODUCTS[0],
    [selectedProduct]
  );

  const selectProduct = (product: ProductType) => {
    setSelectedProduct(product);
    setTimeout(() => {
      document.getElementById('product-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <Layout>
      <Helmet>
        <title>Political Campaign Signs & Banners | Banners On The Fly</title>
        <meta
          name="description"
          content="Custom political banners, yard signs, and car magnets printed within 24 hours with free next-day air shipping."
        />
      </Helmet>

      <section className="relative text-white overflow-hidden bg-[#0B1F3A]">
        <div
          className="absolute inset-0 bg-cover bg-center sm:bg-right"
          style={{
            backgroundImage:
              "url('https://res.cloudinary.com/dtrxl120u/image/upload/v1778177853/political_banners_cdgdgp.png')",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-[#0B1F3A]/75" aria-hidden="true" />
        <div className="relative z-[2] max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight text-white">
              Political Signs <span className="text-[#FF6A00]">Printed Within 24 Hours</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-white/90">
              Custom political banners, yard signs, and car magnets with free next-day air shipping.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => document.getElementById('choose-product')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold px-6 py-3.5 text-base shadow-lg transition"
              >
                Order Political Signs <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm font-medium">
              {[{ icon: Clock, text: 'Printed within 24 hours' }, { icon: Truck, text: 'FREE next-day air shipping' }].map(
                ({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-white/90">
                    <Icon className="h-4 w-4 flex-shrink-0 text-[#FF6A00]" />
                    <span>{text}</span>
                  </li>
                )
              )}
            </ul>
          </div>
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
                onClick={() => selectProduct(product.key)}
                className={`text-left rounded-2xl border-2 overflow-hidden transition shadow-sm hover:shadow-md min-h-[320px] ${
                  selectedProduct === product.key
                    ? 'border-[#FF6A00] ring-2 ring-[#FF6A00]/30'
                    : 'border-[#E5E5E5] hover:border-[#FF6A00]/60'
                }`}
              >
                <img src={product.image} alt={product.name} className="w-full h-44 object-cover" />
                <div className="p-5">
                  <h3 className="text-2xl font-bold text-[#0B1F3A]">{product.name}</h3>
                  <p className="mt-2 text-gray-600">{product.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="product-builder" className="bg-[#F7F7F7] py-14 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wide text-[#FF6A00]">Step 2 of 3</p>
            <h3 className="text-3xl font-extrabold text-[#0B1F3A] mt-1">Upload artwork for {activeProduct.name}</h3>
            <p className="mt-2 text-gray-600">Select options, upload your file, and move directly to checkout.</p>
            <button
              type="button"
              onClick={() => navigate(`/design?product=${activeProduct.slug}&theme=political`)}
              className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold px-8 py-4 text-lg"
            >
              <Upload className="h-5 w-5" /> Upload Artwork & Continue
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Clock, title: 'Printed within 24 hours' },
              { icon: Truck, title: 'FREE next-day air shipping' },
              { icon: ShieldCheck, title: 'Weather-resistant materials' },
              { icon: CheckCircle, title: 'Live design preview' },
            ].map(({ icon: Icon, title }) => (
              <div key={title} className="rounded-xl bg-[#F7F7F7] p-5 border border-[#E5E5E5]">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] mb-3">
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
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-[#E5E5E5] bg-[#F7F7F7] open:bg-white open:shadow-sm">
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
