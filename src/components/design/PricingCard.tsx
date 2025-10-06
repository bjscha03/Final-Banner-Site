import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingCart, CreditCard, Check, Truck, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuoteStore, ORDER_SIZE_LIMIT_SQFT } from '@/store/quote';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { calcTotals, usd, formatArea, formatDimensions, PRICE_PER_SQFT, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { validateMinimumOrder, canProceedToCheckout } from '@/lib/validation/minimumOrder';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useScrollToTop } from '@/components/ScrollToTop';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';



const PricingCard: React.FC = () => {
  const navigate = useNavigate();
  const quote = useQuoteStore();
  const { addFromQuote } = useCartStore();
  const { toast } = useToast();
  const { scrollToTopBeforeNavigate } = useScrollToTop();
  
  // Upsell modal state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'cart' | 'checkout' | null>(null);
  const [dontShowUpssellAgain, setDontShowUpssellAgain] = useState(false);

  // Admin status (unchanged)
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const { widthIn, heightIn, quantity, material, grommets, polePockets, addRope, file } = quote;

  // Compute base and final totals using existing design page logic
  const { baseTotals, finalTotals, showMinOrderAdjustment, minOrderAdjustmentCents } = useMemo(() => {
    try {
      const baseTotals = calcTotals({ widthIn, heightIn, qty: quantity, material, addRope, polePockets });

      const flags = getFeatureFlags();
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
          totalWithTax: featureFlagTotals.total_cents / 100,
        };
        showMinOrderAdjustment = featureFlagTotals.min_order_adjustment_cents > 0;
        minOrderAdjustmentCents = featureFlagTotals.min_order_adjustment_cents;
      }

      return { baseTotals, finalTotals, showMinOrderAdjustment, minOrderAdjustmentCents };
    } catch (error) {
      console.error('Error calculating totals in PricingCard:', error);
      const fallbackTotals = { area: 0, unit: 0, rope: 0, polePocket: 0, materialTotal: 0, tax: 0, totalWithTax: 0 };
      return { baseTotals: fallbackTotals, finalTotals: fallbackTotals, showMinOrderAdjustment: false, minOrderAdjustmentCents: 0 };
    }
  }, [widthIn, heightIn, quantity, material, addRope, polePockets]);

  const handleAddToCart = () => {
    // Validate minimum order etc handled elsewhere
    // Build authoritative pricing payload from design page totals
    const pricing = {
      unit_price_cents: Math.round(baseTotals.unit * 100),
      rope_cost_cents: Math.round(baseTotals.rope * 100),
      rope_pricing_mode: 'per_item' as const,
      pole_pocket_cost_cents: Math.round(baseTotals.polePocket * 100),
      pole_pocket_pricing_mode: 'per_item' as const,
      line_total_cents: Math.round(baseTotals.materialTotal * 100),
    };

    const updatedQuote = { ...quote };
    console.log('Design -> Cart authoritative pricing', { pricing, updatedQuote });
    addFromQuote(updatedQuote, undefined, pricing);
    toast({ title: 'Added to Cart', description: 'Your banner has been added to the cart.' });
  };

  const handleCheckout = () => {
    const pricing = {
      unit_price_cents: Math.round(baseTotals.unit * 100),
      rope_cost_cents: Math.round(baseTotals.rope * 100),
      rope_pricing_mode: 'per_item' as const,
      pole_pocket_cost_cents: Math.round(baseTotals.polePocket * 100),
      pole_pocket_pricing_mode: 'per_item' as const,
      line_total_cents: Math.round(baseTotals.materialTotal * 100),
    };
    const updatedQuote = { ...quote };
    console.log('Design -> Checkout authoritative pricing', { pricing, updatedQuote });
    addFromQuote(updatedQuote, undefined, pricing);
    scrollToTopBeforeNavigate();
    navigate('/checkout');
  };

  return (
    <div className="relative bg-gradient-to-br from-white via-green-50/20 to-emerald-50/10 border border-green-200/30 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
      {/* Header with Single Prominent Price */}
      <div className="relative text-center mb-8 md:mb-12">
        <div className="inline-flex items-center justify-center mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl">
            <span className="text-xl">💲</span>
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-orange-400 to-red-500 rounded-full shadow-lg animate-pulse"></div>
        </div>
        <div className="text-5xl md:text-6xl lg:text-7xl font-black bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2 drop-shadow-sm tracking-tight">
          {usd(finalTotals.totalWithTax)}
        </div>
        <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto px-4">
          Total for {quantity} banner{quantity > 1 ? 's' : ''}
        </p>
        <div className="text-sm text-gray-600">
          Subtotal {usd(finalTotals.materialTotal)} • Tax (6%) {usd(finalTotals.tax)}
        </div>
      </div>

      {/* The rest of the component remains unchanged, except we wire buttons to handlers above */}
      <div className="space-y-4 mt-8">
        <Button onClick={handleAddToCart} className="w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white">
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-3">
            <ShoppingCart className="h-6 w-6" />
            <span>Add to Cart</span>
          </div>
        </Button>
        <Button onClick={handleCheckout} variant="ghost" className="w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3">
          <CreditCard className="h-6 w-6" />
          Buy Now
        </Button>
      </div>
    </div>
  );
};

export default PricingCard;
