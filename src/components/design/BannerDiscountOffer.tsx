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
  variant?: 'default' | 'light';
}

const BannerDiscountOffer: React.FC<BannerDiscountOfferProps> = ({ className = '', variant = 'default' }) => {
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    const copied = await copyTextToClipboard(SMALL_BANNER_PROMO_CODE);
    if (!copied) return;
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 2000);
  };

  if (variant === 'light') {
    return (
      <div data-banner-discount-offer className={`border-l-[3px] border-[#FF6A00] pl-4 text-[#061A31] ${className}`}>
        <p className="text-base font-bold leading-6 sm:text-lg"><span className="text-xl font-extrabold text-[#FF6A00] sm:text-2xl">25% OFF</span> banners 6′ × 3′ &amp; larger</p>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">Automatically applied. No code needed.</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
          <p>Smaller banners: save <strong>20%</strong> with code</p>
          <button type="button" onClick={handleCopyCode} aria-label={`Copy promo code ${SMALL_BANNER_PROMO_CODE}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#061A31] bg-white px-3 font-bold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2">
            {SMALL_BANNER_PROMO_CODE}
            {codeCopied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <span className="sr-only" aria-live="polite">{codeCopied ? 'Copied' : ''}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-banner-discount-offer
      className={`px-1 py-2 text-[#061A31] ${className}`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="shrink-0 text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">25% OFF</span>
        <div className="border-l border-[#061A31]/25 pl-3 text-sm leading-5 sm:pl-4">
          <p className="font-bold">Banners 6′ × 3′ &amp; larger</p>
          <p className="text-xs font-medium">Automatically applied. No code needed.</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#061A31]/20 pt-2">
        <p className="text-xs font-medium sm:text-sm">Smaller banners? <strong>Save 20%</strong> with</p>
        <button
          type="button"
          onClick={handleCopyCode}
          aria-label={`Copy promo code ${SMALL_BANNER_PROMO_CODE}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#061A31] px-3 text-xs font-bold text-white transition-colors hover:bg-[#12375c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {SMALL_BANNER_PROMO_CODE}
          {codeCopied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <span className="sr-only" aria-live="polite">{codeCopied ? 'Copied' : ''}</span>
      </div>
    </div>
  );
};

export default BannerDiscountOffer;
