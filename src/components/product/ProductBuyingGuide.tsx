import React from 'react';
import { Check, ChevronDown, Clock3, FileCheck2, Info, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { formatMoney, type ProductLandingDefinition } from '@/lib/seo/productLandingData';
import { SITE_POLICIES } from '@/lib/sitePolicies';
import ProductVisual from '@/components/product/ProductVisual';

interface ProductBuyingGuideProps {
  product: ProductLandingDefinition;
  includeFaq?: boolean;
  faqHeading?: string;
}

const snapshotWidths = ['w-[46%]', 'w-[70%]', 'w-full'];

const ProductBuyingGuide: React.FC<ProductBuyingGuideProps> = ({
  product,
  includeFaq = true,
  faqHeading = `${product.singular} FAQs`,
}) => {
  const isFixedSizeYardSign = product.slug === 'yard-signs';
  const sharedConfiguration = product.priceExamples.every(
    (example) => example.configuration === product.priceExamples[0]?.configuration,
  )
    ? product.priceExamples[0]?.configuration
    : null;

  return (
    <>
      <section id="sizes-pricing" className="scroll-mt-24 py-14 sm:py-16" aria-labelledby="sizes-pricing-heading">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
          <div>
            <p className="brand-eyebrow">{isFixedSizeYardSign ? 'One online format' : 'Current buying information'}</p>
            <h2 id="sizes-pricing-heading" className="brand-title mt-3">
              {isFixedSizeYardSign ? 'One 24 × 18-inch size. Clear pricing choices.' : 'See how size changes the starting point.'}
            </h2>
            <p className="brand-copy mt-4">
              {isFixedSizeYardSign
                ? 'Every yard sign uses the same 24 × 18-inch corrugated-plastic format. Choose single- or double-sided printing, then add step stakes only if you need them.'
                : 'These are live examples from the same pricing data used by the configurator. Tax and paid options are not included.'}
            </p>
            {!isFixedSizeYardSign && sharedConfiguration && (
              <div className="mt-6 border-l-4 border-[#FF6A00] bg-[#F7F7F7] p-4 text-sm leading-6 text-slate-700">
                <span className="font-bold text-[#0B1F3A]">Comparison basis:</span> {sharedConfiguration}.
              </div>
            )}
          </div>

          {isFixedSizeYardSign ? (
            <div data-yard-sign-fixed-offer className="overflow-hidden border border-slate-200 bg-white">
              <div className="grid min-w-0 xl:grid-cols-[0.82fr_1.18fr]">
                <div className="min-w-0 border-b border-slate-200 bg-[#EDF1F5] p-4 xl:border-b-0 xl:border-r xl:p-5">
                  <ProductVisual productSlug="yard-signs" className="aspect-[4/3] min-h-[220px] w-full" />
                  <div className="border-x border-b border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#A63C00]">Fixed online size</p>
                    <p className="mt-1 font-display text-xl font-bold text-[#0B1F3A]">24″ × 18″</p>
                  </div>
                </div>
                <div className="min-w-0 p-5 sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Current pricing · Quantity 10</p>
                  <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                    {product.priceExamples.map((example) => {
                      const isAddOn = example.label.toLowerCase().includes('stake');
                      return (
                        <article key={`${example.label}-${example.configuration}`} className="grid min-w-0 gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-base font-bold leading-6 text-[#0B1F3A]">{example.label}</h3>
                              {isAddOn && <span className="border border-[#FF6A00]/40 bg-[#FFF7F1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A63C00]">Optional add-on</span>}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{example.note || 'Before tax'}</p>
                          </div>
                          <p className="font-display text-2xl font-bold text-[#A63C00] sm:text-right">{formatMoney(example.totalCents)}</p>
                        </article>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">Sign prices exclude tax. Step stakes are shown separately because they are optional and do not change the sign size.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid border border-slate-200 sm:grid-cols-3">
              {product.priceExamples.map((example, index) => (
                <article data-size-snapshot key={`${example.label}-${example.configuration}`} className={`flex min-h-[280px] min-w-0 flex-col p-5 sm:p-6 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}>
                  <div className="flex h-24 min-w-0 items-center justify-center overflow-hidden bg-[#F2F4F6] px-4" aria-hidden="true">
                    <div className={`${snapshotWidths[index] || 'w-full'} relative aspect-[2/1] max-w-full border-2 border-[#0B1F3A] bg-white shadow-[4px_5px_0_#D7DEE7]`}>
                      <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FF6A00]" />
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FF6A00]" />
                    </div>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold leading-6 text-[#0B1F3A]">{example.label}</h3>
                  {!sharedConfiguration && <p className="mt-2 text-sm leading-5 text-slate-600">{example.configuration}</p>}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                    <p className="font-display text-2xl font-bold text-[#A63C00]">{formatMoney(example.totalCents)}</p>
                    <p className="text-right text-xs leading-4 text-slate-500">{example.note || 'Before tax'}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#F7F7F7]" aria-label={`${product.plural} specifications`}>
        <div className="grid lg:grid-cols-3">
          {[
            { title: isFixedSizeYardSign ? 'Fixed size' : 'Available sizes', values: product.sizes, icon: PackageCheck },
            { title: 'Materials', values: product.materials, icon: ShieldCheck },
            { title: 'Finishing & options', values: product.options, icon: Check },
          ].map(({ title, values, icon: Icon }, index) => (
            <article key={title} className={`py-8 lg:px-8 ${index > 0 ? 'border-t border-slate-200 lg:border-l lg:border-t-0' : 'lg:pr-8'}`}>
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-[#FF6A00]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-[#0B1F3A]">{title}</h2>
              </div>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
                {values.map((value) => (
                  <li key={value} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-none bg-[#0B1F3A]" aria-hidden="true" />
                    <span>{value}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="py-14 sm:py-16" aria-labelledby="artwork-heading">
        <div className="grid overflow-hidden bg-[#0B1F3A] text-white lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-white/15 p-7 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
            <FileCheck2 className="h-7 w-7 text-[#FF8A3D]" aria-hidden="true" />
            <h2 id="artwork-heading" className="mt-5 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Artwork you can inspect before checkout.</h2>
            <p className="mt-5 leading-7 text-slate-300">{SITE_POLICIES.artwork.detail}</p>
            <p className="mt-4 leading-7 text-slate-300">{SITE_POLICIES.preview.detail}</p>
          </div>
          <div className="p-7 sm:p-10 lg:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF8A3D]">Preflight checklist</p>
            <ol className="mt-6 divide-y divide-white/15 border-y border-white/15">
              {[
                ['01', isFixedSizeYardSign ? 'Confirm the 24 × 18-inch format and choose quantity' : 'Set the final size and quantity'],
                ['02', 'Check spelling, cropping, placement, and contact details'],
                ['03', 'Use a high-resolution file and embed fonts in PDFs'],
                ['04', 'Review the on-screen print preview at the configured size'],
              ].map(([number, label]) => (
                <li key={number} className="flex gap-5 py-4 text-sm leading-6 text-slate-200">
                  <span className="font-display font-bold text-[#FF8A3D]">{number}</span>{label}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-14" aria-labelledby="fulfillment-heading">
        <div className="max-w-3xl">
          <p className="brand-eyebrow">Production, shipping, and remedies</p>
          <h2 id="fulfillment-heading" className="brand-title mt-3">Know the sequence before ordering.</h2>
        </div>

        <div className="mt-9 grid border-y border-slate-200 md:grid-cols-2">
          {[
            { number: '1', title: 'Production', detail: SITE_POLICIES.production.detail, icon: Clock3 },
            { number: '2', title: 'Carrier transit', detail: SITE_POLICIES.shipping.detail, icon: Truck },
          ].map(({ number, title, detail, icon: Icon }, index) => (
            <article key={title} className={`py-7 md:px-8 ${index > 0 ? 'border-t border-slate-200 md:border-l md:border-t-0' : 'md:pr-8'}`}>
              <div className="flex items-center gap-3">
                <span className="font-display text-3xl font-bold text-[#A63C00]">{number}</span>
                <Icon className="h-5 w-5 text-[#0B1F3A]" aria-hidden="true" />
                <h3 className="font-display text-xl font-bold text-[#0B1F3A]">{title}</h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
            </article>
          ))}
        </div>

        <div className="grid bg-[#F7F7F7] md:grid-cols-2">
          {[
            ['Damage or production defects', SITE_POLICIES.returns.detail],
            ['Changes and cancellations', SITE_POLICIES.cancellations.detail],
          ].map(([title, detail], index) => (
            <article key={title} className={`p-6 ${index > 0 ? 'border-t border-slate-200 md:border-l md:border-t-0' : ''}`}>
              <div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 flex-none text-[#FF6A00]" aria-hidden="true" /><div><h3 className="font-display font-bold text-[#0B1F3A]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></div></div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-10 py-12 lg:grid-cols-2 lg:gap-16">
        {[
          { title: 'Product limitations', items: product.limitations, icon: Info },
          { title: 'Installation and care', items: product.installationAndCare, icon: Check },
        ].map(({ title, items, icon: Icon }) => (
          <div key={title} className="border-t-4 border-[#FF6A00] pt-6">
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">{title}</h2>
            <ul className="mt-5 space-y-4">
              {items.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                  <Icon className="mt-0.5 h-5 w-5 flex-none text-[#0B1F3A]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {includeFaq && (
        <section className="py-12 sm:py-16" aria-labelledby="product-faq-heading">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1.45fr] lg:gap-14">
            <div>
              <p className="brand-eyebrow">Practical answers</p>
              <h2 id="product-faq-heading" className="brand-title mt-3">{faqHeading}</h2>
            </div>
            <div className="border-t border-slate-200">
              {product.faqs.map((faq) => (
                <details key={faq.question} className="group border-b border-slate-200 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-display font-bold text-[#0B1F3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]">
                    {faq.question}<ChevronDown className="h-5 w-5 flex-none transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="max-w-3xl pt-4 leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
};

export default ProductBuyingGuide;
