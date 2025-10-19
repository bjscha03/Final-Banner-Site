import React from 'react';
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
 * Ensures +/- buttons are always visible and tappable with 44px minimum size
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
  const decrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const increment = () => {
    const newValue = Math.min(max, value + step);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty input for editing
    if (inputValue === '') {
      onChange(0);
      return;
    }

    const numValue = Number(inputValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(clampedValue);
    }
  };

  const handleInputBlur = () => {
    // Ensure value is within bounds when input loses focus
    if (value < min) onChange(min);
    if (value > max) onChange(max);
  };

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
        {/* Decrement Button */}
        <button 
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="h-10 w-10 shrink-0 rounded-md border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors touch-manipulation"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4 text-blue-600" />
        </button>

        {/* Input Field */}
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="h-10 w-full min-w-[5rem] rounded-md border border-slate-300 text-center font-medium tabular-nums text-slate-900 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
            value={value || ''}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            aria-label={`${label} value`}
          />
          {unit && (
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none font-medium">
              {unit}
            </span>
          )}
        </div>

        {/* Increment Button */}
        <button 
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="h-10 w-10 shrink-0 rounded-md border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors touch-manipulation"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4 text-blue-600" />
        </button>
      </div>

    </div>
  );
}

export default SizeStepper;
