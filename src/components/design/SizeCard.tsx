import React, { useState, useEffect, useRef } from 'react';
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

// Trim trailing zeros so e.g. 4 ft displays as "4", 2.5 displays as "2.5".
const formatForInput = (n: number): string => {
  if (!Number.isFinite(n)) return '';
  return Number(n.toFixed(2)).toString();
};

// Convert a value from one unit to another (used when toggling units).
const convertValue = (value: number, from: DimensionUnit, to: DimensionUnit): number => {
  if (!Number.isFinite(value)) return 0;
  if (from === to) return value;
  return from === 'ft' ? feetToInches(value) : inchesToFeet(value);
};

const SizeCard: React.FC = () => {
  const { widthIn, heightIn, set } = useQuoteStore();

  // The active working unit is the primary state. Default = feet so users
  // see and edit "4 × 2" out of the box; inches remain selectable.
  const [unit, setUnit] = useState<DimensionUnit>('ft');

  // The displayed input strings ARE the primary working values, in the
  // currently active unit. Initialize them in feet (matching the default
  // unit) so first paint never flashes inch values. Use a function
  // initializer so the conversion only happens once on mount.
  const [widthStr, setWidthStr] = useState<string>(() =>
    formatForInput(inchesToFeet(widthIn))
  );
  const [heightStr, setHeightStr] = useState<string>(() =>
    formatForInput(inchesToFeet(heightIn))
  );
  const [widthError, setWidthError] = useState('');
  const [heightError, setHeightError] = useState('');

  // Track the inch values this component last pushed to the store so we
  // can distinguish our own writes from external updates (cart restore,
  // reset, etc.). When we see an external change, we re-derive the
  // displayed values in the active unit.
  const lastPushedRef = useRef<{ widthIn: number; heightIn: number }>({
    widthIn,
    heightIn,
  });

  // Pipeline-boundary write: convert the displayed (active-unit) values
  // to inches and push to the store. Debounced so typing doesn't thrash
  // pricing recalculations. The store is the only place that holds
  // inches; cart/checkout/admin/preview/print all read from there.
  useEffect(() => {
    const timer = setTimeout(() => {
      const enteredW = parseFloat(widthStr);
      const enteredH = parseFloat(heightStr);
      if (!Number.isFinite(enteredW) || !Number.isFinite(enteredH)) return;
      const widthInches = unit === 'ft' ? feetToInches(enteredW) : enteredW;
      const heightInches = unit === 'ft' ? feetToInches(enteredH) : enteredH;
      if (
        widthInches >= 1 && widthInches <= 1000 &&
        heightInches >= 1 && heightInches <= 1000
      ) {
        lastPushedRef.current = { widthIn: widthInches, heightIn: heightInches };
        set({ widthIn: widthInches, heightIn: heightInches });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [widthStr, heightStr, unit, set]);

  // External-change sync: if the store's inch values change to something
  // we did NOT write (e.g. reset, cart-restore), re-derive the displayed
  // values in the active unit. Tolerate sub-pixel float drift from
  // ft<->in round-trips. Does NOT depend on `unit`, so toggling the unit
  // never re-reads from the store and the active-unit value is the
  // source of truth between writes.
  useEffect(() => {
    const last = lastPushedRef.current;
    const drift =
      Math.abs(last.widthIn - widthIn) + Math.abs(last.heightIn - heightIn);
    if (drift < 0.01) return; // our own write — already in sync
    lastPushedRef.current = { widthIn, heightIn };
    if (unit === 'ft') {
      setWidthStr(formatForInput(inchesToFeet(widthIn)));
      setHeightStr(formatForInput(inchesToFeet(heightIn)));
    } else {
      setWidthStr(formatForInput(widthIn));
      setHeightStr(formatForInput(heightIn));
    }
    // `unit` intentionally excluded from deps: unit toggles must NOT
    // trigger a store re-read; toggleUnit converts the active-unit
    // values directly to preserve user input across toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthIn, heightIn]);

  // Toggle the active unit. Converts the *current displayed values*
  // directly (not via the store) so the same physical size is preserved
  // and any in-progress edits are kept. Empty / NaN inputs are coerced
  // to a sensible minimum to avoid clearing the field.
  const handleUnitChange = (next: DimensionUnit) => {
    if (next === unit) return;
    const w = parseFloat(widthStr);
    const h = parseFloat(heightStr);
    const wConv = Number.isFinite(w) ? convertValue(w, unit, next) : (next === 'ft' ? 4 : 48);
    const hConv = Number.isFinite(h) ? convertValue(h, unit, next) : (next === 'ft' ? 2 : 24);
    setUnit(next);
    setWidthStr(formatForInput(wConv));
    setHeightStr(formatForInput(hConv));
    setWidthError('');
    setHeightError('');
  };

  // Bounds in the currently displayed unit. Both units share a 1 lower
  // bound (1 in / 1 ft) since 1 in is the inch-side minimum and 1 ft is
  // a sensible smallest custom banner.
  const minDisplay = 1;
  const maxDisplay = unit === 'ft' ? 83 : 1000;   // 83 ft (~996 in) / 1000 in
  const unitLabel = unit === 'ft' ? 'ft' : 'inches';

  const validateAndSetWidth = (value: string) => {
    setWidthStr(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < minDisplay || num > maxDisplay) {
      setWidthError(`Width must be between ${minDisplay} and ${maxDisplay} ${unitLabel}`);
    } else {
      setWidthError('');
    }
  };

  const validateAndSetHeight = (value: string) => {
    setHeightStr(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < minDisplay || num > maxDisplay) {
      setHeightError(`Height must be between ${minDisplay} and ${maxDisplay} ${unitLabel}`);
    } else {
      setHeightError('');
    }
  };

  const adjustWidth = (delta: number) => {
    // delta is in displayed (active) units (1 in or 1 ft)
    const current = parseFloat(widthStr);
    const base = Number.isFinite(current)
      ? current
      : (unit === 'ft' ? inchesToFeet(widthIn) : widthIn);
    const next = Math.max(minDisplay, Math.min(maxDisplay, base + delta));
    setWidthStr(formatForInput(next));
    setWidthError('');
  };

  const adjustHeight = (delta: number) => {
    const current = parseFloat(heightStr);
    const base = Number.isFinite(current)
      ? current
      : (unit === 'ft' ? inchesToFeet(heightIn) : heightIn);
    const next = Math.max(minDisplay, Math.min(maxDisplay, base + delta));
    setHeightStr(formatForInput(next));
    setHeightError('');
  };

  const handleWidthBlur = () => {
    const num = parseFloat(widthStr);
    if (!Number.isFinite(num) || num < minDisplay) {
      setWidthStr(String(minDisplay));
      setWidthError('');
    } else if (num > maxDisplay) {
      setWidthStr(String(maxDisplay));
      setWidthError('');
    }
  };

  const handleHeightBlur = () => {
    const num = parseFloat(heightStr);
    if (!Number.isFinite(num) || num < minDisplay) {
      setHeightStr(String(minDisplay));
      setHeightError('');
    } else if (num > maxDisplay) {
      setHeightStr(String(maxDisplay));
      setHeightError('');
    }
  };

  const handleReset = () => {
    setWidthError('');
    setHeightError('');
    // Reset the displayed (active-unit) values directly. The debounced
    // boundary effect will push the equivalent inches to the store.
    if (unit === 'ft') {
      setWidthStr('4');
      setHeightStr('2');
    } else {
      setWidthStr('48');
      setHeightStr('24');
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
            onClick={() => handleUnitChange('in')}
            aria-pressed={unit === 'in'}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              unit === 'in' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Inches
          </button>
          <button
            type="button"
            onClick={() => handleUnitChange('ft')}
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
              value={widthStr}
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
              value={heightStr}
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
          <span className="hidden sm:inline">
            Reset to Defaults ({unit === 'ft' ? `4' × 2'` : `48" × 24"`})
          </span>
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
