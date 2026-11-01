import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import CompactProductHero from '@/components/product/CompactProductHero';
import FirstOrderBadge from '@/components/product/FirstOrderBadge';
import '@/styles/product-hero.css';
import SpecialtyDesigner from '@/components/specialty/SpecialtyDesigner';
import SpecialtyDeliveryStatus from '@/components/delivery/SpecialtyDeliveryStatus';
import { getSpecialtyProduct, isSpecialtyProductAvailable } from '@/lib/specialtyProducts';
import { useProductFirstOrderOffer } from '@/hooks/useProductFirstOrderOffer';

const slug = 'standard-retractable-banner';
const product = getSpecialtyProduct(slug);
export function useBannerType(enabled: boolean) {
  const [selected, setSelected] = useState(false);
  const [visited, setVisited] = useState(false);
  const available = enabled && !!product && isSpecialtyProductAvailable(slug);
  return { available, retractable: available && selected, visited: available && visited,
    select(value: boolean) { setSelected(value); if (value) setVisited(true); } };
}

const choices = [
  ['Hanging Vinyl Banner', 'Hang it on a fence, wall, or railing.'],
  ['Retractable Banner', 'A freestanding display that rolls into its base.'],
];

export function BannerTypeSelector({ selection }: { selection: ReturnType<typeof useBannerType> }) {
  if (!selection.available) return null;
  return <fieldset className="mb-5 min-w-0">
    <legend className="mb-2 text-lg font-bold text-[#061A31]">Choose your banner type</legend>
    <div className="grid gap-2 md:grid-cols-2 md:gap-4">{choices.map(([title, detail], i) => {
      const active = selection.retractable === Boolean(i);
      return <label key={title} className={'flex cursor-pointer items-center gap-3 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-orange-600 '+(active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-400')}>
        <img src={'/images/banner-selector/photo-'+i+'.webp'} alt="" width="400" height="400" className="h-16 w-20 rounded-md object-cover md:h-32 md:w-1/3 lg:h-40"/>
        <input type="radio" name="banner-type" checked={active} onChange={()=>selection.select(Boolean(i))} className="h-5 w-5 shrink-0 accent-orange-600"/>
        <span><strong className="block text-[#061A31]">{title}</strong><span className="text-sm text-slate-600">{detail}</span></span>
      </label>;
    })}</div>
  </fieldset>;
}

export function RetractableBuilder({ compactUpload = false }: { compactUpload?: boolean }) {
  const offer = useProductFirstOrderOffer();
  return product ? <SpecialtyDesigner product={product} offer={offer} compactUpload={compactUpload} embedded /> : null;
}

export function RetractableHero() {
  const offer = useProductFirstOrderOffer();
  const photo = <img src="/images/banner-selector/retractable-expo.webp" alt="Retractable banner standing on its silver base at an expo" />;
  const action = <a href="#builder-start" className="product-hero-cta">Design your retractable banner <ArrowRight aria-hidden="true" /></a>;
  return <>
    <CompactProductHero title="Retractable banners" accent="Ready to roll." specialty discount={offer.showBadge}
      photo={photo} delivery={<SpecialtyDeliveryStatus featured />} action={action} />
    <section className="product-hero-light hidden lg:block">
      <div className="product-hero-stage">
        <div className="product-hero-copy">
          <p className="product-hero-eyebrow">Custom retractable banners</p>
          <h1>Retractable banners<span className="product-hero-accent">Ready to roll.</span></h1>
          <p className="product-hero-description">Pull up your graphic at the booth, then roll it into the base when the show is over.</p>
          <div className="product-hero-actions">{action}</div>
          <div className="product-hero-delivery"><SpecialtyDeliveryStatus featured /></div>
        </div>
        <div className="product-hero-media">{photo}{offer.showBadge && <FirstOrderBadge />}</div>
      </div>
    </section>
  </>;
}
