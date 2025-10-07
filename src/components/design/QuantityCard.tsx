import React from 'react';
import { Minus, Plus, Hash } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { Input } from '@/components/ui/input';

const QuantityCard: React.FC = () => {
  const { quantity, set } = useQuoteStore();

  const quickQuantities = [1, 2, 5, 10];

  const adjustQuantity = (delta: number) => {
    const newQuantity = Math.max(1, quantity + delta);
    set({ quantity: newQuantity });
  };

  const setQuantity = (newQuantity: number) => {
    set({ quantity: Math.max(1, newQuantity) });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    setQuantity(value);
  };

  return (
    <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
      {/* Modern Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Hash className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Quantity</h2>
            <p className="text-sm text-gray-500">How many banners do you need?</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Modern Quantity Controls */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => adjustQuantity(-1)}
            disabled={quantity <= 1}
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
          >
            <Minus className="w-4 h-4 text-gray-600" />
          </button>

          <Input
            type="number"
            value={quantity}
            onChange={handleInputChange}
            className="w-20 text-center text-lg font-semibold border-gray-200 rounded-xl"
            min="1"
          />

          <button
            onClick={() => adjustQuantity(1)}
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200 flex items-center justify-center"
          >
            <Plus className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Modern Quick Select Pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          {quickQuantities.map((qty) => (
            <button
              key={qty}
              onClick={() => setQuantity(qty)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                quantity === qty
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {qty}
            </button>
          ))}
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            {quantity === 1 ? '1 banner' : `${quantity} banners`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuantityCard;
