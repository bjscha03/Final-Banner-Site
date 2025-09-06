import React, { useState, useEffect } from 'react';
import { Calculator, ArrowRight } from 'lucide-react';

const QuickQuote: React.FC = () => {
  const [width, setWidth] = useState<string>('4');
  const [height, setHeight] = useState<string>('2');
  const [quantity, setQuantity] = useState<string>('1');
  const [material, setMaterial] = useState<string>('13oz');

  const materialPrices = {
    '13oz': 4.50,
    '15oz': 6.00,
    '18oz': 7.50,
    'mesh': 6.00
  };

  const [subtotal, setSubtotal] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [sqFt, setSqFt] = useState<number>(0);

  useEffect(() => {
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const q = parseInt(quantity) || 1;
    const materialPrice = materialPrices[material as keyof typeof materialPrices];

    const squareFeet = w * h;
    const subtotalPrice = squareFeet * materialPrice * q;
    const taxAmount = subtotalPrice * 0.06; // 6% tax
    const totalPrice = subtotalPrice + taxAmount;

    setSqFt(squareFeet);
    setSubtotal(subtotalPrice);
    setTax(taxAmount);
    setTotal(totalPrice);
  }, [width, height, quantity, material]);

  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Calculator className="h-6 w-6 text-orange-500" />
            <h2 className="text-3xl font-bold text-gray-900">Quick Quote Calculator</h2>
          </div>
          <p className="text-lg text-gray-600">Get instant pricing for your custom banner</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column - Inputs */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Width (ft)
                  </label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    step="0.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Height (ft)
                  </label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                    step="0.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Material
                </label>
                <select
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="13oz">13oz Vinyl - $4.50/sq ft</option>
                  <option value="15oz">15oz Vinyl - $6.00/sq ft</option>
                  <option value="18oz">18oz Vinyl - $7.50/sq ft</option>
                  <option value="mesh">Mesh Fence - $6.00/sq ft</option>
                </select>
              </div>
            </div>

            {/* Right Column - Pricing */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Price Breakdown</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size:</span>
                  <span className="font-medium">{width}' × {height}'</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Square Feet:</span>
                  <span className="font-medium">{sqFt.toFixed(1)} sq ft</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Material:</span>
                  <span className="font-medium">{material} Vinyl</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Quantity:</span>
                  <span className="font-medium">{quantity}</span>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Subtotal:</span>
                    <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Tax (6%):</span>
                    <span className="text-gray-900">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-lg font-semibold text-gray-900">Total:</span>
                    <span className="text-2xl font-bold text-orange-500">${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-3 bg-green-100 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ {total > 20 ? 'FREE SHIPPING included!' : 'Add $5 shipping (free over $20)'}
                </p>
                <p className="text-sm text-green-800">
                  🚀 24-hour production guarantee
                </p>
              </div>

              <button className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2">
                <span>Start My Design</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuickQuote;