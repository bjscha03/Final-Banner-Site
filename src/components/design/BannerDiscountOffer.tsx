import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Shared banner-only hero offer: the automatic 25% off for 6' x 3'+ banners,
 * plus the 20OFF code for smaller banners. Rendered on BOTH the /design
 * banner hero (DesignPageHero) and the /google-ads-banner hero
 * (FastBannerAdHero) so the two designers advertise the identical offer.
 *
 * Never render this for yard signs or car magnets — the offer is banner-only.
 */
const SMALL_BANNER_PROMO_CODE = '20OFF';
const SMALL_BANNER_PROMO_HEADLINE = 'Up to 25% off';
const SMALL_BANNER_PROMO_SUBLINE = "6' × 3' & larger banners save automatically. Smaller banners save 20% with code";

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

export interface BannerDiscountOfferProps {
  /** Extra classes for width/margin so callers can fit their own layout. */
  className?: string;
}

const BannerDiscountOffer: React.FC<BannerDiscountOfferProps> = ({ className = '' }) => {
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    const copied = await copyTextToClipboard(SMALL_BANNER_PROMO_CODE);
    if (!copied) return;
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <div
      data-banner-discount-offer
      className={`flex min-h-14 flex-col justify-center gap-1.5 rounded-md border border-white/80 bg-white px-5 py-2.5 text-[#061A31] shadow-[0_9px_20px_rgba(57,20,0,.18)] ${className}`}
    >
      <span className="homepage-condensed text-3xl font-black uppercase leading-none text-[#E95413] sm:text-4xl">
        {SMALL_BANNER_PROMO_HEADLINE}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E95413]/40 pt-1.5 text-[10px] font-bold uppercase leading-4">
        <span>{SMALL_BANNER_PROMO_SUBLINE}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={`Copy promo code ${SMALL_BANNER_PROMO_CODE}`}
          className="inline-flex items-center gap-1 rounded border border-[#E95413] px-1.5 py-0.5 font-black text-[#E95413] transition-colors hover:bg-[#E95413] hover:text-white"
        >
          {SMALL_BANNER_PROMO_CODE}
          {codeCopied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
        </button>
        <span className="sr-only" aria-live="polite">{codeCopied ? 'Copied' : ''}</span>
      </div>
    </div>
  );
};

export default BannerDiscountOffer;
