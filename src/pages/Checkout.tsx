import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { useAuth, getCurrentUser } from '@/lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { OrderItem } from '../lib/orders/types';

import Layout from '@/components/Layout';
import { usd, formatDimensions, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import { validateMinimumOrder, canProceedToCheckout } from '@/lib/validation/minimumOrder';
import PayPalCheckout from '@/components/checkout/PayPalCheckout';
import SignUpEncouragementModal from '@/components/checkout/SignUpEncouragementModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Package, Truck, Plus, Minus, Trash2, Eye, Tag } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/lib/api';
import { CartItem } from '@/store/cart';
import BannerPreview from '@/components/cart/BannerPreview';
import { useCheckoutContext } from '@/store/checkoutContext';
import { cartSyncService } from '@/lib/cartSync';
import { trackBeginCheckout, trackViewCart, trackFBInitiateCheckout } from '@/lib/analytics';
import { trackPromoEvent } from '@/lib/posthog';

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items: rawItems, getMigratedItems, isLoading, syncToServer, clearCart, getSubtotalCents, getTaxCents, getTotalCents, updateQuantity, removeItem, discountCode, applyDiscountCode, removeDiscountCode, getResolvedDiscount } = useCartStore();

  // CRITICAL: Use migrated items to ensure rope/pole pocket costs are calculated
  const items = getMigratedItems();
  const { user } = useAuth();
  const { setCheckoutContext } = useCheckoutContext();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const { toast } = useToast();
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [guestDiscountEmail, setGuestDiscountEmail] = useState('');


  // Get totals from cart store methods
  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();
  const resolvedDiscount = getResolvedDiscount();
  

  // Calculate feature flag pricing details
  const flags = getFeatureFlags();
  const pricingOptions = getPricingOptions();
  let minOrderAdjustmentCents = 0;
  let showMinOrderAdjustment = false;


  // Minimum order validation (moved outside conditional block)
  const adminContext = { isAdmin: isAdminUser, bypassValidation: isAdminUser };
  const minimumOrderValidation = validateMinimumOrder(totalCents, adminContext);
  const canProceed = minimumOrderValidation.isValid;
  if (flags.freeShipping || flags.minOrderFloor) {
    const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
    const totals = computeTotals(pricingItems, 0.06, pricingOptions);

    minOrderAdjustmentCents = totals.min_order_adjustment_cents;
    showMinOrderAdjustment = minOrderAdjustmentCents > 0;
  }

  // Helper to compute rope cost with backward compatibility
  const getRopeCost = (item: CartItem): number => {
    if (item.rope_cost_cents !== undefined && item.rope_cost_cents !== null) {
      return item.rope_cost_cents;
    }
    if (item.rope_feet && item.rope_feet > 0) {
      return Math.round(item.rope_feet * 2 * item.quantity * 100);
    }
    return 0;
  };

  // Helper to compute pole pocket cost with backward compatibility
  const getPolePocketCost = (item: CartItem): number => {
    if (item.pole_pocket_cost_cents !== undefined && item.pole_pocket_cost_cents !== null) {
      return item.pole_pocket_cost_cents;
    }
    if (item.pole_pockets && item.pole_pockets !== 'none') {
      const baseTotal = item.unit_price_cents * item.quantity;
      const ropeTotal = getRopeCost(item);
      const pocketTotal = Math.max(0, item.line_total_cents - baseTotal - ropeTotal);
      return pocketTotal;
    }
    return 0;
  };

  // Compute "each" price
  const computeEach = (item: CartItem): number => {
    const ropeMode = item.rope_pricing_mode || 'per_item';
    const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
    const ropeCost = getRopeCost(item);
    const pocketCost = getPolePocketCost(item);
    
    const perOrderCosts = (ropeMode === 'per_order' ? ropeCost : 0) + (pocketMode === 'per_order' ? pocketCost : 0);
    const each = Math.round((item.line_total_cents - perOrderCosts) / Math.max(1, item.quantity));
    return each;
  };

  // Check admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user?.email) {
        try {
          const response = await fetch('/.netlify/functions/check-admin-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email }),
          });
          if (response.ok) {
            const result = await response.json();
            setIsAdminUser(result.isAdmin);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }
      }
    };
    checkAdminStatus();
  }, [user?.email]);
  // Cart management functions
  const handleIncreaseQuantity = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item && item.quantity < 999) {
      updateQuantity(itemId, item.quantity + 1);
    }
  };

  const handleDecreaseQuantity = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (item && item.quantity > 1) {
      updateQuantity(itemId, item.quantity - 1);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId);
    toast({
      title: "Item Removed",
      description: "Item has been removed from your cart.",
    });
  };

  // Discount code handlers
  const handleApplyDiscount = async () => {
    if (!discountCodeInput.trim()) {
      setDiscountError('Please enter a discount code');
      return;
    }

    // Determine email to use for validation
    const emailForValidation = user?.email || guestDiscountEmail.trim();
    
    // For guests, require email input
    if (!user && !guestDiscountEmail.trim()) {
      setDiscountError('Please enter your email to use a discount code');
      return;
    }

    // Basic email format validation for guests
    if (!user && guestDiscountEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guestDiscountEmail.trim())) {
        setDiscountError('Please enter a valid email address');
        return;
      }
    }

    setIsValidatingDiscount(true);
    setDiscountError('');

    try {
      const response = await fetch('/.netlify/functions/validate-discount-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: discountCodeInput.trim(),
          email: emailForValidation,
          userId: user?.id || null
        }),
      });

      const result = await response.json();

      if (result.valid && result.discount) {
        applyDiscountCode(result.discount);
        
        // Track successful promo application
        trackPromoEvent('promo_applied_success', {
          promo_code: result.discount.code,
          discount_percentage: result.discount.discountPercentage,
          discount_amount_cents: result.discount.discountAmountCents,
        });
        
        toast({
          title: 'Discount Applied!',
          description: `${result.discount.discountPercentage}% off your order`,
        });
        setDiscountCodeInput('');
        setDiscountError('');
      } else {
        // Track rejected promo
        trackPromoEvent('promo_rejected', {
          promo_code: discountCodeInput.trim(),
          reason: result.error || 'Invalid discount code',
        });
        
        setDiscountError(result.error || 'Invalid discount code');
      }
    } catch (error) {
      console.error('Error validating discount code:', error);
      setDiscountError('Failed to validate discount code');
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    removeDiscountCode();
    setDiscountCodeInput('');
    setDiscountError('');
    toast({
      title: 'Discount Removed',
      description: 'Discount code has been removed from your order',
    });
  };


  // Show sign-up modal for non-authenticated users (only once per session)
  useEffect(() => {
    if (!user && !hasShownModal && items.length > 0) {
      const timer = setTimeout(() => {
        setShowSignUpModal(true);
        setHasShownModal(true);
      }, 1000); // Show after 1 second delay

      return () => clearTimeout(timer);
    }
  }, [user, hasShownModal, items.length]);

  // Track begin checkout event
  useEffect(() => {
    if (items.length > 0) {
      const analyticsItems = items.map(item => ({
        item_id: item.id,
        item_name: `${item.width_in}x${item.height_in} ${item.material} Banner`,
        item_category: 'Banner',
        item_variant: item.material,
        price: item.line_total_cents,
        quantity: item.quantity,
      }));
      trackBeginCheckout(analyticsItems, totalCents);
      trackViewCart(analyticsItems, totalCents);
      
      // Track Facebook Pixel InitiateCheckout
      trackFBInitiateCheckout({
        value: totalCents,
        num_items: items.length,
      });
    }
  }, []); // Only track once on mount

  // Show loading state while cart is being loaded/merged
  if (isLoading) {
    return (
      <Layout>
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#18448D]"></div>
              <h2 className="mt-4 text-2xl font-bold text-[#18448D]">Loading your cart...</h2>
              <p className="mt-2 text-gray-600">Please wait while we prepare your items.</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  // Redirect if cart is empty
  if (items.length === 0) {
    return (
      <Layout>
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-2xl font-bold text-[#18448D]">Your cart is empty</h2>
              <p className="mt-2 text-gray-600">Add some items to your cart before checking out.</p>
              <Button
                onClick={() => navigate('/design')}
                className="mt-6"
              >
                Start Designing
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const handlePaymentSuccess = async (orderId: string) => {
    try {
      console.log('Payment success handler called with order ID:', orderId);

      // With the new PayPal integration, the order is already created in the database
      // by the paypal-capture-order function. We just need to handle the UI flow.

      // Clear the cart
      clearCart();

      // Show success message
      toast({
        title: "Order Placed Successfully!",
        description: `Your order has been created and payment processed. Order ID: ${orderId}`,
      });

      // Navigate to simple success page instead of order confirmation
      navigate(`/payment-success?orderId=${orderId}`, {
        replace: true,
        state: {
          fromCheckout: true,
          orderId: orderId,
          items: items,
          total: getTotalCents()
        }
      });

    } catch (error) {
      console.error('Payment success handler error:', error);
      toast({
        title: "Order Processing Error",
        description: "Your payment was processed but there was an issue completing your order. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const handlePaymentError = (error: any) => {
    console.error('Payment error:', error);
    toast({
      title: "Payment Failed",
      description: "There was an error processing your payment. Please try again.",
      variant: "destructive",
    });
  };

  return (
    <Layout>
      <div className="bg-gradient-to-b from-gray-50 to-white py-8 sm:py-12 min-h-[calc(100vh-4rem)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8 sm:mb-12">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-6 hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="text-center mb-8">
              <h1 className="text-4xl sm:text-5xl font-bold text-[#18448D] mb-3">Secure Checkout</h1>
              <p className="text-lg text-gray-600">Review your order and complete your purchase</p>
            </div>
            
            <div className="mb-6">
            </div>
            
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Order Summary - Takes 2 columns on large screens */}
            <div className="lg:col-span-2 space-y-6 w-full">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transition-shadow hover:shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-[#18448D]">Order Summary</h2>
                  <div className="bg-blue-50 px-4 py-2 rounded-full">
                    <span className="text-sm font-semibold text-[#18448D]">{items.length} {items.length === 1 ? 'Item' : 'Items'}</span>
                  </div>
                </div>
                
                {/* Thumbnail preview notice - shown once above all items */}
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 mb-4">
                  <Eye className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                  <p>
                    <span className="font-medium">Preview only.</span> Our team personally reviews every banner before production and will reach out if anything needs attention.
                  </p>
                </div>

                <div className="space-y-4">
                  {items.map((item) => {
                    const ropeMode = item.rope_pricing_mode || 'per_item';
                    const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
                    const ropeCost = getRopeCost(item);
                    const pocketCost = getPolePocketCost(item);
                    const ropeEach = item.quantity > 0 ? Math.round(ropeCost / item.quantity) : 0;
                    const pocketEach = item.quantity > 0 ? Math.round(pocketCost / item.quantity) : 0;
                    const eachCents = computeEach(item);

                    return (
                    <div key={item.id} className="border border-gray-200 rounded-xl p-6 mb-4 last:mb-0 bg-gradient-to-br from-white to-gray-50 hover:shadow-md transition-all">
                      {/* Thumbnail on top - centered */}
                      <div className="flex justify-center mb-4">
                        <BannerPreview
                          widthIn={item.width_in}
                          heightIn={item.height_in}
                          grommets={item.grommets}
                          imageUrl={(() => {
                            const url = item.thumbnail_url || item.web_preview_url || item.file_url || item.print_ready_url || item.aiDesign?.assets?.proofUrl;
                            if (!url) {
                              console.warn('⚠️  CHECKOUT: No image URL found for item:', item.id, {
                                thumbnail_url: item.thumbnail_url,
                                web_preview_url: item.web_preview_url,
                                file_url: item.file_url,
                                print_ready_url: item.print_ready_url,
                                aiDesign_proofUrl: item.aiDesign?.assets?.proofUrl
                              });
                            }
                            return url || undefined;
                          })()}
                          material={item.material}
                          textElements={item.text_elements}
                          overlayImage={item.overlay_image}
                          imageScale={item.image_scale}
                          imagePosition={item.image_position}
                          className="flex-shrink-0"
                        />
                      </div>

                      {/* Title and Price on same line */}
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-[#18448D] text-xl">
                          Custom Banner {formatDimensions(item.width_in, item.height_in)}
                        </h3>
                        <div className="text-right ml-4 flex-shrink-0">
                          <p className="font-bold text-gray-900 text-xl">
                            {usd(item.line_total_cents / 100)}
                          </p>
                          <p className="text-sm text-gray-500 font-medium">
                            {usd(eachCents / 100)} each
                          </p>
                        </div>
                      </div>

                      {/* Item specifications */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 mb-4">
                        <span><span className="font-medium text-gray-700">Material:</span> {item.material}</span>
                        <span><span className="font-medium text-gray-700">Grommets:</span> {item.grommets}</span>
                        {item.rope_feet > 0 && (
                          <span><span className="font-medium text-gray-700">Rope:</span> {item.rope_feet.toFixed(1)} ft</span>
                        )}
                        {item.pole_pocket_position && item.pole_pocket_position !== "none" && (
                          <span>
                            <span className="font-medium text-gray-700">Pole Pockets:</span> {item.pole_pocket_position}
                            {item.pole_pocket_size && ` (${item.pole_pocket_size}")`}
                          </span>
                        )}
                      </div>

                      {/* Quantity Controls and Remove Button */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-gray-800 font-semibold">Quantity:</span>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDecreaseQuantity(item.id)}
                              disabled={item.quantity <= 1}
                              className="h-9 w-9 p-0 border-2 hover:bg-[#18448D] hover:text-white hover:border-[#18448D] transition-all"
                            >
                              <Minus className="h-5 w-5" />
                            </Button>
                            <span className="w-10 text-center font-bold text-lg">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleIncreaseQuantity(item.id)}
                              disabled={item.quantity >= 999}
                              className="h-9 w-9 p-0 border-2 hover:bg-[#18448D] hover:text-white hover:border-[#18448D] transition-all"
                            >
                              <Plus className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-100 font-semibold transition-all"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );})}
                </div>

                {/* Discount Code Section */}
                <div className="border-t border-gray-200 pt-6 mt-6">
                  {!discountCode ? (
                    <div className="space-y-3">
                      <label htmlFor="discount-code" className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-5 h-5 text-[#18448D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Have a Discount Code?
                      </label>
                      
                      {/* Email input for guests */}
                      {!user && (
                        <Input
                          id="discount-email"
                          type="email"
                          placeholder="Your email address"
                          value={guestDiscountEmail}
                          onChange={(e) => setGuestDiscountEmail(e.target.value)}
                          className="h-12 text-base border-2 focus:border-[#18448D] transition-colors"
                          disabled={isValidatingDiscount}
                        />
                      )}
                      
                      <div className="flex gap-2">
                        <Input
                          id="discount-code"
                          type="text"
                          placeholder="Enter your code"
                          value={discountCodeInput}
                          onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                          onKeyPress={(e) => e.key === 'Enter' && handleApplyDiscount()}
                          className="flex-1 h-12 text-base border-2 focus:border-[#18448D] transition-colors"
                          disabled={isValidatingDiscount}
                        />
                        <Button
                          onClick={handleApplyDiscount}
                          disabled={isValidatingDiscount || !discountCodeInput.trim() || (!user && !guestDiscountEmail.trim())}
                          className="bg-[#18448D] hover:bg-[#18448D]/90 h-12 px-6 font-semibold transition-all hover:scale-105"
                        >
                          {isValidatingDiscount ? 'Validating...' : 'Apply'}
                        </Button>
                      </div>
                      {discountError && (
                        <p className="text-sm text-red-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          {discountError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-base font-bold text-green-900">
                              {discountCode.code} Applied!
                            </p>
                            <p className="text-sm text-green-700">
                              {discountCode.discountPercentage}% discount on your order
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveDiscount}
                          className="text-red-600 hover:text-red-700 hover:bg-red-100 font-semibold"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t-2 border-gray-200 pt-6 mt-6 space-y-3">
                  <div className="flex justify-between items-center text-base">
                    <span className="text-gray-700 font-medium">Subtotal</span>
                    <span className="text-gray-900 font-semibold">
                      {usd((subtotalCents - minOrderAdjustmentCents) / 100)}
                    </span>
                  </div>
                  {showMinOrderAdjustment && (
                    <div className="flex justify-between items-center text-base">
                      <span className="text-gray-700 font-medium">Minimum order adjustment</span>
                      <span className="text-gray-900 font-semibold">
                        {usd(minOrderAdjustmentCents / 100)}
                      </span>
                    </div>
                  )}
                  {/* Single "Best Discount Wins" line - no stacking */}
                  {resolvedDiscount.appliedDiscountAmountCents > 0 && (
                    <div className="bg-green-50 -mx-6 px-6 py-2 rounded-lg space-y-1">
                      <div className="flex justify-between items-center text-base">
                        <span className="text-green-700 font-medium flex items-center gap-1.5">
                          <Tag className="h-4 w-4" />
                          {resolvedDiscount.appliedDiscountLabel}
                        </span>
                        <span className="text-green-700 font-bold">
                          -{usd(resolvedDiscount.appliedDiscountAmountCents / 100)}
                        </span>
                      </div>
                      {resolvedDiscount.helperMessage && (
                        <p className="text-xs text-gray-500 italic">{resolvedDiscount.helperMessage}</p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-center text-base">
                    <span className="text-gray-700 font-medium">{flags.freeShipping ? flags.shippingMethodLabel : 'Shipping'}</span>
                    <span className="text-green-600 font-bold flex items-center gap-1">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      FREE
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="text-gray-700 font-medium">Tax (6%)</span>
                    <span className="text-gray-900 font-semibold">
                      {usd(taxCents / 100)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t-2 border-[#18448D] pt-4 mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 -mx-6 px-6 py-4 rounded-lg">
                    <span className="text-xl font-bold text-[#18448D]">Total</span>
                    <span className="text-3xl font-bold text-[#18448D]">
                      {usd(totalCents / 100)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shipping Info */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 shadow-md">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Truck className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-green-900 text-lg mb-2">🎉 FREE Next-Day Air Shipping!</h3>
                    <p className="text-green-800 text-base leading-relaxed">
                      Your order ships completely FREE via next-day air. After payment, we'll provide tracking information for your shipment.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Minimum Order Warning */}
            {!canProceed && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-amber-800 mb-2">Minimum Order Required</h3>
                    <p className="text-amber-700 mb-4">{minimumOrderValidation.message}</p>
                    {minimumOrderValidation.suggestions.length > 0 && (
                      <div className="bg-amber-100 rounded-lg p-4">
                        <p className="font-medium text-amber-800 mb-2">Suggestions to reach minimum:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-amber-700">
                          {minimumOrderValidation.suggestions.slice(0, 3).map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Payment */}
            <div className="space-y-6 w-full">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transition-shadow hover:shadow-xl lg:sticky lg:top-4">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-[#18448D]">Payment</h2>
                  <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-bold text-green-700">Secure</span>
                  </div>
                </div>
                
                <PayPalCheckout disabled={!canProceed}
                  total={totalCents}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </div>

              {/* User Info */}
              {user && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#18448D] to-[#2563eb] rounded-full flex items-center justify-center shadow-md">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-[#18448D] text-lg">Account</h3>
                  </div>
                  <p className="text-gray-700 font-semibold mb-1">{user.email}</p>
                  <p className="text-sm text-gray-600">
                    Order will be saved to your account
                  </p>
                </div>
              )}

              {!user && (
                <div className="bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full flex items-center justify-center shadow-md">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900 text-lg">Guest Checkout</h3>
                  </div>
                  <p className="text-gray-700 text-base mb-4 leading-relaxed">
                    You're checking out as a guest. Create an account to track your orders and reorder easily.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowSignUpModal(true)}
                      className="text-[#18448D] border-slate-200 hover:bg-slate-100 text-sm"
                      size="sm"
                    >
                      Create Account
                    </Button>
                    <Button
                      variant="link"
                      onClick={async () => {
                        // CRITICAL FIX: Ensure cart is synced to database before navigating to sign-in
                        const guestSessionId = cartSyncService.getSessionId();
                        console.log('🛒 CHECKOUT: Preparing to save guest cart before sign-in', {
                          guestSessionId: guestSessionId ? `${guestSessionId.substring(0, 12)}...` : 'none',
                          itemCount: items.length
                        });
                        
                        // Sync cart to database (this ensures all items are saved)
                        if (items.length > 0) {
                          await syncToServer();
                          console.log('✅ CHECKOUT: Guest cart synced to database via syncToServer');
                        }
                        
                        // Set checkout context
                        setCheckoutContext('/checkout', guestSessionId);
                        
                        // Navigate to sign-in
                        navigate('/sign-in?from=checkout&next=/checkout');
                      }}
                      className="p-0 h-auto text-[#18448D] underline text-sm"
                    >
                      Sign In
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sign-up Encouragement Modal */}
      <SignUpEncouragementModal
        isOpen={showSignUpModal}
        onClose={() => setShowSignUpModal(false)}
        onContinueAsGuest={() => {
          // User chose to continue as guest, don't show modal again
          setHasShownModal(true);
        }}
      />
    </Layout>
  );
};

export default Checkout;
