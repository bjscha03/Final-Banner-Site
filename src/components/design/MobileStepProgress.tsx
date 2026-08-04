import React from 'react';
import { Check } from 'lucide-react';
import {
  BUILDER_STEPS,
  type BuilderProgress,
  type BuilderStepKey,
  STEP_LABEL_FOR,
} from '@/lib/builderSteps';

interface MobileStepProgressProps {
  progress: BuilderProgress;
  /** Optional: tap a step pill to scroll to that section. */
  onStepClick?: (key: BuilderStepKey) => void;
  className?: string;
}

/**
 * Compact mobile-only progress indicator rendered above the builder.
 *
 * Shows "Step X of N: <label>" plus a row of small dots / checks so
 * users always know where they are in the flow. Driven entirely by
 * `getProgress()` from `@/lib/builderSteps` so it can never disagree
 * with the sticky CTA.
 *
 * Hidden on `md+` (the desktop layout already shows numbered
 * `ConfigCard` headers for every step).
 */
const MobileStepProgress: React.FC<MobileStepProgressProps> = ({
  progress,
  onStepClick,
  className,
}) => {
  const { steps, current, total, label, isComplete } = progress;
  const safeCurrent = Math.min(current, total);

  return (
    <div
      className={`md:hidden bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-label={isComplete ? `Complete — ${label}` : `Step ${safeCurrent} of ${total}: ${label}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">
          {isComplete ? (
            <>Complete</>
          ) : (
            <>Step <span className="text-gray-900 font-semibold">{safeCurrent}</span> of {total}</>
          )}
        </p>
        <p className="text-xs font-semibold text-orange-600 truncate">{label}</p>
      </div>
      <ol className="mt-3 flex items-center gap-1.5" aria-label="Order progress">
        {steps.map((key, i) => {
          // A progress bar should read left-to-right. Even if a shopper uploads
          // artwork early, later steps stay numbered until every preceding
          // required step has been reviewed.
          const isDone = isComplete || i + 1 < safeCurrent;
          const isCurrent = !isComplete && i + 1 === safeCurrent;
          const stepLabel = STEP_LABEL_FOR(key);
          const stateLabel = isDone ? 'completed' : isCurrent ? 'current step' : 'not completed';
          const dotClass = isDone
            ? 'border-[#18448D] bg-[#18448D] text-white'
            : isCurrent
              ? 'border-[#FF6A00] bg-[#FFF7F1] text-[#D95300] ring-2 ring-[#FF6A00]/15'
              : 'border-slate-300 bg-white text-slate-500';
          return (
            <li key={key} className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={onStepClick ? () => onStepClick(key) : undefined}
                disabled={!onStepClick}
                title={stepLabel}
                aria-label={`Step ${i + 1}, ${stepLabel}, ${stateLabel}`}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${dotClass} ${onStepClick ? 'cursor-pointer hover:border-[#18448D] active:scale-95' : 'cursor-default'}`}
              >
                {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-0.5 flex-1 rounded-full ${isDone ? 'bg-[#18448D]' : 'bg-slate-200'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default MobileStepProgress;
