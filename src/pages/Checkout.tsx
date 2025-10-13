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
import { ArrowLeft, Package, Truck, Plus, Minus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/lib/api';
import { CartItem } from '@/store/cart';
import BannerThumbnail from '@/components/cart/BannerThumbnail';

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items, clearCart, getSubtotalCents, getTaxCents, getTotalCents, updateQuantity, removeItem } = useCartStore();
  const { user } = useAuth();
  const [isAdminUser, setIsAdminUser] = useState(false);  const { toast } = useToast();
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);

  // Get totals from cart store methods
  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();
  

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

  // Redirect if cart is empty
  if (items.length === 0) {
    return (
      <Layout>
        <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">Your cart is empty</h2>
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
      <div className="bg-gray-50 py-8 min-h-[calc(100vh-4rem)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Checkout</h1>
            <p className="text-gray-600 mt-2">Review your order and complete payment</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Order Summary */}
            <div className="space-y-6 w-full">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>
                
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
                    <div key={item.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                      <div className="flex gap-3 mb-3">
                        {/* Thumbnail */}
                        <BannerThumbnail
                          key={item.id}
                          fileUrl={item.file_url}
                          aiDesignUrl={item.aiDesign?.assets?.proofUrl}
                          isPdf={item.is_pdf}
                          textElements={item.text_elements}
                          widthIn={item.width_in}
                          heightIn={item.height_in}
                          className="w-20 h-20 sm:w-24 sm:h-24"
                        />
                        
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0 overflow-hidden">
                          <h3 className="font-medium text-gray-900 break-words">
                            Custom Banner {formatDimensions(item.width_in, item.height_in)}
                          </h3>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p className="break-words">Material: {item.material}</p>
                            <p className="break-words">Grommets: {item.grommets}</p>
                            {item.rope_feet > 0 && <p className="break-words">Rope: {item.rope_feet.toFixed(1)} ft</p>}
                            {item.pole_pockets && item.pole_pockets !== "none" && <p className="break-words">Pole Pockets: {item.pole_pockets}</p>}
                            {item.file_name && (
                              <p className="break-all overflow-hidden" title={item.file_name}>
                                File: {item.file_name}
                              </p>
                            )}
                          </div>
                          
                          {/* Cost Breakdown */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base banner:</span>
                                <span className="text-gray-900">{usd(item.unit_price_cents / 100)} × {item.quantity}</span>
                              </div>
                              {ropeCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rope{ropeMode === 'per_item' && item.rope_feet ? ` (${item.rope_feet.toFixed(1)}ft)` : ''}:</span>
                                  <span className="text-gray-900">
                                    {ropeMode === 'per_item'
                                      ? `${usd(ropeEach / 100)} × ${item.quantity} = ${usd(ropeCost / 100)}`
                                      : usd(ropeCost / 100)
                                    }
                                  </span>
                                </div>
                              )}
                              {item.pole_pockets !== "none" && pocketCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pole pockets:</span>
                                  <span className="text-gray-900">
                                    {pocketMode === 'per_item'
                                      ? `${usd(pocketEach / 100)} × ${item.quantity} = ${usd(pocketCost / 100)}`
                                      : usd(pocketCost / 100)
                                    }
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                                <span className="text-gray-900">Line total:</span>
                                <span className="text-gray-900">{usd(item.line_total_cents / 100)}</span>
                              </div>
                            </div>
                          </div>
                            </div>
                            <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {usd(item.line_total_cents / 100)}
                          </p>
                          <p className="text-sm text-gray-600">
                            {usd(eachCents / 100)} each
                          </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls and Remove Button */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-gray-700">Quantity:</span>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDecreaseQuantity(item.id)}
                              disabled={item.quantity <= 1}
                              className="h-8 w-8 p-0"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleIncreaseQuantity(item.id)}
                              disabled={item.quantity >= 999}
                              className="h-8 w-8 p-0"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  );})}
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Subtotal</span>
                    <span className="text-gray-900">
                      {usd((subtotalCents - minOrderAdjustmentCents) / 100)}
                    </span>
                  </div>
                  {showMinOrderAdjustment && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Minimum order adjustment</span>
                      <span className="text-gray-900">
                        {usd(minOrderAdjustmentCents / 100)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">{flags.freeShipping ? flags.shippingMethodLabel : 'Shipping'}</span>
                    <span className="text-green-600 font-semibold">FREE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Tax (6%)</span>
                    <span className="text-gray-900">
                      {usd(taxCents / 100)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-2xl font-bold text-gray-900">
                      {usd(totalCents / 100)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shipping Info */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-start space-x-3">
                  <Truck className="h-6 w-6 text-green-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-green-900">🎉 FREE Next-Day Air Shipping!</h3>
                    <p className="text-green-800 text-sm mt-1">
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
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Payment</h2>
                
                <PayPalCheckout disabled={!canProceed}
                  total={totalCents}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </div>

              {/* User Info */}
              {user && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Account</h3>
                  <p className="text-gray-600">{user.email}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Order will be saved to your account
                  </p>
                </div>
              )}

              {!user && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-900 mb-2">Guest Checkout</h3>
                  <p className="text-blue-800 text-sm mb-3">
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
                      onClick={() => navigate('/sign-in?next=/checkout')}
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
