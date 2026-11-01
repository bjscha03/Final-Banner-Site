import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}

export default function QuantityStepper({ value, onChange, min, max, step = 1 }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const hintId = useId();
  const buttonClass = 'flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40';

  function edit(text: string) {
    const next = Number(text);
    if (text && Number.isInteger(next) && next >= min && next <= max && (next - min) % step === 0) {
      setDraft(null);
      onChange(next);
    } else {
      setDraft(text);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Decrease quantity" disabled={value <= min} className={buttonClass}
          onClick={() => onChange(Math.max(min, min + (Math.ceil((value - min) / step) - 1) * step))}>
          <Minus className="h-4 w-4 text-gray-600" />
        </button>
        <input type="number" inputMode="numeric" min={min} max={max} step={step} value={draft ?? value}
          aria-label="Quantity" aria-invalid={draft !== null} aria-describedby={draft !== null ? hintId : undefined}
          onChange={event => edit(event.target.value)} onBlur={() => setDraft(null)}
          className="h-11 w-20 rounded-xl border px-3 py-1.5 text-center text-base" />
        <button type="button" aria-label="Increase quantity" disabled={value >= max} className={buttonClass}
          onClick={() => onChange(Math.min(max, min + (Math.floor((value - min) / step) + 1) * step))}>
          <Plus className="h-4 w-4 text-gray-600" />
        </button>
      </div>
      {draft !== null && <p id={hintId} className="mt-1 text-xs text-orange-800">
        Enter {min}–{max}{step > 1 ? ` in increments of ${step}` : ' in whole numbers'}.
      </p>}
    </div>
  );
}
