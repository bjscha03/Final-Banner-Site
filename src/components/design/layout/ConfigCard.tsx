import React from 'react';
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
 *
 * Pure presentational — no state, no business logic. Existing handlers
 * and form controls are passed in as `children` unmodified.
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
  return (
    <section
      id={id}
      className={`bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-4 md:p-6 scroll-mt-24 ${className ?? ''}`}
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
