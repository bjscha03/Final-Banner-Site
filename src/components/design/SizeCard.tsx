import React, { useState, useEffect } from 'react';
import { Minus, Plus, Ruler } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { formatArea, formatDimensions, inchesToSqFt } from '@/lib/pricing';
import { Input } from '@/components/ui/input';
import {
  type DimensionUnit,
  inchesToFeet,
  feetToInches,
  formatDimensionInUnit,
} from '@/lib/dimensions/units';

const SizeCard: React.FC = () => {
  const { widthIn, heightIn, set } = useQuoteStore();
  // Initialize the displayed input strings in feet to match the default
  // unit below. The useEffect that mirrors store -> input keeps them in
  // sync if the store value or unit changes.
  const [widthInput, setWidthInput] = useState(() =>
    Number(inchesToFeet(widthIn).toFixed(2)).toString()
  );
  const [heightInput, setHeightInput] = useState(() =>
    Number(inchesToFeet(heightIn).toFixed(2)).toString()
  );
  const [widthError, setWidthError] = useState('');
  const [heightError, setHeightError] = useState('');
  // UI-only unit toggle. Internal store always uses inches so pricing,
  // cart, and print pipelines see no change. Default to feet for the
  // friendlier "4 ft × 2 ft" presentation; inches remain selectable.
  const [unit, setUnit] = useState<DimensionUnit>('ft');

  // Trim trailing zeros so 4 ft displays as "4" not "4.000"
  const formatForInput = (n: number): string => {
    if (!Number.isFinite(n)) return '';
    return Number(n.toFixed(2)).toString();
  };


  // Update local state when store values change OR when the displayed unit changes.
  // Local input strings always reflect the value in the *currently displayed* unit;
  // the store always holds inches.
  useEffect(() => {
    if (unit === 'ft') {
      setWidthInput(formatForInput(inchesToFeet(widthIn)));
      setHeightInput(formatForInput(inchesToFeet(heightIn)));
    } else {
      setWidthInput(widthIn.toString());
      setHeightInput(heightIn.toString());
    }
  }, [widthIn, heightIn, unit]);

  // Debounced update to store. Always stores inches, regardless of unit.
  useEffect(() => {
    const timer = setTimeout(() => {
      const enteredW = parseFloat(widthInput);
      const enteredH = parseFloat(heightInput);
      if (!Number.isFinite(enteredW) || !Number.isFinite(enteredH)) return;
      const widthInches = unit === 'ft' ? feetToInches(enteredW) : enteredW;
      const heightInches = unit === 'ft' ? feetToInches(enteredH) : enteredH;
      if (
        widthInches >= 1 && widthInches <= 1000 &&
        heightInches >= 1 && heightInches <= 1000
      ) {
        set({ widthIn: widthInches, heightIn: heightInches });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [widthInput, heightInput, unit, set]);

  // Bounds in the currently displayed unit. Both units share a 1 lower
  // bound (1 in / 1 ft) since 1 in is the inch-side minimum and 1 ft is
  // a sensible smallest custom banner.
  const minDisplay = 1;
  const maxDisplay = unit === 'ft' ? 83 : 1000;   // 83 ft (~996 in) / 1000 in
  const unitLabel = unit === 'ft' ? 'ft' : 'inches';

  const validateAndSetWidth = (value: string) => {
    setWidthInput(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < minDisplay || num > maxDisplay) {
      setWidthError(`Width must be between ${minDisplay} and ${maxDisplay} ${unitLabel}`);
    } else {
      setWidthError('');
    }
  };

  const validateAndSetHeight = (value: string) => {
    setHeightInput(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < minDisplay || num > maxDisplay) {
      setHeightError(`Height must be between ${minDisplay} and ${maxDisplay} ${unitLabel}`);
    } else {
      setHeightError('');
    }
  };

  const adjustWidth = (delta: number) => {
    // delta is in displayed units (1 in or 1 ft)
    const currentDisplay = unit === 'ft' ? inchesToFeet(widthIn) : widthIn;
    const nextDisplay = Math.max(minDisplay, Math.min(maxDisplay, currentDisplay + delta));
    const nextInches = unit === 'ft' ? feetToInches(nextDisplay) : nextDisplay;
    const clamped = Math.max(1, Math.min(1000, nextInches));
    setWidthInput(formatForInput(nextDisplay));
    set({ widthIn: clamped });
  };

  const adjustHeight = (delta: number) => {
    const currentDisplay = unit === 'ft' ? inchesToFeet(heightIn) : heightIn;
    const nextDisplay = Math.max(minDisplay, Math.min(maxDisplay, currentDisplay + delta));
    const nextInches = unit === 'ft' ? feetToInches(nextDisplay) : nextDisplay;
    const clamped = Math.max(1, Math.min(1000, nextInches));
    setHeightInput(formatForInput(nextDisplay));
    set({ heightIn: clamped });
  };

  const handleWidthBlur = () => {
    const num = parseFloat(widthInput);
    if (isNaN(num) || num < minDisplay) {
      setWidthInput(String(minDisplay));
      const inches = unit === 'ft' ? feetToInches(minDisplay) : minDisplay;
      set({ widthIn: inches });
    } else if (num > maxDisplay) {
      setWidthInput(String(maxDisplay));
      const inches = unit === 'ft' ? feetToInches(maxDisplay) : maxDisplay;
      set({ widthIn: inches });
    }
  };

  const handleHeightBlur = () => {
    const num = parseFloat(heightInput);
    if (isNaN(num) || num < minDisplay) {
      setHeightInput(String(minDisplay));
      const inches = unit === 'ft' ? feetToInches(minDisplay) : minDisplay;
      set({ heightIn: inches });
    } else if (num > maxDisplay) {
      setHeightInput(String(maxDisplay));
      const inches = unit === 'ft' ? feetToInches(maxDisplay) : maxDisplay;
      set({ heightIn: inches });
    }
  };

  const handleReset = () => {
    setWidthError('');
    setHeightError('');
    set({ widthIn: 48, heightIn: 24 });
    if (unit === 'ft') {
      setWidthInput('4');
      setHeightInput('2');
    } else {
      setWidthInput('48');
      setHeightInput('24');
    }
  };

  const area = inchesToSqFt(widthIn, heightIn);

  return (
    <div className="modern-card p-4 md:p-6 lg:p-8">
      <div className="flex items-center space-x-2 md:space-x-3 mb-4 md:mb-6">
        <div className="p-1.5 md:p-2 bg-white rounded-xl">
          <Ruler className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
        </div>
        <h3 className="text-lg md:text-xl font-bold text-slate-900">📐 Choose Size</h3>
      </div>

      {/* Unit toggle (Feet / Inches). Internal storage stays in inches —
          pricing, cart, and print pipelines never see feet. */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Unit</span>
        <div
          role="group"
          aria-label="Dimension unit"
          className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5"
        >
          <button
            type="button"
            onClick={() => setUnit('in')}
            aria-pressed={unit === 'in'}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              unit === 'in' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Inches
          </button>
          <button
            type="button"
            onClick={() => setUnit('ft')}
            aria-pressed={unit === 'ft'}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              unit === 'ft' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Feet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Width ({unit === 'ft' ? 'feet' : 'inches'})
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjustWidth(-1)}
              disabled={widthIn <= 1}
              className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Minus className="h-4 w-4 text-blue-600" />
            </button>
            <Input
              type="number"
              value={widthInput}
              onChange={(e) => validateAndSetWidth(e.target.value)}
              onBlur={handleWidthBlur}
              className="flex-1 min-w-[5rem] text-center bg-white border border-slate-300 rounded-md px-4 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
              min={minDisplay}
              max={maxDisplay}
              step={1}
            />
            <button
              onClick={() => adjustWidth(1)}
              disabled={widthIn >= 1000}
              className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Plus className="h-4 w-4 text-blue-600" />
            </button>
          </div>
          {widthError && (
            <p className="text-xs text-red-500 mt-1">{widthError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Height ({unit === 'ft' ? 'feet' : 'inches'})
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjustHeight(-1)}
              disabled={heightIn <= 1}
              className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Minus className="h-4 w-4 text-blue-600" />
            </button>
            <Input
              type="number"
              value={heightInput}
              onChange={(e) => validateAndSetHeight(e.target.value)}
              onBlur={handleHeightBlur}
              className="flex-1 min-w-[5rem] text-center bg-white border border-slate-300 rounded-md px-4 py-2 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
              min={minDisplay}
              max={maxDisplay}
              step={1}
            />
            <button
              onClick={() => adjustHeight(1)}
              disabled={heightIn >= 1000}
              className="h-10 w-10 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Plus className="h-4 w-4 text-blue-600" />
            </button>
          </div>
          {heightError && (
            <p className="text-xs text-red-500 mt-1">{heightError}</p>
          )}
        </div>
      </div>

      {/* Equivalent in the other unit (always in inches alongside feet). */}
      <p className="mb-4 text-xs text-gray-500">
        Equivalent:{' '}
        <span className="font-medium text-gray-700">
          {formatDimensionInUnit(widthIn, unit === 'ft' ? 'in' : 'ft')} ×{' '}
          {formatDimensionInUnit(heightIn, unit === 'ft' ? 'in' : 'ft')}
        </span>
      </p>

      {/* Reset Button */}
      <div className="mb-4">
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors duration-200 text-sm font-medium"
        >
          <span className="hidden sm:inline">Reset to Defaults (4' × 2')</span>
          <span className="sm:hidden">Reset to Defaults</span>
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-center">
        <p className="text-xs sm:text-sm text-gray-600 mb-1">
          Total area: <span className="font-semibold">{formatArea(area)}</span>
        </p>
        <p className="text-base sm:text-lg font-bold text-gray-900">
          {formatDimensions(widthIn, heightIn)}
        </p>
      </div>
    </div>
  );
};

export default SizeCard;
