import React from 'react';

export interface StepHeaderProps {
  step: number;
  title: string;
  className?: string;
  rightSlot?: React.ReactNode;
}

/**
 * Numbered orange-circle section header used inside ConfigCard.
 * Pure presentational — no state, no logic.
 */
export default function StepHeader({ step, title, className, rightSlot }: StepHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold shadow-sm"
        >
          {step}
        </span>
        <h3 className="text-base md:text-lg font-bold text-slate-900">{title}</h3>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
