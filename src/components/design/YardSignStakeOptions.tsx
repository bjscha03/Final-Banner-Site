import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { usd } from '@/lib/pricing';
import { YARD_SIGN_MAX_QUANTITY, YARD_SIGN_MIN_QUANTITY, YARD_SIGN_STEP_STAKE_CENTS } from '@/lib/yard-sign-pricing';
import YardSignMockup from './YardSignMockup';

interface Props {
  totalQuantity: number;
  enabled: boolean;
  quantity: number;
  onEnabledChange: (enabled: boolean) => void;
  onQuantityChange: (quantity: number) => void;
  restorationKey?: string | null;
}

const matchedQuantity = (total: number) => Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, Math.trunc(total) || YARD_SIGN_MIN_QUANTITY));
const clampQuantity = (quantity: number) => Math.max(1, Math.min(YARD_SIGN_MAX_QUANTITY, Math.trunc(quantity) || 1));

export default function YardSignStakeOptions({ totalQuantity, enabled, quantity, onEnabledChange, onQuantityChange, restorationKey }: Props) {
  const groupName = useId();
  const [adjusting, setAdjusting] = useState(false);
  const previous = useRef({ totalQuantity, enabled, quantity, restorationKey });
  const matched = totalQuantity > 0 && quantity === totalQuantity;

  // Follow changes across all uploaded designs only while quantities match.
  // A custom quantity, a restored cart item, or switching stakes off is preserved.
  useEffect(() => {
    const old = previous.current;
    previous.current = { totalQuantity, enabled, quantity, restorationKey };
    if (old.restorationKey !== restorationKey) {
      setAdjusting(enabled && quantity !== matchedQuantity(totalQuantity));
      return;
    }
    if (enabled && old.enabled && totalQuantity !== old.totalQuantity && quantity === old.quantity && old.quantity === matchedQuantity(old.totalQuantity)) {
      const next = matchedQuantity(totalQuantity);
      if (next !== quantity) onQuantityChange(next);
    }
  }, [totalQuantity, enabled, quantity, restorationKey, onQuantityChange]);

  function select(withStakes: boolean) {
    if (withStakes && !enabled) onQuantityChange(matchedQuantity(totalQuantity));
    onEnabledChange(withStakes);
    if (!withStakes) setAdjusting(false);
  }

  return (
    <section id="yard-finishing-section" aria-labelledby={`${groupName}-title`} className="min-w-0 scroll-mt-32 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:scroll-mt-24 md:p-6">
      <h3 id={`${groupName}-title`} className="text-lg font-bold text-[#0B1F3A]">Choose your setup</h3>
      <p className="mb-4 mt-1 text-sm text-slate-600">Need stakes for ground display?</p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Yard sign stakes">
        {[true, false].map(withStakes => (
          <label key={String(withStakes)} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={groupName}
              value={withStakes ? 'with-stakes' : 'without-stakes'}
              checked={enabled === withStakes}
              onChange={() => select(withStakes)}
              onClick={() => { if (enabled === withStakes) onEnabledChange(withStakes); }}
              aria-label={withStakes ? 'With stakes' : 'Without stakes'}
              className="peer sr-only"
            />
            <div className="h-full rounded-xl border-2 border-slate-200 p-2.5 transition-colors hover:border-orange-300 peer-checked:border-orange-500 peer-checked:bg-orange-50/60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-orange-600 sm:p-3">
              <div className="mb-2 flex min-h-6 justify-end">
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${enabled === withStakes ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white'}`}>
                  {enabled === withStakes && <Check className="h-4 w-4" />}
                </span>
              </div>
              <YardSignMockup withStakes={withStakes} />
              <p className="mt-3 text-sm font-bold leading-snug text-[#0B1F3A] sm:text-base">{withStakes ? 'With stakes' : 'Without stakes'}</p>
              <p className="mt-1 min-h-9 text-xs leading-snug text-slate-600 sm:text-sm">{withStakes ? '1 wire H-stake per sign' : 'Printed signs only'}</p>
              <p className="mt-2 text-sm font-bold leading-snug text-orange-700">{withStakes ? `+${usd(YARD_SIGN_STEP_STAKE_CENTS / 100)} each` : 'No added cost'}</p>
            </div>
          </label>
        ))}
      </div>

      {enabled ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-orange-50 px-3 py-3">
            <div aria-live="polite" className="min-w-0">
              <p className="text-sm font-semibold text-orange-900">{matched ? `${totalQuantity} signs = ${quantity} stakes` : `${quantity} wire H-${quantity === 1 ? 'stake' : 'stakes'}`}</p>
              <p className="mt-0.5 text-xs text-slate-600">{totalQuantity === 0 ? quantity === YARD_SIGN_MIN_QUANTITY ? 'Matches your sign quantity after upload' : 'Custom stake quantity' : matched ? 'Matched to your sign quantity' : `Custom quantity for ${totalQuantity} signs`}</p>
            </div>
            <button type="button" aria-expanded={adjusting} aria-controls={`${groupName}-quantity`} onClick={() => setAdjusting(!adjusting)} className="min-h-11 text-xs font-semibold text-[#0B1F3A] underline underline-offset-2">{adjusting ? 'Done adjusting' : 'Adjust quantity'}</button>
          </div>
          {adjusting && (
            <div id={`${groupName}-quantity`} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${groupName}-input`} className="mr-1 text-sm text-slate-600">Stakes</label>
              <button type="button" aria-label="Decrease stakes" disabled={quantity <= 1} onClick={() => onQuantityChange(clampQuantity(quantity - 1))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <input id={`${groupName}-input`} type="number" inputMode="numeric" min={1} max={YARD_SIGN_MAX_QUANTITY} step={1} value={quantity} onChange={event => onQuantityChange(clampQuantity(Number(event.target.value)))} className="h-11 w-16 rounded-lg border border-slate-300 px-2 text-center text-base" />
              <button type="button" aria-label="Increase stakes" disabled={quantity >= YARD_SIGN_MAX_QUANTITY} onClick={() => onQuantityChange(clampQuantity(quantity + 1))} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              {!matched && totalQuantity > 0 && <button type="button" onClick={() => onQuantityChange(matchedQuantity(totalQuantity))} className="min-h-11 text-xs font-semibold text-orange-700 underline">Match sign quantity</button>}
            </div>
          )}
          <div className="flex items-start justify-between gap-2 border-t border-slate-100 pt-3" aria-live="polite">
            <div><p className="text-sm font-semibold text-[#0B1F3A]">Stakes subtotal</p><p className="text-xs text-slate-500">Before discounts and tax</p></div>
            <span className="text-lg font-bold text-[#0B1F3A]">{usd(quantity * YARD_SIGN_STEP_STAKE_CENTS / 100)}</span>
          </div>
        </div>
      ) : (
        <p role="status" className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600"><strong className="text-[#0B1F3A]">No stakes included.</strong> Choose “With stakes” if you need them for ground display.</p>
      )}
    </section>
  );
}
