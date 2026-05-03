import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface SizeStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  className?: string;
}

/**
 * Always-visible size stepper component with mobile-optimized touch targets
 * Ensures +/- buttons are always visible and tappable with 44px minimum size.
 *
 * Input handling: uses an internal raw string buffer so the user's keystrokes
 * are preserved as-is while typing (no auto-prepended zeros, no cursor jumps).
 * The string is only parsed/clamped/converted to a number on blur, per the
 * dimension-input handling spec.
 */
export function SizeStepper({
  label,
  value,
  onChange,
  min = 1,
  max = 1000,
  step = 1,
  unit = '',
  className = ''
}: SizeStepperProps) {
  // Raw input string the user is typing. Kept in sync with `value` from props
  // when the value changes from outside (e.g. preset click, +/- buttons).
  const [inputStr, setInputStr] = useState<string>(
    Number.isFinite(value) && value > 0 ? String(value) : ''
  );

  useEffect(() => {
    const parsed = parseInt(inputStr, 10);
    if (parsed !== value) {
      setInputStr(Number.isFinite(value) && value > 0 ? String(value) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const decrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const increment = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only set the raw string. Do not parse/format/clamp during typing.
    setInputStr(e.target.value);
  };

  const handleInputBlur = () => {
    // On blur, validate, clamp, and propagate the numeric value.
    const parsed = parseInt(inputStr, 10);
    if (!Number.isFinite(parsed)) {
      setInputStr(String(min));
      onChange(min);
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    setInputStr(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {/* Decrement Button */}
        <button 
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="h-10 w-10 flex-shrink-0 rounded-md border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors touch-manipulation"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4 text-blue-600" />
        </button>

        {/* Input Field */}
        <div className="relative flex-1 min-w-[80px]">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="h-10 w-full min-w-[60px] rounded-md border border-slate-300 text-center font-medium tabular-nums text-slate-900 bg-white px-2 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
            value={inputStr}
            onChange={handleInputChange}
            onFocus={(e) => e.target.select()}
            onBlur={handleInputBlur}
            aria-label={`${label} value`}
          />
          {unit && (
            <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none font-medium">
              {unit}
            </span>
          )}
        </div>

        {/* Increment Button */}
        <button 
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="h-10 w-10 flex-shrink-0 rounded-md border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors touch-manipulation"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4 text-blue-600" />
        </button>
      </div>

    </div>
  );
}

export default SizeStepper;
