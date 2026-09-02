import React, { useLayoutEffect, useRef, useState } from 'react';
import { isQualifyingLargeBannerDimensions } from '@/lib/largeBannerPromotion';
import StepHeader from './StepHeader';

export interface ConfigCardProps {
  step?: number;
  title?: string;
  headerRight?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Optional DOM id for the underlying <section>, used as a scroll anchor by the mobile sticky CTA. */
  id?: string;
  children: React.ReactNode;
}

function parsePresetDimensions(label: string): { widthIn: number; heightIn: number } | null {
  const normalized = label.replace(/\s+/g, ' ').trim();
  const feetMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:'|′)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(?:'|′)$/);
  if (feetMatch) {
    return {
      widthIn: Number(feetMatch[1]) * 12,
      heightIn: Number(feetMatch[2]) * 12,
    };
  }

  const inchesMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:"|″)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(?:"|″)$/);
  if (inchesMatch) {
    return {
      widthIn: Number(inchesMatch[1]),
      heightIn: Number(inchesMatch[2]),
    };
  }

  return null;
}

/**
 * White card wrapper used by the redesigned configurator. Renders an
 * optional numbered StepHeader at the top, followed by the children
 * inside a soft-bordered, rounded, lightly-shadowed card.
 */
export default function ConfigCard({
  step,
  title,
  headerRight,
  className,
  bodyClassName,
  id,
  children,
}: ConfigCardProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasLargeBannerOffer, setHasLargeBannerOffer] = useState(false);

  useLayoutEffect(() => {
    if (id !== 'size-section' || !sectionRef.current) {
      setHasLargeBannerOffer(false);
      return;
    }

    const presetButtons = Array.from(sectionRef.current.querySelectorAll<HTMLButtonElement>('button'));

    // Remove previously injected bubbles before reading button text. This
    // keeps the effect idempotent when the user switches between feet/inches
    // or when React re-renders selection styling.
    presetButtons.forEach((button) => {
      button.querySelectorAll<HTMLElement>('[data-large-banner-discount-badge="true"]')
        .forEach((badge) => badge.remove());
      delete button.dataset.largeBannerEligible;
    });

    let foundQualifyingPreset = false;
    let popularButton: HTMLButtonElement | null = null;

    presetButtons.forEach((button) => {
      const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
      const dimensions = parsePresetDimensions(label);
      if (!dimensions) return;

      const isPopular = (
        dimensions.widthIn === 72 && dimensions.heightIn === 36
      ) || (
        dimensions.widthIn === 36 && dimensions.heightIn === 72
      );
      if (isPopular) popularButton = button;

      const isEligible = isQualifyingLargeBannerDimensions(
        dimensions.widthIn,
        dimensions.heightIn,
        'banner',
      );

      let ariaLabel = label;
      if (isPopular) ariaLabel += ' — Most popular';

      if (isEligible) {
        foundQualifyingPreset = true;
        button.dataset.largeBannerEligible = 'true';
        button.classList.add('relative', 'overflow-visible');
        ariaLabel += ' — 25% off automatically';

        const badge = document.createElement('span');
        badge.dataset.largeBannerDiscountBadge = 'true';
        badge.setAttribute('aria-hidden', 'true');
        badge.className = 'pointer-events-none absolute -right-2.5 -top-3.5 z-20 flex h-9 w-9 flex-col items-center justify-center rounded-full border-2 border-white bg-[#FF6A00] text-center text-[8px] font-black uppercase leading-[0.9] tracking-[-0.02em] text-white shadow-md';

        const percentage = document.createElement('span');
        percentage.textContent = '25%';
        const off = document.createElement('span');
        off.textContent = 'OFF';
        badge.append(percentage, off);
        button.appendChild(badge);
      }

      button.setAttribute('aria-label', ariaLabel);
    });

    if (popularButton) {
      // The recommendation badge is informational only. Selection styling must
      // remain entirely controlled by the preset button's React state so only
      // the option the customer actually chose is highlighted.
      popularButton.classList.remove('ring-1', 'ring-orange-200');
      popularButton.style.removeProperty('border-color');
      popularButton.style.removeProperty('background-color');
      popularButton.style.removeProperty('color');
      popularButton.classList.add(
        'relative',
        "before:content-['MOST_POPULAR']",
        'before:absolute',
        'before:-top-2.5',
        'before:left-1/2',
        'before:-translate-x-1/2',
        'before:whitespace-nowrap',
        'before:rounded-full',
        'before:bg-orange-500',
        'before:px-1.5',
        'before:py-0.5',
        'before:text-[9px]',
        'before:font-bold',
        'before:leading-none',
        'before:text-white',
        'before:shadow-sm',
        'before:z-10',
      );
      popularButton.dataset.recommended = 'true';
    }

    setHasLargeBannerOffer(foundQualifyingPreset);
  });

  const body = (
    <>
      {children}
      {id === 'size-section' && hasLargeBannerOffer ? (
        <p
          data-testid="large-banner-discount-size-note"
          className="mt-3 text-[11px] font-semibold leading-snug text-[#E95413]"
        >
          All banners 6′ × 3′ and up are 25% off!
        </p>
      ) : null}
    </>
  );

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-4 md:p-6 scroll-mt-32 md:scroll-mt-24 ${className ?? ''}`}
    >
      {typeof step === 'number' && title ? (
        <>
          <StepHeader step={step} title={title} rightSlot={headerRight} />
          <div className={`mt-4 ${bodyClassName ?? ''}`}>{body}</div>
        </>
      ) : (
        <div className={bodyClassName}>{body}</div>
      )}
    </section>
  );
}
