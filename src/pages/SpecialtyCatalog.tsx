import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Package, Truck } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import { formatSpecialtyPrice, specialtyCategories, availableSpecialtyProducts as specialtyProducts, specialtyStartingPrice, type SpecialtyCategory } from '@/lib/specialtyProducts';

const groups = (Object.entries(specialtyCategories) as Array<[SpecialtyCategory, typeof specialtyCategories[SpecialtyCategory]]>).filter(([key])=>specialtyProducts.some(product=>product.category===key));

export default function SpecialtyCatalog() {
  const {hash}=useLocation();
  useEffect(()=>{if(hash)document.getElementById(hash.slice(1))?.scrollIntoView({block:'start'});},[hash]);
  return <Layout showFooterBanner={false}>
    <SEO title="Displays, Event Gear & Signs | Banners On The Fly" description="Explore retractable banners, flags, table covers, event tents and custom rigid signs. Upload artwork, customize your design and preview your product." canonical="https://bannersonthefly.com/products" schema={[
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Displays, Event Gear & Signs', url: 'https://bannersonthefly.com/products', description: 'Portable displays, branded event gear and custom signs.' },
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Displays, Event Gear & Signs', url: 'https://bannersonthefly.com/products', mainEntity: { '@type': 'ItemList', itemListElement: specialtyProducts.map((product, index) => ({ '@type': 'ListItem', position: index + 1, name: product.name, url: `https://bannersonthefly.com/products/${product.slug}` })) } },
    ]} />
    <section className="relative overflow-hidden bg-[#071b32] text-white">
      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(120deg, transparent 50%, #28547d 50%, transparent 90%), radial-gradient(circle at 85% 15%, #f45b08 0, transparent 28%)' }} />
      <div className="brand-shell relative py-16 sm:py-20 lg:py-24">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff9b65]">More ways to show up</p>
        <h1 className="mt-4 max-w-4xl font-display text-5xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-7xl">Make the entire space yours.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">Portable displays, branded event gear and durable signs. Choose your product, customize your artwork and see it come to life. Your design stays with your cart from preview to checkout.</p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2"><Package className="h-4 w-4 text-[#ff8b4a]" /> Fast production options</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2"><Truck className="h-4 w-4 text-[#ff8b4a]" /> Free Next Day Air shipping</span>
        </div>
      </div>
    </section>

    <nav className="sticky top-[72px] z-30 border-b border-slate-200 bg-white/95 backdrop-blur" aria-label="Specialty product categories">
      <div className="brand-shell flex gap-6 overflow-x-auto py-4 text-sm font-bold text-[#0B1F3A]">
        {groups.map(([key, group]) => <a className="whitespace-nowrap border-b-2 border-transparent hover:border-[#ff6a00] focus-visible:border-[#ff6a00]" key={key} href={`#${key}`}>{group.label}</a>)}
      </div>
    </nav>

    <div className="bg-[#f7f8fa] pb-20">
      {groups.map(([key, group]) => <section key={key} id={key} className="brand-shell scroll-mt-36 pt-14 sm:pt-18" aria-labelledby={`${key}-heading`}>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-6">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#c94e00]">Shop the collection</p><h2 id={`${key}-heading`} className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-[#0B1F3A] sm:text-4xl">{group.label}</h2><p className="mt-2 text-slate-600">{group.description}</p></div>
          <span className="text-sm font-semibold text-slate-500">{specialtyProducts.filter(product => product.category === key).length} products</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {specialtyProducts.filter(product => product.category === key).map(product => {
            const price = specialtyStartingPrice(product);
            return <Link to={`/products/${product.slug}`} key={product.slug} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-[#f45b08] hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f45b08]">
              <img src={product.image} alt={product.imageAlt} loading="lazy" width="640" height="640" className="aspect-square w-full bg-white object-contain" />
              <div className="p-6"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#c94e00]">{product.eyebrow}</p><h3 className="mt-2 font-display text-2xl font-black tracking-tight text-[#0B1F3A]">{product.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{product.summary}</p>
                <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-100 pt-4"><div>{price!==undefined&&<p className="text-xs text-slate-500">From</p>}<p className="font-display text-xl font-black text-[#0B1F3A]">{price!==undefined ? formatSpecialtyPrice(price) : 'Price coming soon'}</p>{product.shippingPolicy&&<p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-green-700"><Truck className="h-4 w-4"/>Free Next Day Air shipping</p>}</div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1e8] text-[#c94e00] transition group-hover:bg-[#f45b08] group-hover:text-white"><ArrowRight className="h-5 w-5" /></span></div>
              </div>
            </Link>;
          })}
        </div>
      </section>)}
      <div className="brand-shell mt-14"><div className="border-l-4 border-[#ff6a00] bg-white p-6 text-sm leading-7 text-slate-600 shadow-sm sm:p-8"><strong className="block text-base text-[#0B1F3A]">About production and delivery</strong>Every product includes free Next Day Air shipping after production. Production times vary by product. Choose your size and options on the product page, then upload and approve each required artwork panel.</div></div>
    </div>
  </Layout>;
}
