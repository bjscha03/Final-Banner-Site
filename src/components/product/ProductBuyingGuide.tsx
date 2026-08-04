import React from 'react';
import { Check, FileCheck2, Info, PackageCheck, ShieldCheck } from 'lucide-react';
import { formatMoney, type ProductLandingDefinition } from '@/lib/seo/productLandingData';
import { SITE_POLICIES } from '@/lib/sitePolicies';

interface ProductBuyingGuideProps {
  product: ProductLandingDefinition;
  includeFaq?: boolean;
  faqHeading?: string;
}

const ProductBuyingGuide: React.FC<ProductBuyingGuideProps> = ({
  product,
  includeFaq = true,
  faqHeading = `${product.singular} FAQs`,
}) => (
  <>
    <section id="sizes-pricing" className="scroll-mt-24 py-12 sm:py-16" aria-labelledby="sizes-pricing-heading">
      <div className="mb-7 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">Current buying information</p>
        <h2 id="sizes-pricing-heading" className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
          Sizes and price examples
        </h2>
        <p className="mt-3 text-base leading-7 text-slate-600">
          These examples come from the same current product data used by the configurator. Prices are shown before tax and update when options or quantity change.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Current {product.lower} price examples</caption>
            <thead className="bg-slate-950 text-white">
              <tr>
                <th scope="col" className="px-5 py-4 text-sm font-semibold">Example</th>
                <th scope="col" className="px-5 py-4 text-sm font-semibold">Configuration</th>
                <th scope="col" className="px-5 py-4 text-sm font-semibold">Current price</th>
                <th scope="col" className="px-5 py-4 text-sm font-semibold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {product.priceExamples.map((example) => (
                <tr key={`${example.label}-${example.configuration}`} className="align-top">
                  <th scope="row" className="px-5 py-4 font-semibold text-slate-900">{example.label}</th>
                  <td className="px-5 py-4 text-slate-600">{example.configuration}</td>
                  <td className="px-5 py-4 font-black text-[#18448D]">{formatMoney(example.totalCents)}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{example.note || 'Before tax'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section className="grid gap-6 py-8 lg:grid-cols-3" aria-label={`${product.plural} specifications`}>
      {[
        { title: 'Available sizes', values: product.sizes, icon: PackageCheck },
        { title: 'Materials', values: product.materials, icon: ShieldCheck },
        { title: 'Options', values: product.options, icon: Check },
      ].map(({ title, values, icon: Icon }) => (
        <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Icon className="h-7 w-7 text-[#18448D]" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-slate-950">{title}</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            {values.map((value) => (
              <li key={value} className="flex gap-2">
                <Check className="mt-1 h-4 w-4 flex-none text-emerald-600" aria-hidden="true" />
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>

    <section className="py-12 sm:py-16" aria-labelledby="artwork-heading">
      <div className="grid gap-8 rounded-3xl bg-slate-950 p-7 text-white sm:p-10 lg:grid-cols-2">
        <div>
          <FileCheck2 className="h-8 w-8 text-orange-400" aria-hidden="true" />
          <h2 id="artwork-heading" className="mt-4 text-3xl font-black">Artwork and preview</h2>
          <p className="mt-4 leading-7 text-slate-200">{SITE_POLICIES.artwork.detail}</p>
          <p className="mt-4 leading-7 text-slate-200">{SITE_POLICIES.preview.detail}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
          <h3 className="text-lg font-bold">Before placing the order</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
            <li className="flex gap-2"><Check className="mt-1 h-4 w-4 flex-none text-orange-400" aria-hidden="true" />Confirm dimensions and quantity.</li>
            <li className="flex gap-2"><Check className="mt-1 h-4 w-4 flex-none text-orange-400" aria-hidden="true" />Check spelling, contact details, cropping, and placement.</li>
            <li className="flex gap-2"><Check className="mt-1 h-4 w-4 flex-none text-orange-400" aria-hidden="true" />Use a high-resolution source file and embed fonts in PDFs.</li>
            <li className="flex gap-2"><Check className="mt-1 h-4 w-4 flex-none text-orange-400" aria-hidden="true" />Understand that screen color can differ from printed color.</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="py-12" aria-labelledby="fulfillment-heading">
      <div className="mb-7 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-700">Production, shipping, and remedies</p>
        <h2 id="fulfillment-heading" className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">Know the timeline before ordering</h2>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {[
          ['Production', SITE_POLICIES.production.detail],
          ['Shipping', SITE_POLICIES.shipping.detail],
          ['Damage or production defects', SITE_POLICIES.returns.detail],
          ['Changes and cancellations', SITE_POLICIES.cancellations.detail],
        ].map(([title, detail]) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <Info className="h-6 w-6 text-[#18448D]" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-black text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="grid gap-8 py-12 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-black text-slate-950">Product limitations</h2>
        <ul className="mt-5 space-y-3">
          {product.limitations.map((item) => (
            <li key={item} className="flex gap-3 text-slate-600">
              <Info className="mt-1 h-5 w-5 flex-none text-[#18448D]" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-3xl font-black text-slate-950">Installation and care</h2>
        <ul className="mt-5 space-y-3">
          {product.installationAndCare.map((item) => (
            <li key={item} className="flex gap-3 text-slate-600">
              <Check className="mt-1 h-5 w-5 flex-none text-emerald-600" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    {includeFaq && (
      <section className="py-12" aria-labelledby="product-faq-heading">
        <h2 id="product-faq-heading" className="text-3xl font-black text-slate-950 sm:text-4xl">{faqHeading}</h2>
        <div className="mt-7 space-y-4">
          {product.faqs.map((faq) => (
            <details key={faq.question} className="group rounded-2xl border border-slate-200 bg-white p-5 open:border-[#18448D]">
              <summary className="cursor-pointer list-none pr-8 font-bold text-slate-950 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                {faq.question}
              </summary>
              <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    )}
  </>
);

export default ProductBuyingGuide;
