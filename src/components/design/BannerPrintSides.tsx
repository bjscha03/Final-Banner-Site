import React, { useId } from 'react';
import { PRICE_PER_SQFT, usd } from '@/lib/pricing';

export default function BannerPrintSides({
  doubleSided,
  onChange,
  compact = false,
}: {
  doubleSided: boolean;
  onChange: (doubleSided: boolean) => void;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={compact ? 'min-w-0' : 'mt-5 min-w-0 border-t border-slate-200 pt-4'} aria-describedby={`${id}-help`}>
      <legend className="float-left mb-2 w-full text-sm font-semibold text-slate-700">Print sides</legend>
      <div className="clear-both grid grid-cols-2 gap-2 sm:gap-3">
        {[false, true].map((double) => (
          <label key={String(double)} className={`flex ${compact ? 'min-h-12 items-center' : 'min-h-20 items-start'} cursor-pointer gap-2 rounded-xl border-2 p-3 transition-colors sm:p-4 ${doubleSided === double ? 'border-[#18448D] bg-[#EAF1FB] text-[#0B1F3A]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'} focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2`}>
            <input
              type="radio"
              name={`${id}-print-sides`}
              value={double ? 'double' : 'single'}
              checked={doubleSided === double}
              onChange={() => onChange(double)}
              className="mt-1 h-4 w-4 shrink-0 accent-[#18448D]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold sm:text-base">{double ? 'Double-sided' : 'Single-sided'}</span>
              {!compact && <span className="mt-1 block text-xs leading-5 text-slate-600">{double ? 'Print on both sides' : 'Print on one side'}</span>}
            </span>
          </label>
        ))}
      </div>
      <p id={`${id}-help`} className={compact && !doubleSided ? 'sr-only' : 'mt-2 text-xs leading-5 text-slate-600'} aria-live="polite">
        {doubleSided
          ? `18 oz vinyl · ${usd(PRICE_PER_SQFT['18oz_double'])}/sq. ft. includes both sides. The same artwork and placement print on the front and back. Your total updates automatically.`
          : 'Single-sided printing. Choose your material below, or select double-sided for the same artwork on both sides.'}
      </p>
    </fieldset>
  );
}
