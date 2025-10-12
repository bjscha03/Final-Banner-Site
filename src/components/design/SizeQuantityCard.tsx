import React, { useState, useEffect } from 'react';
import { Minus, Plus, Ruler, Hash } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { formatArea, formatDimensions, inchesToSqFt } from '@/lib/pricing';
import { Input } from '@/components/ui/input';
import { SizeStepper } from '@/components/ui/SizeStepper';

const SizeQuantityCard: React.FC = () => {
  const { widthIn, heightIn, quantity, set } = useQuoteStore();
  const [widthInput, setWidthInput] = useState(widthIn.toString());
  const [heightInput, setHeightInput] = useState(heightIn.toString());
  const [widthError, setWidthError] = useState('');
  const [heightError, setHeightError] = useState('');

  const quickQuantities = [1, 2, 5, 10];
  const quickSizes = [
    { w: 24, h: 12, label: '2×1 ft' },
    { w: 48, h: 24, label: '4×2 ft' },
    { w: 72, h: 36, label: '6×3 ft' },
    { w: 96, h: 48, label: '8×4 ft' }
  ];

  // Update local state when store values change
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

  const adjustQuantity = (delta: number) => {
    const newQuantity = Math.max(1, quantity + delta);
    set({ quantity: newQuantity });
  };

  const setQuantity = (newQuantity: number) => {
    set({ quantity: Math.max(1, newQuantity) });
  };

  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    setQuantity(value);
  };

  const setQuickSize = (w: number, h: number) => {
    set({ widthIn: w, heightIn: h });
  };

  const area = inchesToSqFt(widthIn, heightIn);

  return (
    <div className="relative bg-white border border-blue-200/40 rounded-lg overflow-hidden shadow-sm backdrop-blur-sm">
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
      </div>

      {/* Header */}
      <div className="relative bg-slate-50 px-6 py-4 border-b border-slate-200 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
              <Ruler className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full shadow-sm animate-pulse"></div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Size & Quantity</h2>
            <p className="text-sm text-gray-600 font-medium">Banner dimensions and quantity</p>
          </div>
        </div>
      </div>

      <div className="relative p-6 space-y-6">
        {/* Size Section */}
        <div>
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full"></div>
            Banner Size
          </h3>

          {/* Quick Size Pills */}
          <div className="flex flex-wrap gap-3 mb-6">
            {quickSizes.map((size) => (
              <button
                key={`${size.w}x${size.h}`}
                onClick={() => setQuickSize(size.w, size.h)}
                className={`relative px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                  widthIn === size.w && heightIn === size.h
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-white/80 text-gray-700 hover:bg-white border border-gray-200/50 hover:border-blue-300/50 shadow-sm hover:shadow-md"
                }`}
              >
                {size.label}
                {widthIn === size.w && heightIn === size.h && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#18448D] rounded-full shadow-sm"></div>
                )}
              </button>
            ))}
          </div>

          {/* Custom Size Inputs with Mobile-Optimized Steppers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SizeStepper
              label="Width"
              value={widthIn}
              onChange={(value) => set({ widthIn: value })}
              min={1}
              max={1000}
              unit="inches"
            />
            <SizeStepper
              label="Height"
              value={heightIn}
              onChange={(value) => set({ heightIn: value })}
              min={1}
              max={1000}
              unit="inches"
            />
          </div>

          {/* Size Info */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700 font-medium">
                {formatDimensions(widthIn, heightIn)}
              </span>
              <span className="text-blue-600">
                {formatArea(area)}
              </span>
            </div>
          </div>
        </div>

        {/* Quantity Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quantity</h3>
          
          {/* Mobile-Optimized Quantity Controls */}
          <div className="max-w-xs mx-auto mb-4">
            <SizeStepper
              label="Quantity"
              value={quantity}
              onChange={(value) => set({ quantity: value })}
              min={1}
              max={1000}
              className="text-center"
            />
          </div>

          {/* Quick Quantity Pills */}
          <div className="flex flex-wrap gap-2 justify-center">
            {quickQuantities.map((qty) => (
              <button
                key={qty}
                onClick={() => setQuantity(qty)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  quantity === qty
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {qty}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SizeQuantityCard;
