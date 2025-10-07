import React, { useState, useEffect } from 'react';
import { Minus, Plus, Ruler } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { formatArea, formatDimensions, inchesToSqFt } from '@/lib/pricing';
import { Input } from '@/components/ui/input';

const SizeCard: React.FC = () => {
  const { widthIn, heightIn, set } = useQuoteStore();
  const [widthInput, setWidthInput] = useState(widthIn.toString());
  const [heightInput, setHeightInput] = useState(heightIn.toString());
  const [widthError, setWidthError] = useState('');
  const [heightError, setHeightError] = useState('');

  // Update local state when store values change (e.g., from Quick Quote)
  useEffect(() => {
    setWidthInput(widthIn.toString());
    setHeightInput(heightIn.toString());
  }, [widthIn, heightIn]);

  // Debounced update to store
  useEffect(() => {
    const timer = setTimeout(() => {
      const width = parseFloat(widthInput) || 0;
      const height = parseFloat(heightInput) || 0;
      
      if (width >= 1 && width <= 1000 && height >= 1 && height <= 1000) {
        set({ widthIn: width, heightIn: height });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [widthInput, heightInput, set]);

  const validateAndSetWidth = (value: string) => {
    setWidthInput(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < 1 || num > 1000) {
      setWidthError('Width must be between 1 and 1000 inches');
    } else {
      setWidthError('');
    }
  };

  const validateAndSetHeight = (value: string) => {
    setHeightInput(value);
    const num = parseFloat(value);
    if (isNaN(num) || num < 1 || num > 1000) {
      setHeightError('Height must be between 1 and 1000 inches');
    } else {
      setHeightError('');
    }
  };

  const adjustWidth = (delta: number) => {
    const newValue = Math.max(1, Math.min(1000, widthIn + delta));
    setWidthInput(newValue.toString());
    set({ widthIn: newValue });
  };

  const adjustHeight = (delta: number) => {
    const newValue = Math.max(1, Math.min(1000, heightIn + delta));
    setHeightInput(newValue.toString());
    set({ heightIn: newValue });
  };

  const handleWidthBlur = () => {
    const num = parseFloat(widthInput);
    if (isNaN(num) || num < 1) {
      setWidthInput('1');
      set({ widthIn: 1 });
    } else if (num > 1000) {
      setWidthInput('1000');
      set({ widthIn: 1000 });
    }
  };

  const handleHeightBlur = () => {
    const num = parseFloat(heightInput);
    if (isNaN(num) || num < 1) {
      setHeightInput('1');
      set({ heightIn: 1 });
    } else if (num > 1000) {
      setHeightInput('1000');
      set({ heightIn: 1000 });
    }
  };

  const handleReset = () => {
    setWidthInput('48');
    setHeightInput('24');
    setWidthError('');
    setHeightError('');
    set({ widthIn: 48, heightIn: 24 });
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Width (inches)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustWidth(-1)}
              disabled={widthIn <= 1}
              className="w-9 h-9 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
            >
              <Minus className="w-4 h-4 text-gray-600" />
            </button>
            <Input
              type="number"
              value={widthInput}
              onChange={(e) => validateAndSetWidth(e.target.value)}
              onBlur={handleWidthBlur}
              className="text-center border-gray-200 rounded-xl"
              min="1"
              max="1000"
              step="1"
            />
            <button
              onClick={() => adjustWidth(1)}
              disabled={widthIn >= 1000}
              className="w-9 h-9 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
            >
              <Plus className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          {widthError && (
            <p className="text-xs text-red-500 mt-1">{widthError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Height (inches)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustHeight(-1)}
              disabled={heightIn <= 1}
              className="w-9 h-9 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
            >
              <Minus className="w-4 h-4 text-gray-600" />
            </button>
            <Input
              type="number"
              value={heightInput}
              onChange={(e) => validateAndSetHeight(e.target.value)}
              onBlur={handleHeightBlur}
              className="text-center border-gray-200 rounded-xl"
              min="1"
              max="1000"
              step="1"
            />
            <button
              onClick={() => adjustHeight(1)}
              disabled={heightIn >= 1000}
              className="w-9 h-9 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
            >
              <Plus className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          {heightError && (
            <p className="text-xs text-red-500 mt-1">{heightError}</p>
          )}
        </div>
      </div>

      {/* Reset Button */}
      <div className="mb-4">
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors duration-200 text-sm font-medium"
        >
          <span className="hidden sm:inline">Reset to Defaults (48" × 24")</span>
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
