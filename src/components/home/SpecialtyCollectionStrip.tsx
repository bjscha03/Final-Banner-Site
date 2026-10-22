import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { availableSpecialtyProducts, specialtyCategories, type SpecialtyCategory } from '@/lib/specialtyProducts';

const collections: Array<{ category: SpecialtyCategory; slug: string; detail: string }> = [
  { category: 'stands', slug: 'standard-retractable-banner', detail: 'Retractable banners, tabletop displays & backdrops' },
  { category: 'flags', slug: 'feather-flags', detail: 'Feather, teardrop & rectangle flags' },
  { category: 'events', slug: 'custom-event-tents', detail: 'Standard, fitted & stretch covers plus event tents' },
  { category: 'signs', slug: 'aluminum-signs', detail: 'Acrylic, aluminum, composite panels & posters' },
];

export default function SpecialtyCollectionStrip() {
  if (!availableSpecialtyProducts.length) return null;
  return <section className="mt-10 border-t border-slate-300 pt-10" aria-labelledby="new-products-heading">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="brand-eyebrow text-[#b84300]">New products · More ways to stand out</p><h3 id="new-products-heading" className="homepage-condensed mt-3 text-4xl font-black uppercase leading-none sm:text-5xl">Build your entire display.</h3><p className="mt-3 max-w-2xl text-slate-600">Shop banner stands, flags, table covers, tents and signs. Free Next Day Air after production.</p></div>
      <Link to="/products" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0B1F3A] px-5 font-bold text-white hover:bg-[#193c61]">Shop all new products <ArrowRight className="h-4 w-4"/></Link>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {collections.filter(({category})=>availableSpecialtyProducts.some(p=>p.category===category)).map(({category,slug,detail})=>{
        const product=availableSpecialtyProducts.find(p=>p.slug===slug)||availableSpecialtyProducts.find(p=>p.category===category)!;
        return <Link key={category} to={`/products#${category}`} className="group overflow-hidden rounded-3xl border border-slate-200 bg-white transition hover:border-orange-500 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600">
          <img src={category === 'stands' ? '/images/campaign/retractable-640.webp' : category === 'flags' ? '/images/campaign/flags-640.webp' : product.image} alt={`${specialtyCategories[category].label} example`} loading="lazy" width="640" height="480" className="aspect-[4/3] w-full object-cover"/>
          <div className="p-5"><h4 className="flex items-center justify-between gap-2 text-lg font-bold">{specialtyCategories[category].label}<ArrowRight className="h-4 w-4 shrink-0 text-[#b84300]"/></h4><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p></div>
        </Link>;
      })}
    </div>
  </section>;
}
