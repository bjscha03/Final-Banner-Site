import React, { useState } from 'react';
import { ArrowRight, Check, Clock3, Copy, Layers3, Magnet, Monitor, Truck, type LucideIcon } from 'lucide-react';
import HeroDeliveryStatus from '@/components/delivery/HeroDeliveryStatus';
import type { ProductTypeSlug } from '@/lib/products';

interface DesignHeroOffer {
  /** Large headline number, e.g. "Up to 25% off". */
  headline: string;
  /** Supporting copy shown next to the headline. */
  subline: string;
  /** Promo code customers can copy for the smaller-banner tier. */
  code: string;
}

interface DesignHeroDefinition {
  productSlug: 'vinyl-banners' | 'yard-signs' | 'car-magnets';
  title: string[];
  cta: string;
  alt: string;
  benefits: Array<{ label: string; icon: LucideIcon }>;
  /** Promo pill shown next to the CTA. Omitted when there's no current offer. */
  offer?: DesignHeroOffer;
}

/**
 * Copies `text` to the clipboard, preferring the async Clipboard API and
 * falling back to a hidden textarea + execCommand for browsers/contexts
 * (e.g. non-HTTPS, older WebViews) where `navigator.clipboard` is unavailable.
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy fallback below.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

const DESIGN_HEROES: Record<ProductTypeSlug, DesignHeroDefinition> = {
  banner: {
    productSlug: 'vinyl-banners',
    title: ['Design it.', 'Preview it.', 'Print it.'],
    cta: 'Start your banner',
    alt: 'Banner design editor preview beside the finished Northline Coffee grand opening banner',
    benefits: [
      { label: '24-hour standard production', icon: Clock3 },
      { label: 'Free next-day air after production', icon: Truck },
      { label: 'Live print preview', icon: Monitor },
    ],
    offer: {
      headline: 'Up to 25% off',
      subline: "6' × 3' & larger banners save automatically. Smaller banners save 20% with code",
      code: '20OFF',
    },
  },
  yard_sign: {
    productSlug: 'yard-signs',
    title: ['Design it.', 'Preview it.', 'Stake it.'],
    cta: 'Start your yard signs',
    alt: 'Custom open house yard sign displayed in a front lawn',
    benefits: [
      { label: '24 × 18 corrugated plastic', icon: Layers3 },
      { label: 'Single- or double-sided printing', icon: Monitor },
      { label: 'Optional step stakes', icon: Clock3 },
    ],
  },
  car_magnet: {
    productSlug: 'car-magnets',
    title: ['Design it.', 'Preview it.', 'Drive it.'],
    cta: 'Start your car magnets',
    alt: 'Custom home services car magnet installed on a gray service vehicle',
    benefits: [
      { label: 'Four supported sizes', icon: Layers3 },
      { label: 'Square or rounded corners', icon: Magnet },
      { label: 'Live print preview', icon: Monitor },
    ],
  },
};

interface SceneProps {
  definition: DesignHeroDefinition;
  className: string;
}

const DesignScene: React.FC<SceneProps> = ({ definition, className }) => {
  const { productSlug } = definition;
  const directory = productSlug === 'vinyl-banners' ? 'design-heroes' : 'product-heroes';

  return (
    <picture className={className}>
      <source media="(max-width: 1023px)" type="image/avif" srcSet={`/images/${directory}/${productSlug}-mobile-640.avif 640w`} sizes="100vw" />
      <source media="(max-width: 1023px)" type="image/webp" srcSet={`/images/${directory}/${productSlug}-mobile-640.webp 640w`} sizes="100vw" />
      <source type="image/avif" srcSet={`/images/${directory}/${productSlug}-720.avif 720w, /images/${directory}/${productSlug}-1100.avif 1100w`} sizes="61vw" />
      <source type="image/webp" srcSet={`/images/${directory}/${productSlug}-720.webp 720w, /images/${directory}/${productSlug}-1100.webp 1100w`} sizes="61vw" />
      <img
        src={`/images/${directory}/${productSlug}-1100.webp`}
        alt={definition.alt}
        width="1100"
        height="690"
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        className="h-full w-full object-cover object-center"
      />
    </picture>
  );
};

interface DesignPageHeroProps {
  productType: ProductTypeSlug;
  onStart: () => void;
}

const DesignPageHero: React.FC<DesignPageHeroProps> = ({ productType, onStart }) => {
  const definition = DESIGN_HEROES[productType];
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async (code: string) => {
    const copied = await copyTextToClipboard(code);
    if (!copied) return;
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <section data-design-page-hero={productType} className="relative isolate overflow-hidden border-t-4 border-[#F45B08] bg-[#E95413] text-white">
      <DesignScene definition={definition} className="absolute inset-y-0 right-0 hidden w-[62%] lg:block" />
      <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,#E95413_0%,#E95413_32%,rgba(233,84,19,.97)_43%,rgba(233,84,19,.68)_54%,rgba(233,84,19,.08)_70%,transparent_82%)] lg:block" aria-hidden="true" />
      <div className="absolute inset-0 hidden bg-[radial-gradient(circle_at_13%_18%,rgba(255,179,62,.36),transparent_34%)] lg:block" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1740px] items-center px-5 py-10 sm:px-8 sm:py-12 lg:min-h-[650px] lg:px-12 lg:py-14 xl:px-16">
        <div className="max-w-[610px] lg:w-[43%]">
          <h1 className="homepage-condensed [--homepage-mobile-size:clamp(4.1rem,19vw,5.5rem)] text-[5.5rem] font-black uppercase leading-[0.83] tracking-[-0.015em] text-white drop-shadow-[0_3px_0_rgba(6,26,49,.12)] sm:text-[6.8rem] lg:text-[7.2rem]">
            {definition.title.map((line) => <span key={line} className="block">{line}</span>)}
          </h1>

          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-14 items-center justify-center gap-4 rounded-md bg-[#061A31] px-7 py-3.5 text-sm font-black uppercase tracking-[0.035em] text-white shadow-[0_12px_30px_rgba(6,26,49,.22)] transition-colors hover:bg-[#0C2B50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:text-base"
            >
              {definition.cta}<ArrowRight className="h-5 w-5" aria-hidden="true" />
            </button>
            {definition.offer && (
              <div className="flex min-h-14 flex-col justify-center gap-1.5 rounded-md border border-white/80 bg-white px-5 py-2.5 text-[#061A31] shadow-[0_9px_20px_rgba(57,20,0,.18)] sm:max-w-[340px]">
                <span className="homepage-condensed text-3xl font-black uppercase leading-none text-[#E95413] sm:text-4xl">
                  {definition.offer.headline}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E95413]/40 pt-1.5 text-[10px] font-bold uppercase leading-4">
                  <span>{definition.offer.subline}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(definition.offer!.code)}
                    aria-label={`Copy promo code ${definition.offer.code}`}
                    className="inline-flex items-center gap-1 rounded border border-[#E95413] px-1.5 py-0.5 font-black text-[#E95413] transition-colors hover:bg-[#E95413] hover:text-white"
                  >
                    {definition.offer.code}
                    {codeCopied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <HeroDeliveryStatus className="mt-5 w-full max-w-[585px]" />
        </div>
      </div>

      <DesignScene definition={definition} className="relative block aspect-[4/3] w-full overflow-hidden border-t border-[#061A31]/20 lg:hidden" />

      <div className="relative z-20 bg-[#061A31] text-white">
        <ul className="mx-auto grid max-w-[1740px] divide-y divide-[#F45B08]/80 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-8 lg:px-12 xl:px-16" aria-label="Product ordering benefits">
          {definition.benefits.map(({ label, icon: Icon }) => (
            <li key={label} className="flex min-h-[72px] items-center gap-4 py-4 sm:justify-center sm:px-6 lg:min-h-[88px] lg:gap-5">
              <Icon className="h-7 w-7 flex-none stroke-[1.7] text-[#F45B08] lg:h-9 lg:w-9" aria-hidden="true" />
              <span className="text-xs font-bold uppercase leading-5 tracking-[0.02em] lg:text-sm">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default DesignPageHero;
