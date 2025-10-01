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
      <label className="block text-xs font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        {/* Decrement Button */}
        <button 
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="h-12 w-12 shrink-0 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 font-bold text-gray-700 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-200"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </button>

        {/* Input Field */}
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="h-12 w-full rounded-lg border border-gray-300 text-center font-medium tabular-nums text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 pr-6"
            value={value || ''}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            aria-label={`${label} value`}
          />
          {unit && (
            <span className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none font-medium">
              {unit}
            </span>
          )}
        </div>

        {/* Increment Button */}
        <button 
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="h-12 w-12 shrink-0 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 font-bold text-gray-700 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-200"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      
      {/* Value Range Indicator */}
      <div className="mt-1 text-xs text-gray-500 text-center">
        {min} - {max} {unit}
      </div>
    </div>
  );
}

export default SizeStepper;
