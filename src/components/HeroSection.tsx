import React, { useState, useEffect } from 'react';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MaterialKey } from '@/store/quote';
import { calcTotals, usd, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import SizeGuideModal from '@/components/SizeGuideModal';

interface MaterialOption {
  key: MaterialKey;
  name: string;
  subtitle: string;
}

const materials: MaterialOption[] = [
  { key: '13oz', name: '13oz Vinyl', subtitle: 'Most Popular' },
  { key: '15oz', name: '15oz Vinyl', subtitle: 'Premium outdoor' },
  { key: '18oz', name: '18oz Vinyl', subtitle: 'Heavy-duty' },
  { key: 'mesh', name: 'Mesh Vinyl', subtitle: 'Wind-through' }
];

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  
  // Quote form state
  const [widthIn, setWidthIn] = useState(48);
  const [heightIn, setHeightIn] = useState(24);
  const [quantity, setQuantity] = useState(1);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  
  const [widthInput, setWidthInput] = useState('48');
  const [heightInput, setHeightInput] = useState('24');
  const [quantityInput, setQuantityInput] = useState('1');

  // Debounced update for calculations
  useEffect(() => {
    const timer = setTimeout(() => {
      const width = parseFloat(widthInput) || 0;
      const height = parseFloat(heightInput) || 0;
      const qty = parseInt(quantityInput) || 0;

      if (width >= 1 && width <= 1000) {
        setWidthIn(width);
      }

      if (height >= 1 && height <= 1000) {
        setHeightIn(height);
      }

      if (qty >= 1 && qty <= 999) {
        setQuantity(qty);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [widthInput, heightInput, quantityInput]);

  // Safe calculation with error handling and feature flag support
  const { totals } = React.useMemo(() => {
    try {
      if (widthIn < 1 || heightIn < 1 || quantity < 1) {
        const fallbackTotals = {
          area: 0,
          unit: 0,
          rope: 0,
          polePocket: 0,
          materialTotal: 0,
          tax: 0,
          totalWithTax: 0
        };
        return {
          totals: fallbackTotals
        };
      }

      const baseTotals = calcTotals({
        widthIn,
        heightIn,
        qty: quantity,
        material,
        addRope: false,
        polePockets: 'none'
      });

      const flags = getFeatureFlags();
      const pricingOptions = getPricingOptions();

      let finalTotals = baseTotals;

      if (flags.freeShipping || flags.minOrderFloor) {
        const items: PricingItem[] = [{ line_total_cents: Math.round(baseTotals.materialTotal * 100) }];
        const featureFlagTotals = computeTotals(items, 0.06, pricingOptions);

        finalTotals = {
          ...baseTotals,
          materialTotal: featureFlagTotals.adjusted_subtotal_cents / 100,
          tax: featureFlagTotals.tax_cents / 100,
          totalWithTax: featureFlagTotals.total_cents / 100
        };
      }

      return {
        totals: finalTotals
      };
    } catch (error) {
      console.error('Error calculating totals:', error);
      const fallbackTotals = {
        area: 0,
        unit: 0,
        rope: 0,
        polePocket: 0,
        materialTotal: 0,
        tax: 0,
        totalWithTax: 0
      };
      return {
        totals: fallbackTotals
      };
    }
  }, [widthIn, heightIn, quantity, material]);

  const isValid = widthIn >= 1 && widthIn <= 1000 && heightIn >= 1 && heightIn <= 1000 && quantity >= 1 && quantity <= 999;

  const handleContinue = () => {
    if (!isValid) return;

    const quickQuoteData = {
      widthIn,
      heightIn,
      quantity,
      material
    };

    sessionStorage.setItem('quickQuote', JSON.stringify(quickQuoteData));

    const params = new URLSearchParams({
      width: widthIn.toString(),
      height: heightIn.toString(),
      qty: quantity.toString(),
      material: material
    });

    navigate(`/design?${params.toString()}`);

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleStartDesigning = () => {
    navigate('/design');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  // Quick size presets (landscape orientation)
  const sizePresets = [
    { label: '18" × 24"', width: 24, height: 18 },
    { label: '24" × 48" (2x4 ft)', width: 48, height: 24 },
    { label: '36" × 72" (3x6 ft)', width: 72, height: 36 }
  ];

  const handleSizePreset = (width: number, height: number) => {
    setWidthIn(width);
    setHeightIn(height);
    setWidthInput(width.toString());
    setHeightInput(height.toString());
  };

  return (
    <section className="bg-white">
      {/* Compact Hero Section */}
      <div className="bg-[#1e2a3a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - Hero Content */}
            <div className="text-white space-y-6">
              {/* Main Heading */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                Custom Vinyl Banners — Printed Fast, Shipped Next-Day Air
              </h1>

              {/* Subheading */}
              <p className="text-lg text-slate-300">
                24-Hour Production • Free Next-Day Air Shipping • 20% Off First Order
              </p>

              {/* Start Designing Button */}
              <button
                onClick={handleStartDesigning}
                className="inline-flex items-center justify-center px-8 py-3.5 bg-[#18448D] hover:bg-[#1a4d9e] text-white text-base font-semibold rounded-lg transition-colors duration-200"
              >
                Start Designing from Scratch
              </button>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">⭐</span>
                  <span className="text-sm">10,000+ happy customers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">🔒</span>
                  <span className="text-sm">Secure checkout</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-sm">Satisfaction guaranteed</span>
                </div>
              </div>
            </div>

            {/* Right Side - Clean Quick Quote Form */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto lg:mx-0 w-full border border-slate-100">
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Quick Quote</h3>
                  <Badge className="bg-emerald-500 text-white px-3 py-1 text-xs font-medium rounded-full">
                    Instant • No signup
                  </Badge>
                </div>
              </div>

              {/* Form Content */}
              <div className="p-6 space-y-5">
                {/* Dimensions Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">Banner Size</span>
                    <button
                      onClick={() => setShowSizeGuide(true)}
                      className="text-xs text-[#18448D] hover:text-[#0d2d5a] font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>📏</span> Size guide
                    </button>
                  </div>
                  
                  {/* Width and Height Inputs */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Width (in)</label>
                      <Input
                        type="number"
                        value={widthInput}
                        onChange={(e) => setWidthInput(e.target.value)}
                        className="text-center h-11 text-base font-medium border-slate-200 focus:border-[#18448D] focus:ring-[#18448D]"
                        min="1"
                        max="1000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1.5">Height (in)</label>
                      <Input
                        type="number"
                        value={heightInput}
                        onChange={(e) => setHeightInput(e.target.value)}
                        className="text-center h-11 text-base font-medium border-slate-200 focus:border-[#18448D] focus:ring-[#18448D]"
                        min="1"
                        max="1000"
                      />
                    </div>
                  </div>

                  {/* Size Presets - Wrapping pills */}
                  <div className="flex flex-wrap gap-2">
                    {sizePresets.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handleSizePreset(preset.width, preset.height)}
                        className="px-3 py-2 text-xs font-medium bg-slate-50 hover:bg-[#18448D] hover:text-white text-slate-600 rounded-full border border-slate-200 hover:border-[#18448D] transition-all duration-200 min-h-[36px]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity & Material Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Quantity */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Quantity</label>
                    <div className="flex items-center h-11 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <button
                        onClick={() => {
                          const newQty = Math.max(1, quantity - 1);
                          setQuantity(newQty);
                          setQuantityInput(newQty.toString());
                        }}
                        disabled={quantity <= 1}
                        className="h-full w-11 flex items-center justify-center text-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border-r border-slate-200"
                        type="button"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="flex-1 text-center h-full text-base font-medium border-0 focus:ring-0 focus:outline-none bg-transparent min-w-0"
                        min="1"
                        max="999"
                      />
                      <button
                        onClick={() => {
                          const newQty = Math.min(999, quantity + 1);
                          setQuantity(newQty);
                          setQuantityInput(newQty.toString());
                        }}
                        disabled={quantity >= 999}
                        className="h-full w-11 flex items-center justify-center text-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border-l border-slate-200"
                        type="button"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Material */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Material</label>
                    <select
                      value={material}
                      onChange={(e) => setMaterial(e.target.value as MaterialKey)}
                      className="w-full h-11 px-3 text-sm font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D] cursor-pointer"
                    >
                      {materials.map((mat) => (
                        <option key={mat.key} value={mat.key}>
                          {mat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pricing Note - More subtle */}
                <p className="text-xs text-slate-500 text-center">
                  Includes 24-hour production & free next-day air shipping
                </p>

                {/* Estimated Total */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Estimated Total</span>
                    <span className="text-2xl font-bold">{usd(totals.totalWithTax)}</span>
                  </div>
                </div>

                {/* Continue Button */}
                <Button
                  onClick={handleContinue}
                  disabled={!isValid}
                  className="w-full bg-[#ff6b35] hover:bg-[#e55a2b] text-white py-3 text-base font-semibold rounded-xl shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all duration-200"
                  size="lg"
                >
                  Continue →
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Size Guide Modal */}
      <SizeGuideModal isOpen={showSizeGuide} onClose={() => setShowSizeGuide(false)} />
    </section>
  );
};

export default HeroSection;
