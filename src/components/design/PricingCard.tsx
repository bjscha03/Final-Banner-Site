import React, { useMemo } from 'react';
import { ShoppingCart, CreditCard, Check, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuoteStore } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { calcTotals, usd, formatArea, formatDimensions, PRICE_PER_SQFT, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

import { useScrollToTop } from '@/components/ScrollToTop';



const PricingCard: React.FC = () => {
  const navigate = useNavigate();
  const quote = useQuoteStore();
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const { scrollToTopBeforeNavigate } = useScrollToTop();

  const { widthIn, heightIn, quantity, material, grommets, polePockets, addRope, file } = quote;

  // Get feature flags outside of useMemo so they're accessible in JSX
  const flags = useMemo(() => getFeatureFlags(), []);

  // Safe calculation with error handling and memoization
  const { baseTotals, finalTotals, showMinOrderAdjustment, minOrderAdjustmentCents } = useMemo(() => {
    try {
      // Ensure all values are valid before calculating
      if (widthIn <= 0 || heightIn <= 0 || quantity <= 0) {
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
          baseTotals: fallbackTotals,
          finalTotals: fallbackTotals,
          showMinOrderAdjustment: false,
          minOrderAdjustmentCents: 0
        };
      }

      // Calculate base totals
      const baseTotals = calcTotals({
        widthIn,
        heightIn,
        qty: quantity,
        material,
        addRope,
        polePockets
      });

      // Apply feature flag pricing if enabled
      const pricingOptions = getPricingOptions();

      let finalTotals = baseTotals;
      let showMinOrderAdjustment = false;
      let minOrderAdjustmentCents = 0;

      if (flags.freeShipping || flags.minOrderFloor) {
        const items: PricingItem[] = [{ line_total_cents: Math.round(baseTotals.materialTotal * 100) }];
        const featureFlagTotals = computeTotals(items, 0.06, pricingOptions);

        finalTotals = {
          ...baseTotals,
          materialTotal: featureFlagTotals.adjusted_subtotal_cents / 100,
          tax: featureFlagTotals.tax_cents / 100,
          totalWithTax: featureFlagTotals.total_cents / 100
        };

        showMinOrderAdjustment = featureFlagTotals.min_order_adjustment_cents > 0;
        minOrderAdjustmentCents = featureFlagTotals.min_order_adjustment_cents;
      }

      return {
        baseTotals,
        finalTotals,
        showMinOrderAdjustment,
        minOrderAdjustmentCents
      };
    } catch (error) {
      console.error('Error calculating totals in PricingCard:', error);
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
        baseTotals: fallbackTotals,
        finalTotals: fallbackTotals,
        showMinOrderAdjustment: false,
        minOrderAdjustmentCents: 0
      };
    }
  }, [widthIn, heightIn, quantity, material, addRope, polePockets, flags]);

  const materialName = {
    '13oz': '13oz Vinyl',
    '15oz': '15oz Vinyl', 
    '18oz': '18oz Vinyl',
    'mesh': 'Mesh Fence Application'
  }[material];

  const grommetName = {
    'none': 'No grommets',
    'every-2-3ft': 'Every 2–3 feet',
    'every-1-2ft': 'Every 1–2 feet',
    '4-corners': '4 corners only',
    'top-corners': 'Top corners only',
    'right-corners': 'Right corners only',
    'left-corners': 'Left corners only'
  }[grommets];

  const handleAddToCart = () => {
    if (!file) {
      toast({
        title: "Upload Required",
        description: "Please upload your artwork before adding to cart.",
        variant: "destructive",
      });
      return;
    }

    addFromQuote(quote);
    toast({
      title: "Added to cart",
      description: `${quantity} banner${quantity > 1 ? 's' : ''} added to your cart.`,
    });
  };

  const handleCheckout = () => {
    if (!file) {
      toast({
        title: "Upload Required",
        description: "Please upload your artwork before proceeding to checkout.",
        variant: "destructive",
      });
      return;
    }

    addFromQuote(quote);
    // Pre-scroll before navigation to prevent flash
    scrollToTopBeforeNavigate();
    navigate('/checkout');
  };

  return (
    <div className="relative bg-gradient-to-br from-white via-green-50/20 to-emerald-50/10 border border-green-200/30 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-green-300/15 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-emerald-300/15 to-transparent rounded-full blur-3xl"></div>
      </div>

      {/* Header with Single Prominent Price */}
      <div className="relative bg-gradient-to-r from-green-600/8 via-emerald-600/8 to-teal-600/8 px-8 py-8 border-b border-green-200/25 backdrop-blur-sm text-center">
        <div className="relative">
          {/* Price Badge */}
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl">
                <span className="text-xl">💰</span>
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-orange-400 to-red-500 rounded-full shadow-lg animate-pulse"></div>
            </div>
          </div>

          {/* Main Price - Single Prominent Display */}
          <div className="text-5xl md:text-6xl font-black bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2 drop-shadow-sm tracking-tight">
            {usd(finalTotals.totalWithTax)}
          </div>

          {/* Simple Subtitle */}
          <p className="text-lg font-semibold text-gray-700 mb-3">
            Total for {quantity} banner{quantity > 1 ? 's' : ''}
          </p>

          {/* Quick Tax Info */}
          <div className="text-sm text-gray-600">
            Subtotal {usd(finalTotals.materialTotal)} • Tax (6%) {usd(finalTotals.tax)}
          </div>
        </div>
      </div>

      {/* Quick Facts Grid */}
      <div className="relative p-8">
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="group">
            <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 border border-blue-200/40 rounded-2xl p-5 text-center transition-all duration-200 hover:shadow-lg hover:scale-105">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-xl">📐</span>
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Size</p>
              <p className="text-lg font-black text-gray-900">{formatDimensions(widthIn, heightIn)}</p>
            </div>
          </div>

          <div className="group">
            <div className="bg-gradient-to-br from-purple-50/50 to-pink-50/30 border border-purple-200/40 rounded-2xl p-5 text-center transition-all duration-200 hover:shadow-lg hover:scale-105">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-xl">📏</span>
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Area</p>
              <p className="text-lg font-black text-gray-900">{formatArea(baseTotals.area)}</p>
            </div>
          </div>

          <div className="group">
            <div className="bg-gradient-to-br from-orange-50/50 to-red-50/30 border border-orange-200/40 rounded-2xl p-5 text-center transition-all duration-200 hover:shadow-lg hover:scale-105">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-xl">🎨</span>
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Material</p>
              <p className="text-lg font-black text-gray-900">{materialName}</p>
            </div>
          </div>

          <div className="group">
            <div className="bg-gradient-to-br from-green-50/50 to-emerald-50/30 border border-green-200/40 rounded-2xl p-5 text-center transition-all duration-200 hover:shadow-lg hover:scale-105">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-xl">🔢</span>
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quantity</p>
              <p className="text-lg font-black text-gray-900">{quantity}</p>
            </div>
          </div>
        </div>

        {/* Pricing Breakdown */}
        <div className="bg-gradient-to-br from-gray-50/50 to-blue-50/20 border border-gray-200/40 rounded-2xl p-6 mb-8">
          <h4 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-blue-800 bg-clip-text text-transparent mb-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">$</span>
            </div>
            Pricing Breakdown
          </h4>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
              <div className="flex-1">
                <span className="text-sm font-semibold text-gray-800 block">
                  <span className="hidden sm:inline">Banner cost ({formatArea(baseTotals.area)} × {usd(PRICE_PER_SQFT[material])}/sq ft)</span>
                  <span className="sm:hidden">Banner cost</span>
                </span>
              </div>
              <span className="text-lg font-bold text-gray-900 ml-4">{usd(baseTotals.unit)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
              <span className="text-sm font-semibold text-gray-800">Subtotal per banner</span>
              <span className="text-lg font-bold text-gray-900">{usd(baseTotals.unit)}</span>
            </div>

            {addRope && (
              <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-800 block">
                    <span className="hidden sm:inline">Rope ({(widthIn / 12).toFixed(2)} ft × {quantity} × $2.00)</span>
                    <span className="sm:hidden">Rope</span>
                  </span>
                </div>
                <span className="text-lg font-bold text-gray-900 ml-4">{usd(baseTotals.rope)}</span>
              </div>
            )}

            {polePockets !== 'none' && baseTotals.polePocket > 0 && (
              <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-800 block">
                    <span className="hidden sm:inline">Pole Pockets (Setup + Linear ft)</span>
                    <span className="sm:hidden">Pole Pockets</span>
                  </span>
                </div>
                <span className="text-lg font-bold text-gray-900 ml-4">{usd(baseTotals.polePocket)}</span>
              </div>
            )}

            {/* Minimum Order Adjustment (if applicable) */}
            {showMinOrderAdjustment && (
              <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
                <span className="text-sm font-semibold text-gray-800">Minimum order adjustment</span>
                <span className="text-lg font-bold text-gray-900">{usd(minOrderAdjustmentCents / 100)}</span>
              </div>
            )}

            {/* Shipping Row */}
            <div className="flex justify-between items-center py-3 border-b border-gray-200/50">
              <span className="text-sm font-semibold text-gray-800">{flags.freeShipping ? flags.shippingMethodLabel : 'Shipping'}</span>
              <span className="text-lg font-bold text-gray-900">$0</span>
            </div>


          </div>
        </div>

        {/* What's Included */}
        <div className="bg-gradient-to-br from-green-50/50 to-emerald-50/20 border border-green-200/40 rounded-2xl p-6 mb-8">
          <h4 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-green-800 bg-clip-text text-transparent mb-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">✓</span>
            </div>
            What's Included
          </h4>

          <div className="space-y-4">
            <div className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                <Check className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">Professional printing on {materialName}</span>
            </div>

            {/* Conditional Grommet Display - Only show when grommets are selected */}
            {grommets !== 'none' && (
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-800">{grommetName} at no extra cost</span>
              </div>
            )}

            <div className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                <Check className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">Quality inspection and packaging</span>
            </div>

            <div className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200">
                <Check className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800">{flags.freeShipping ? flags.shippingMethodLabel : 'Free shipping on orders over $20'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mt-8">
          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            className="w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white hover:shadow-3xl transform hover:scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <ShoppingCart className="h-6 w-6" />
              <span>Add to Cart</span>
            </div>
          </button>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            className="w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:via-green-700 hover:to-teal-700 text-white hover:shadow-3xl transform hover:scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <CreditCard className="h-6 w-6" />
              <span>Buy Now</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingCard;
