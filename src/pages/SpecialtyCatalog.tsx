import { useEffect } from 'react';
import FirstOrderBadge from '@/components/product/FirstOrderBadge';
import { useProductFirstOrderOffer } from '@/hooks/useProductFirstOrderOffer';
import { specialtyDisplayPrice } from '@/lib/specialtyDisplayPrice';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Image, PencilLine, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import CompactProductHero from '@/components/product/CompactProductHero';
import GoogleReviewSpotlight from '@/components/design/GoogleReviewSpotlight';
import SpecialtyDeliveryStatus from '@/components/delivery/SpecialtyDeliveryStatus';
import '@/styles/product-hero.css';
import '@/styles/specialty-catalog-hero.css';
import { formatSpecialtyPrice, specialtyCategories, availableSpecialtyProducts as specialtyProducts, specialtyStartingPrice, type SpecialtyCategory } from '@/lib/specialtyProducts';

const groups = (Object.entries(specialtyCategories) as Array<[SpecialtyCategory, typeof specialtyCategories[SpecialtyCategory]]>).filter(([key])=>specialtyProducts.some(product=>product.category===key));

export default function SpecialtyCatalog() {
  const {hash}=useLocation();
  const { showBadge, discount } = useProductFirstOrderOffer();
  useEffect(()=>{if(hash)document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'});},[hash]);
  return <Layout showFooterBanner={false}>
    <SEO title="Displays, Event Gear & Signs | Banners On The Fly" description="Explore retractable banners, flags, table covers, event tents and custom rigid signs. Upload artwork, customize your design and preview your product." canonical="https://bannersonthefly.com/products" schema={[
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Displays, Event Gear & Signs', url: 'https://bannersonthefly.com/products', description: 'Portable displays, branded event gear and custom signs.' },
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Displays, Event Gear & Signs', url: 'https://bannersonthefly.com/products', mainEntity: { '@type': 'ItemList', itemListElement: specialtyProducts.map((product, index) => ({ '@type': 'ListItem', position: index + 1, name: product.name, url: `https://bannersonthefly.com/products/${product.slug}` })) } },
    ]} />
    <CompactProductHero title="Displays & signs." accent="Ready to stand out." specialty discount={showBadge}
      photo={<img src="/images/product-heroes/displays-fieldwork-640.webp" width={1440} height={960} loading="eager" fetchPriority="high" alt="Custom retractable banner, branded table cover and matching sidewalk sign" />}
      delivery={<SpecialtyDeliveryStatus featured />}
      action={<a href="#shop-displays">Shop Displays &amp; Signs<ArrowRight aria-hidden="true" /></a>}
    />
    <section className="product-hero-light specialty-catalog-hero hidden lg:block" aria-labelledby="catalog-hero-title">
      <div className="product-hero-stage">
        <div className="product-hero-copy">
          <p className="product-hero-eyebrow">Displays &amp; Signs</p>
          <h1 id="catalog-hero-title">Show up.<span className="product-hero-accent">Stand out.</span></h1>
          <p className="product-hero-description">Custom displays and signs that turn heads—at events, in-store, and everywhere you go.</p>
          <div className="product-hero-actions"><a href="#shop-displays" className="product-hero-cta">Shop Displays &amp; Signs<ArrowRight aria-hidden="true" /></a></div>
          <div className="mt-6"><SpecialtyDeliveryStatus featured /></div>
        </div>
        <div className="product-hero-media">
          <img src="/images/product-heroes/displays-fieldwork-1440.webp" srcSet="/images/product-heroes/displays-fieldwork-640.webp 640w, /images/product-heroes/displays-fieldwork-1440.webp 1440w" sizes="(min-width: 768px) 57vw, 100vw" width={1440} height={960} loading="eager" fetchPriority="high" alt="FIELDWORK retractable banner with mountain artwork, terracotta branded table cover and matching sidewalk sign outside a modern venue" />
          {showBadge && <FirstOrderBadge />}
        </div>
      </div>
      <div className="product-hero-benefits"><ul aria-label="Product ordering benefits">
        <li><Truck aria-hidden="true" /><span>Free Next-Day Air Shipping</span></li>
        <li><PencilLine aria-hidden="true" /><span>Easy Online Customization</span></li>
        <li><Image aria-hidden="true" /><span>Vibrant Full-Color Printing</span></li>
      </ul></div>
    </section>

    <div className="hidden lg:block"><GoogleReviewSpotlight /></div>

    <nav className="sticky top-[72px] z-30 border-b border-slate-200 bg-white/95 backdrop-blur" aria-label="Specialty product categories">
      <div className="brand-shell flex gap-6 overflow-x-auto py-4 text-sm font-bold text-[#0B1F3A]">
        {groups.map(([key, group]) => <a className="whitespace-nowrap border-b-2 border-transparent hover:border-[#ff6a00] focus-visible:border-[#ff6a00]" key={key} href={`#${key}`}>{group.label}</a>)}
      </div>
    </nav>

    <div id="shop-displays" className="scroll-mt-36 bg-[#f7f8fa] pb-20">
      <div className="brand-shell pt-7 text-center sm:pt-12"><h2 className="font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl">Find your perfect display.</h2></div>
      {groups.map(([key, group]) => <section key={key} id={key} className="brand-shell scroll-mt-36 pt-8 sm:pt-14" aria-labelledby={`${key}-heading`}>
        <div className="mb-4 sm:mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 sm:pb-6">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#c94e00]">Shop the collection</p><h2 id={`${key}-heading`} className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">{group.label}</h2><p className="mt-2 text-slate-600">{group.description}</p></div>
          <span className="text-sm font-semibold text-slate-500">{specialtyProducts.filter(product => product.category === key).length} products</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {specialtyProducts.filter(product => product.category === key).map(product => {
            const price = specialtyStartingPrice(product);
            const display = price === undefined ? null : specialtyDisplayPrice(price, discount);
            return <Link to={`/products/${product.slug}`} key={product.slug} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-[#f45b08] hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f45b08]">
              <div className="relative" data-product-card-photo><img src={product.image} alt={product.imageAlt} loading="lazy" width="1440" height="960" className="aspect-[3/2] w-full bg-white object-contain" />{showBadge && <FirstOrderBadge />}</div>
              <div className="p-4 sm:p-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#c94e00]">{product.eyebrow}</p><h3 className="mt-2 font-display text-2xl font-black tracking-tight text-[#0B1F3A]">{product.name}</h3><p className="mt-2 text-sm leading-5 sm:min-h-10 text-slate-600">{product.summary}</p>
                <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-100 pt-3"><div>{price!==undefined&&<p className="text-xs text-slate-500">From</p>}<p className="font-display text-xl font-black text-[#0B1F3A]">{display ? formatSpecialtyPrice(display.totalCents) : 'Price coming soon'}</p>{!!display?.discountCents && <p className="mt-1 text-xs text-slate-600"><s>{formatSpecialtyPrice(price!)}</s> · {display.label}</p>}{product.shippingPolicy&&<p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#061a31]"><Truck className="h-4 w-4"/>Free Next Day Air shipping</p>}</div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1e8] text-[#c94e00] transition group-hover:bg-[#f45b08] group-hover:text-white"><ArrowRight className="h-5 w-5" /></span></div>
              </div>
            </Link>;
          })}
        </div>
      </section>)}
      <div className="brand-shell mt-14"><div className="border-l-4 border-[#ff6a00] bg-white p-6 text-sm leading-7 text-slate-600 shadow-sm sm:p-8"><strong className="block text-base text-[#0B1F3A]">About production and delivery</strong>All displays and signs on this page follow the same schedule: order and approve your artwork before 2 p.m. Pacific / 5 p.m. Eastern on a business day for shipment the next business day. Orders after the cutoff take one additional business day; orders after Friday’s cutoff and over the weekend ship Tuesday, excluding holidays. Free FedEx Next-Day Air shipping is included in the price after production. Choose your size and options on the product page, then upload and approve each required artwork panel.</div></div>
    </div>
  </Layout>;
}
