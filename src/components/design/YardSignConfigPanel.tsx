/**
 * Yard Sign Configuration Panel
 * 
 * Renders yard sign-specific options: material dropdown, size dropdown, quantity.
 * Replaces banner-specific options (grommets, pole pockets, rope, custom dimensions).
 */
import React, { useRef, useEffect, useState } from 'react';
import { CheckCircle, Minus, Plus } from 'lucide-react';
import { getYardSignSizes, getYardSignMaterials } from '@/lib/yard-sign-pricing';
import type { MaterialMultiplier, PredefinedSize } from '@/lib/products';

interface YardSignConfigPanelProps {
  selectedMaterial: string;
  onMaterialChange: (key: string) => void;
  selectedSizeIndex: number;
  onSizeChange: (index: number) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  quantityDiscountRate: number;
}

const YardSignConfigPanel: React.FC<YardSignConfigPanelProps> = ({
  selectedMaterial,
  onMaterialChange,
  selectedSizeIndex,
  onSizeChange,
  quantity,
  onQuantityChange,
  quantityDiscountRate,
}) => {
  const sizes = getYardSignSizes();
  const materials = getYardSignMaterials();
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement>(null);

  const selectedMaterialObj = materials.find(m => m.key === selectedMaterial) || materials[0];
  const selectedSize = sizes[selectedSizeIndex] || sizes[0];

  // Close material dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(e.target as Node)) {
        setMaterialDropdownOpen(false);
      }
    };
    if (materialDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [materialDropdownOpen]);

  return (
    <div className="space-y-8">
      {/* Size Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Sign Size</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sizes.map((size, i) => (
            <button
              key={i}
              onClick={() => onSizeChange(i)}
              className={`border rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${
                selectedSizeIndex === i
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                  : 'border-gray-200 hover:border-gray-400 text-gray-700'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {selectedSize.widthIn}" × {selectedSize.heightIn}"
        </p>
      </div>

      {/* Material Selection */}
      <div ref={materialDropdownRef} className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Material</label>
        <button
          type="button"
          onClick={() => setMaterialDropdownOpen(prev => !prev)}
          className="w-full border rounded-xl px-3 py-2.5 text-base bg-white flex items-center gap-3 cursor-pointer hover:border-gray-400 transition-colors"
        >
          <span className="font-medium text-gray-800">{selectedMaterialObj.label}</span>
          {selectedMaterialObj.multiplier > 1 && (
            <span className="text-xs text-gray-400">
              (+{Math.round((selectedMaterialObj.multiplier - 1) * 100)}%)
            </span>
          )}
          <svg
            className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${materialDropdownOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {materialDropdownOpen && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {materials.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => { onMaterialChange(m.key); setMaterialDropdownOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer ${
                  m.key === selectedMaterial
                    ? 'bg-orange-50 border-l-2 border-orange-500'
                    : 'hover:bg-gray-50 border-l-2 border-transparent'
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${m.key === selectedMaterial ? 'text-orange-700' : 'text-gray-800'}`}>
                    {m.label}
                  </div>
                  {m.multiplier > 1 && (
                    <div className="text-xs text-gray-400">+{Math.round((m.multiplier - 1) * 100)}% over base</div>
                  )}
                </div>
                {m.key === selectedMaterial && (
                  <CheckCircle className="ml-auto w-4 h-4 text-orange-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors"
          >
            <Minus className="h-4 w-4 text-gray-600" />
          </button>
          <input
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={e => onQuantityChange(Math.max(1, +e.target.value || 1))}
            className="w-20 border rounded-xl px-3 py-1.5 text-base text-center"
          />
          <button
            onClick={() => onQuantityChange(Math.min(999, quantity + 1))}
            className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors"
          >
            <Plus className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        {quantityDiscountRate > 0 && (
          <p className="text-xs text-green-600 font-medium mt-1.5">
            🎉 {Math.round(quantityDiscountRate * 100)}% bulk discount applied
          </p>
        )}
        {quantity === 1 && (
          <p className="text-xs text-gray-400 mt-1.5">Order 2+ for up to 15% off</p>
        )}
      </div>
    </div>
  );
};

export default YardSignConfigPanel;
