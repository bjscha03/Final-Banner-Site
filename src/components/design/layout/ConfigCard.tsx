import React, { useLayoutEffect, useRef, useState } from 'react';
import StepHeader from './StepHeader';
import { isLargeBannerPromoEligible } from '@/lib/discount-resolver';

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

const POPULAR_BADGE_CLASSES = [
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
] as const;

const DISCOUNT_BADGE_CLASSES = [
  'relative',
  "after:content-['25%_OFF']",
  'after:absolute',
  'after:-top-2.5',
  'after:-right-2.5',
  'after:flex',
  'after:h-9',
  'after:w-9',
  'after:items-center',
  'after:justify-center',
  'after:rounded-full',
  'after:bg-orange-500',
  'after:px-1',
  'after:text-center',
  'after:text-[9px]',
  'after:font-extrabold',
  'after:leading-[10px]',
  'after:text-white',
  'after:shadow-md',
  'after:ring-2',
  'after:ring-white',
  'after:z-20',
] as const;

const BANNER_PRESET_KEYS = new Set([
  '48x24',
  '72x24',
  '72x36',
  '96x36',
  '96x48',
  '120x48',
]);

function parsePresetDimensions(label: string): { widthIn: number; heightIn: number } | null {
  const normalized = label.replace(/\s+/g, ' ').trim();
  const feet = normalized.match(/(\d+(?:\.\d+)?)\s*['′]\s*[×x]\s*(\d+(?:\.\d+)?)\s*['′]/i);
  if (feet) {
    return {
      widthIn: Number(feet[1]) * 12,
      heightIn: Number(feet[2]) * 12,
    };
  }

  const inches = normalized.match(/(\d+(?:\.\d+)?)\s*["″]\s*[×x]\s*(\d+(?:\.\d+)?)\s*["″]/i);
  if (inches) {
    return {
      widthIn: Number(inches[1]),
      heightIn: Number(inches[2]),
    };
  }
  return null;
}

/**
 * White card wrapper used by the redesigned configurator. The size card also
 * enhances preset buttons with recommendation/promotion badges. Badge
 * eligibility calls the exact same centralized dimension rule as pricing.
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
  const [showLargeBannerPromoMessage, setShowLargeBannerPromoMessage] = useState(false);

  useLayoutEffect(() => {
    if (id !== 'size-section' || !sectionRef.current) {
      setShowLargeBannerPromoMessage(false);
      return;
    }

    const presetButtons = Array.from(sectionRef.current.querySelectorAll<HTMLButtonElement>('button'));
    let recognizedBannerPresetCount = 0;

    presetButtons.forEach((button) => {
      const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
      const dimensions = parsePresetDimensions(label);
      if (dimensions && BANNER_PRESET_KEYS.has(`${dimensions.widthIn}x${dimensions.heightIn}`)) {
        recognizedBannerPresetCount += 1;
      }

      button.classList.remove(...DISCOUNT_BADGE_CLASSES);
      delete button.dataset.largeBannerPromoEligible;

      if (dimensions && isLargeBannerPromoEligible(dimensions.widthIn, dimensions.heightIn)) {
        button.classList.add(...DISCOUNT_BADGE_CLASSES);
        button.dataset.largeBannerPromoEligible = 'true';
      }
    });

    const popularButton = presetButtons.find((button) => {
      const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
      return label === "6' × 3'" || label === '72" × 36"';
    });

    if (popularButton) {
      // The recommendation badge is informational only. Selection styling must
      // remain entirely controlled by React state.
      popularButton.classList.remove('ring-1', 'ring-orange-200');
      popularButton.style.removeProperty('border-color');
      popularButton.style.removeProperty('background-color');
      popularButton.style.removeProperty('color');
      popularButton.classList.add(...POPULAR_BADGE_CLASSES);
      popularButton.dataset.recommended = 'true';
    }

    presetButtons.forEach((button) => {
      const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
      const descriptors: string[] = [];
      if (button.dataset.recommended === 'true') descriptors.push('Most popular');
      if (button.dataset.largeBannerPromoEligible === 'true') descriptors.push('25% off');
      if (descriptors.length > 0) {
        button.setAttribute('aria-label', `${label} — ${descriptors.join(', ')}`);
      } else if (button.getAttribute('aria-label')?.includes('25% off')) {
        button.setAttribute('aria-label', label);
      }
    });

    // Requiring several known banner presets prevents this marketing note from
    // appearing on yard-sign or car-magnet size cards that reuse ConfigCard.
    setShowLargeBannerPromoMessage(recognizedBannerPresetCount >= 3);
  });

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-4 md:p-6 scroll-mt-32 md:scroll-mt-24 ${className ?? ''}`}
    >
      {typeof step === 'number' && title ? (
        <>
          <StepHeader step={step} title={title} rightSlot={headerRight} />
          <div className={`mt-4 ${bodyClassName ?? ''}`}>{children}</div>
        </>
      ) : (
        <div className={bodyClassName}>{children}</div>
      )}

      {showLargeBannerPromoMessage && (
        <div
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center text-xs font-semibold text-orange-700"
          data-testid="large-banner-promo-message"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border border-orange-400 text-[12px] font-bold"
          >
            i
          </span>
          <span>All banners 6′ × 3′ and up are 25% off!</span>
        </div>
      )}
    </section>
  );
}
