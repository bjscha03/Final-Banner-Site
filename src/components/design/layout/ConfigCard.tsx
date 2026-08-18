import React, { useLayoutEffect, useRef } from 'react';
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

  useLayoutEffect(() => {
    if (id !== 'size-section' || !sectionRef.current) return;

    const presetButtons = Array.from(sectionRef.current.querySelectorAll<HTMLButtonElement>('button'));
    const popularButton = presetButtons.find((button) => {
      const label = (button.textContent || '').replace(/\s+/g, ' ').trim();
      return label === "6' × 3'" || label === '72" × 36"';
    });

    if (!popularButton) return;

    // Recommendation styling is visual only. It must not mutate dimensions,
    // pricing state, or the selected preset.
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
      'ring-1',
      'ring-orange-200',
    );
    popularButton.dataset.recommended = 'true';
    popularButton.setAttribute(
      'aria-label',
      `${(popularButton.textContent || "6' × 3'").trim()} — Most popular`,
    );
    popularButton.style.borderColor = '#f97316';
    popularButton.style.backgroundColor = '#fff7ed';
    popularButton.style.color = '#c2410c';
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
    </section>
  );
}