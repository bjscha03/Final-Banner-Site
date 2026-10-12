import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';

export default function MobileBannerLandingHero({ redesigned = false }: { redesigned?: boolean }) {
  if (!redesigned) return (
    <section data-testid="mobile-banner-hero" className="border-b-4 border-[#FF6A00] bg-[#061A31] px-4 py-3 text-white lg:hidden">
      <div className="mx-auto max-w-xl">
        <h1 className="font-sans text-[clamp(1.65rem,7vw,2rem)] font-extrabold leading-[1.12] tracking-[-0.025em]">
          Custom banners.<br /><span className="text-[#FF791F]">Without the wait.</span>
        </h1>
        <p className="mt-1 text-xs font-medium text-sky-200">Upload. Preview. Order.</p>
        <p className="mt-1 text-[11px] font-semibold text-orange-200">20% off your first order · Applied automatically</p>
        <HeroDeliveryStatus variant="arrival" className="mt-2" />
      </div>
    </section>
  );
  return (
    <section data-testid="mobile-banner-hero" className="bg-[#061A31] text-white lg:hidden">
      <div className="mx-auto max-w-xl">
        <div className="px-4 pb-3 pt-4">
        <h1 className="text-[clamp(1.75rem,7.8vw,2.5rem)] font-extrabold leading-[1.06] tracking-tight">
          Custom banners.<br /><span className="text-[#FF791F]">Without the wait.</span>
        </h1>
        <p className="mt-2 text-xs font-medium text-sky-100">Fast printing. Next-day air. Real results.</p>
        </div>
        <picture>
          <source type="image/avif" srcSet="/images/google-ads/banner-collage-520.avif 520w, /images/google-ads/banner-collage-800.avif 800w" sizes="(max-width: 576px) 100vw, 576px" />
          <img src="/images/google-ads/banner-collage-800.webp" alt="Custom Northline Coffee Co. grand opening banner" width="1040" height="748" fetchPriority="high" className="h-36 w-full object-cover object-top sm:h-48" />
        </picture>
        <div className="bg-white px-4 pt-3"><HeroDeliveryStatus variant="arrival" /></div>
      </div>
    </section>
  );
}

export function MobileBannerLandingProof() {
  return (
    <section data-testid="mobile-banner-proof" className="bg-[#061A31] px-4 py-5 text-white lg:hidden" aria-label="Banner examples">
      <div className="mx-auto max-w-xl">
        <h2 className="mb-3 text-xl font-bold">Made for your big moment</h2>
        <picture>
          <source type="image/avif" srcSet="/images/google-ads/banner-collage-520.avif 520w, /images/google-ads/banner-collage-800.avif 800w" sizes="(max-width: 640px) calc(100vw - 32px), 576px" />
          <img src="/images/google-ads/banner-collage-800.webp" alt="Custom banners for a coffee shop opening, soccer registration and a local market" width="1040" height="748" loading="lazy" className="h-auto w-full rounded-lg" />
        </picture>
      </div>
    </section>
  );
}
