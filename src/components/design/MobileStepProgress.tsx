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
  const { current, total, label, completed, isComplete } = progress;
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
      <ol className="mt-2 flex items-center gap-1.5" aria-hidden="true">
        {BUILDER_STEPS.map((key, i) => {
          const isDone = completed[key];
          const isCurrent = !isComplete && i + 1 === safeCurrent;
          const stepLabel = STEP_LABEL_FOR(key);
          const dotClass = isDone
            ? 'bg-gray-100 text-gray-500 border-gray-300'
            : isCurrent
              ? 'bg-white text-orange-600 border-orange-500'
              : 'bg-white text-gray-400 border-gray-300';
          return (
            <li key={key} className="flex-1 flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={onStepClick ? () => onStepClick(key) : undefined}
                disabled={!onStepClick}
                title={stepLabel}
                aria-label={stepLabel}
                className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold transition-colors ${dotClass} ${onStepClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default'}`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </button>
              {i < BUILDER_STEPS.length - 1 && (
                <span
                  className={`flex-1 h-0.5 rounded-full ${completed[key] ? 'bg-gray-300' : 'bg-gray-200'}`}
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
