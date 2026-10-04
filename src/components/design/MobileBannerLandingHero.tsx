import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';

/** Short mobile introduction: the next content on the page is the builder. */
export default function MobileBannerLandingHero() {
  return (
    <section data-testid="mobile-banner-hero" className="border-b-4 border-[#FF6A00] bg-[#061A31] px-4 py-4 text-white lg:hidden">
      <div className="mx-auto max-w-xl">
        <h1 className="homepage-condensed [--homepage-mobile-size:2.5rem] text-[2.5rem] font-black leading-[1.02] tracking-tight">
          Custom banners.<br /><span className="text-[#FF791F]">Without the wait.</span>
        </h1>
        <p className="mt-1.5 text-sm font-medium text-sky-200">Upload. Preview. Order.</p>
        <p className="mt-2 text-xs font-semibold text-orange-200">20% off your first order · Applied automatically</p>
        <HeroDeliveryStatus variant="arrival" className="mt-3" />
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
