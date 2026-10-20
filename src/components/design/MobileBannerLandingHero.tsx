import CompactProductHero from '@/components/product/CompactProductHero';
import ProductionShippingBenefits from '@/components/delivery/ProductionShippingBenefits';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';

export default function MobileBannerLandingHero({ redesigned = false, halloween = false, showFirstOrderBadge = false }: { redesigned?: boolean; halloween?: boolean; showFirstOrderBadge?: boolean }) {
  if (!redesigned) return (
    <section data-testid="mobile-banner-hero" className="border-b border-[#e5dfd6] bg-[#f8f6f1] px-4 py-4 text-[#061A31] lg:hidden">
      <div className="mx-auto max-w-xl">
        <h1 className="font-sans text-[clamp(1.65rem,7vw,2rem)] font-[850] leading-[1.12] tracking-[-0.055em]">
          {halloween ? 'Halloween banners.' : 'Custom banners.'}<br /><span className="text-[var(--brand-orange)]">Without the wait.</span>
        </h1>
        <ProductionShippingBenefits />
        <p className="mt-1 text-xs font-medium text-slate-600">Upload. Preview. Order.</p>
        <p className="mt-1 text-[11px] font-semibold text-[#b84300]">20% off your first order · Applied automatically</p>
        <HeroDeliveryStatus variant="arrival" className="mt-2" />
      </div>
    </section>
  );
  return <CompactProductHero
    testId="mobile-banner-hero"
    title={halloween ? 'Halloween banners.' : 'Custom banners.'}
    accent="Without the wait."
    discount={showFirstOrderBadge}
    photo={<picture><img
      src={halloween ? '/images/product-heroes/halloween-banner-640.webp' : '/images/product-heroes/vinyl-banners-bold-640.webp'}
      srcSet={halloween ? '/images/product-heroes/halloween-banner-640.webp 640w, /images/product-heroes/halloween-banner-1440.webp 1440w' : '/images/product-heroes/vinyl-banners-bold-640.webp 640w, /images/product-heroes/vinyl-banners-bold-1440.webp 1440w'}
      sizes="(max-width: 640px) 100vw, 640px" width="1440" height="960" fetchPriority="high"
      alt={halloween ? 'Happy Halloween vinyl banner mounted with grommets on a wooden fence' : 'Custom printed vinyl banner displayed on a storefront railing, showing its full edges, grommets and mounting cords'}
    /></picture>}
  />;
}

export function MobileBannerLandingProof() {
  return (
    <section data-testid="mobile-banner-proof" className="bg-[#f8f6f1] px-4 py-5 text-[#061A31] lg:hidden" aria-label="Banner examples">
      <div className="mx-auto max-w-xl">
        <h2 className="mb-3 text-xl font-bold">Made for your big moment</h2>
        <picture>
          <img src="/images/product-heroes/vinyl-banners-bold-640.webp" srcSet="/images/product-heroes/vinyl-banners-bold-640.webp 640w, /images/product-heroes/vinyl-banners-bold-1440.webp 1440w" sizes="(max-width: 576px) 100vw, 576px" alt="FIELDWORK outdoor brand vinyl banner secured to a storefront railing" width="1440" height="960" loading="lazy" className="h-auto w-full rounded-lg" />
        </picture>
      </div>
    </section>
  );
}
