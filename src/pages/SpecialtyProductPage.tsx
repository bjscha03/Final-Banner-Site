import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, PackageCheck, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import SpecialtyVisual from '@/components/product/SpecialtyVisual';
import { formatSpecialtyPrice, getSpecialtyProduct, specialtyCategories, specialtyProducts } from '@/lib/specialtyProducts';

export default function SpecialtyProductPage() {
  const { slug } = useParams();
  const product = getSpecialtyProduct(slug);
  const [variantIndex, setVariantIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [width, setWidth] = useState('24');
  const [height, setHeight] = useState('18');
  const [details, setDetails] = useState('');
  const variant = product?.variants[Math.min(variantIndex, product.variants.length - 1)];
  const dimensionsValid = !!product && (product.priceUnit !== 'sqft' || (Number(width) >= 6 && Number(height) >= 6 && Number(width) <= 96 && Number(height) <= 96));
  const estimate = useMemo(() => {
    if (!product || !variant?.priceCents || !dimensionsValid) return null;
    if (product.priceUnit === 'sqft') return Math.max(product.minOrderCents || 0, Math.ceil(Number(width) * Number(height) / 144 * variant.priceCents)) * quantity;
    return variant.priceCents * quantity;
  }, [product, variant, dimensionsValid, width, height, quantity]);

  if (!product || !variant) return <Navigate to="/products" replace />;
  const params = new URLSearchParams({
    product: product.slug,
    variant: variant.label,
    quantity: String(quantity),
    ...(product.priceUnit === 'sqft' ? { width, height } : {}),
  });
  const quoteUrl = `/custom-quote?${params.toString()}`;
  const related = specialtyProducts.filter(other => other.category === product.category && other.slug !== product.slug).slice(0, 3);

  return <Layout showFooterBanner={false}>
    <SEO title={`${product.name} | Banners On The Fly`} description={`${product.summary} Compare options and request a quote with shipping for your address.`} canonical={`https://bannersonthefly.com/products/${product.slug}`} ogType="product" schema={[
      { '@context': 'https://schema.org', '@type': 'WebPage', name: product.name, url: `https://bannersonthefly.com/products/${product.slug}`, description: product.summary },
      { '@context': 'https://schema.org', '@type': 'Product', name: product.name, description: product.description, brand: { '@type': 'Brand', name: 'Banners On The Fly' }, url: `https://bannersonthefly.com/products/${product.slug}` },
    ]} />
    <div className="bg-[#f7f8fa] text-[#0B1F3A]">
      <div className="brand-shell py-5 text-sm font-semibold"><Link className="inline-flex items-center gap-2 text-[#18448D] hover:text-[#c94e00]" to="/products"><ArrowLeft className="h-4 w-4" /> All displays & signs</Link><span className="mx-3 text-slate-400">/</span><span>{specialtyCategories[product.category].label}</span></div>
      <main className="brand-shell grid gap-8 pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)] lg:gap-12">
        <div><SpecialtyVisual kind={product.visual} className="aspect-[1.2] rounded-xl shadow-[0_25px_65px_rgba(11,31,58,0.15)] sm:aspect-[1.4]" />
          <section className="mt-8 border-t-4 border-[#ff6a00] bg-white p-7 shadow-sm sm:p-9"><h2 className="font-display text-2xl font-black">Built for the job</h2><p className="mt-3 leading-7 text-slate-600">{product.description}</p><ul className="mt-6 grid gap-3 sm:grid-cols-2">{product.features.map(feature => <li key={feature} className="flex items-start gap-3 text-sm font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none text-[#c94e00]" />{feature}</li>)}</ul></section>
        </div>
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#c94e00]">{product.eyebrow}</p><h1 className="mt-3 font-display text-4xl font-black leading-[1.08] tracking-[-0.05em] sm:text-5xl">{product.name}</h1><p className="mt-4 text-lg leading-8 text-slate-600">{product.summary}</p>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-xl font-black">Build your request</h2><p className="mt-1 text-sm text-slate-600">Choose a base configuration. We’ll confirm options and delivery before payment.</p>
            <label className="mt-6 block text-sm font-bold" htmlFor="specialty-variant">Size & configuration</label>
            <select id="specialty-variant" value={variantIndex} onChange={event => setVariantIndex(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-[#0B1F3A] focus-visible:outline-[#ff6a00]">
              {product.variants.map((option, index) => <option key={`${option.label}-${index}`} value={index}>{option.label}{option.priceCents ? ` · ${formatSpecialtyPrice(option.priceCents)}${product.priceUnit === 'sqft' ? '/sq ft' : ''}` : ''}</option>)}
            </select>
            {product.priceUnit === 'sqft' && <div className="mt-5 grid grid-cols-2 gap-4"><label className="text-sm font-bold">Width (inches)<input type="number" min="6" max="96" step="0.25" value={width} onChange={event => setWidth(event.target.value)} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-3" /></label><label className="text-sm font-bold">Height (inches)<input type="number" min="6" max="96" step="0.25" value={height} onChange={event => setHeight(event.target.value)} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-3" /></label><p className="col-span-2 text-xs text-slate-500">For other sizes or complex finishing, include details in the quote request.</p></div>}
            <label className="mt-5 block text-sm font-bold" htmlFor="specialty-quantity">Quantity</label><input id="specialty-quantity" type="number" min="1" max="100" step="1" value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(100, Math.floor(Number(event.target.value) || 1))))} className="mt-2 min-h-12 w-28 rounded-md border border-slate-300 px-3" />
            <label className="mt-5 block text-sm font-bold" htmlFor="specialty-details">Other options or project details <span className="font-normal text-slate-500">(optional)</span></label><textarea id="specialty-details" maxLength={500} rows={3} value={details} onChange={event => setDetails(event.target.value)} placeholder="For example: double-sided print, extra walls, a different base or a deadline." className="mt-2 w-full rounded-md border border-slate-300 p-3 text-sm" />
            <div className="mt-6 border-y border-slate-200 py-5"><p className="text-sm text-slate-500">Estimated base product subtotal</p><p className="mt-1 font-display text-3xl font-black">{estimate == null ? 'Enter a valid size' : formatSpecialtyPrice(estimate)}</p>{product.minOrderCents && <p className="mt-1 text-xs text-slate-500">Includes a {formatSpecialtyPrice(product.minOrderCents)} per-item minimum.</p>}<p className="mt-2 text-xs leading-5 text-slate-500">Before additional options, tax and shipping. Your exact total is confirmed in the quote.</p></div>
            <Link to={quoteUrl} state={{ details: details.trim().slice(0, 500) }} aria-disabled={!dimensionsValid} onClick={event => { if (!dimensionsValid) event.preventDefault(); }} className={`mt-6 flex min-h-14 items-center justify-center gap-2 rounded-md bg-[#c94e00] px-5 text-center font-black text-white transition hover:bg-[#a93e00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c94e00] ${!dimensionsValid ? 'pointer-events-none opacity-50' : ''}`}>Request exact price & shipping <ArrowRight className="h-5 w-5" /></Link>
            <p className="mt-4 text-center text-xs text-slate-500">No payment is taken when you request a quote.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="flex gap-3 rounded-lg bg-white p-4 text-sm"><PackageCheck className="h-5 w-5 flex-none text-[#c94e00]" /><span><strong className="block">Production confirmed</strong>We’ll verify artwork and timing.</span></div><div className="flex gap-3 rounded-lg bg-white p-4 text-sm"><Truck className="h-5 w-5 flex-none text-[#c94e00]" /><span><strong className="block">Delivery by address</strong>Shipping is quoted separately.</span></div></div>
          {product.note && <p className="mt-4 text-xs leading-5 text-slate-600">{product.note}</p>}
        </div>
      </main>
      {related.length > 0 && <section className="border-t border-slate-200 bg-white py-14"><div className="brand-shell"><h2 className="font-display text-3xl font-black">Explore related products</h2><div className="mt-6 grid gap-4 sm:grid-cols-3">{related.map(item => <Link to={`/products/${item.slug}`} key={item.slug} className="group overflow-hidden rounded-lg border border-slate-200 hover:border-[#ff6a00]"><SpecialtyVisual kind={item.visual} className="aspect-[1.7]" /><span className="flex items-center justify-between p-4 font-bold">{item.name}<ArrowRight className="h-4 w-4 text-[#c94e00] transition group-hover:translate-x-1" /></span></Link>)}</div></div></section>}
    </div>
  </Layout>;
}
