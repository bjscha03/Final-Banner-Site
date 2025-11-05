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

  // Quick size presets
  const sizePresets = [
    { label: '18" × 24"', width: 18, height: 24 },
    { label: '24" × 48" (2x4 ft)', width: 24, height: 48 },
    { label: '36" × 72" (3x6 ft)', width: 36, height: 72 }
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
              {/* Badges */}
              <div className="flex flex-wrap gap-3">
                <Badge className="bg-transparent border border-white/30 text-white px-3 py-1.5 text-sm">
                  ⚡ 20% Off First Order
                </Badge>
                <Badge className="bg-transparent border border-white/30 text-white px-3 py-1.5 text-sm">
                  📦 Free Next-Day Air
                </Badge>
                <Badge className="bg-transparent border border-white/30 text-white px-3 py-1.5 text-sm">
                  ⏱️ 24-Hour Production
                </Badge>
              </div>

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

            {/* Right Side - Compact Quick Quote Form */}
            <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-md mx-auto lg:mx-0 w-full">
              {/* Header */}
              <div className="bg-white px-5 py-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Quick Quote</h3>
                  <Badge className="bg-green-500 text-white px-2.5 py-0.5 text-xs">
                    Instant • No signup
                  </Badge>
                </div>
              </div>

              {/* Form Content */}
              <div className="p-5 space-y-4">
                {/* Width and Height */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Width (inches)
                    </label>
                    <Input
                      type="number"
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      className="text-center h-9 text-sm"
                      min="1"
                      max="1000"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Height (inches)
                    </label>
                    <Input
                      type="number"
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      className="text-center h-9 text-sm"
                      min="1"
                      max="1000"
                    />
                  </div>
                </div>

                {/* Size Presets */}
                <div className="flex gap-2 text-xs">
                  {sizePresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleSizePreset(preset.width, preset.height)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowSizeGuide(true)}
                    className="ml-auto px-2 py-1 text-[#18448D] hover:underline"
                  >
                    📏 Size guide
                  </button>
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Quantity
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newQty = Math.max(1, quantity - 1);
                        setQuantity(newQty);
                        setQuantityInput(newQty.toString());
                      }}
                      disabled={quantity <= 1}
                      className="h-9 w-9 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg"
                      type="button"
                    >
                      −
                    </button>
                    <Input
                      type="number"
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      className="flex-1 text-center h-9 text-sm"
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
                      className="h-9 w-9 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg"
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Material Selection */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Material
                  </label>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value as MaterialKey)}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#18448D] focus:border-[#18448D]"
                  >
                    {materials.map((mat) => (
                      <option key={mat.key} value={mat.key}>
                        {mat.name} ({mat.subtitle})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pricing Note */}
                <div className="bg-blue-50 border border-blue-200 rounded p-2.5">
                  <p className="text-xs text-gray-700">
                    Price includes 24-hour production and free next-day air shipping. You can upload your file after you get your price.
                  </p>
                </div>

                {/* Estimated Total */}
                <div className="bg-slate-900 text-white rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Estimated Total</span>
                    <span className="text-2xl font-bold">{usd(totals.totalWithTax)}</span>
                  </div>
                </div>

                {/* Continue Button */}
                <Button
                  onClick={handleContinue}
                  disabled={!isValid}
                  className="w-full bg-[#ff6b35] hover:bg-[#ff5722] text-white py-2.5 text-base font-semibold rounded-lg"
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
