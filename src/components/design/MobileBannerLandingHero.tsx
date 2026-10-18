import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import GoogleReviewSpotlight from './GoogleReviewSpotlight';

export default function MobileBannerLandingHero({ redesigned = false, halloween = false }: { redesigned?: boolean; halloween?: boolean }) {
  if (!redesigned) return (
    <section data-testid="mobile-banner-hero" className="border-b border-[#e5dfd6] bg-[#f8f6f1] px-4 py-4 text-[#061A31] lg:hidden">
      <div className="mx-auto max-w-xl">
        <h1 className="font-sans text-[clamp(1.65rem,7vw,2rem)] font-extrabold leading-[1.12] tracking-[-0.025em]">
          {halloween ? 'Halloween banners.' : 'Custom banners.'}<br /><span className="text-[#061A31]">Without the wait.</span>
        </h1>
        <p className="mt-1 text-xs font-medium text-slate-600">Upload. Preview. Order.</p>
        <p className="mt-1 text-[11px] font-semibold text-[#b84300]">20% off your first order · Applied automatically</p>
        <HeroDeliveryStatus variant="arrival" className="mt-2" />
      </div>
    </section>
  );
  return (
    <section data-testid="mobile-banner-hero" className="bg-[#f8f6f1] text-[#061A31] lg:hidden">
      <div className="mx-auto max-w-xl">
        <div className="px-4 pb-3 pt-4">
        <h1 className="text-[clamp(1.75rem,7.8vw,2.5rem)] font-extrabold leading-[1.06] tracking-tight">
          {halloween ? 'Halloween banners.' : 'Custom banners.'}<br /><span className="text-[#061A31]">Without the wait.</span>
        </h1>
        <p className="mt-2 text-xs font-medium text-slate-600">{halloween ? 'For parties, haunted houses & trunk-or-treats.' : 'Fast printing. Next-day air. Real results.'}</p>
        </div>
        <picture>
          <img src={halloween ? "/images/product-heroes/halloween-banner-640.webp" : "/images/product-heroes/vinyl-banners-bold-640.webp"} srcSet={halloween ? "/images/product-heroes/halloween-banner-640.webp 640w, /images/product-heroes/halloween-banner-1440.webp 1440w" : "/images/product-heroes/vinyl-banners-bold-640.webp 640w, /images/product-heroes/vinyl-banners-bold-1440.webp 1440w"} sizes="(max-width: 576px) 100vw, 576px" alt={halloween ? "Happy Halloween witch-and-pumpkin vinyl banner with reinforced grommets mounted on a wooden fence" : "FIELDWORK mountain photography vinyl banner with bold white lettering and reinforced grommets"} width="1440" height="960" fetchPriority="high" className={halloween ? "h-auto w-full object-contain" : "h-36 w-full object-cover object-[center_58%] sm:h-48"} />
        </picture>
        <div className="bg-white px-4 pt-2">
          <HeroDeliveryStatus variant="arrival" condensed />
          <div className="mt-2"><GoogleReviewSpotlight /></div>
        </div>
      </div>
    </section>
  );
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
