import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { useAuth, getCurrentUser } from '@/lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { OrderItem } from '../lib/orders/types';

import { usd, formatDimensions, getFeatureFlags, getPricingOptions, computeTotals, PricingItem } from '@/lib/pricing';
import Layout from '@/components/Layout';
import PayPalCheckout from '@/components/checkout/PayPalCheckout';
import SignUpEncouragementModal from '@/components/checkout/SignUpEncouragementModal';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, Truck, Plus, Minus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { emailApi } from '@/lib/api';

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items, clearCart, getSubtotalCents, getTaxCents, getTotalCents, updateQuantity, removeItem } = useCartStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);

  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();

  // Calculate feature flag pricing details
  const flags = getFeatureFlags();
  const pricingOptions = getPricingOptions();
  let minOrderAdjustmentCents = 0;
  let showMinOrderAdjustment = false;

  if (flags.freeShipping || flags.minOrderFloor) {
    const pricingItems: PricingItem[] = items.map(item => ({ line_total_cents: item.line_total_cents }));
    const totals = computeTotals(pricingItems, 0.06, pricingOptions);
    minOrderAdjustmentCents = totals.min_order_adjustment_cents;
    showMinOrderAdjustment = minOrderAdjustmentCents > 0;
  }

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

  const handlePaymentSuccess = async (paypalOrderId: string) => {
    try {
      console.log('Payment success handler called with order ID:', paypalOrderId);

      const currentUser = await getCurrentUser();
      console.log('Current user:', currentUser);

      // Convert cart items to order items
      const orderItems: OrderItem[] = items.map(item => ({
        width_in: item.width_in,
        height_in: item.height_in,
        quantity: item.quantity,
        material: item.material,
        grommets: item.grommets,
        rope_feet: item.rope_feet,
        area_sqft: item.area_sqft,
        unit_price_cents: item.unit_price_cents,
        line_total_cents: item.line_total_cents,
        file_key: item.file_key,
      }));

      console.log('Order items prepared:', orderItems);

      // Create order with enhanced error handling
      let ordersAdapter;
      try {
        ordersAdapter = getOrdersAdapter();
        console.log('Orders adapter obtained:', ordersAdapter);
        console.log('Adapter create method:', typeof ordersAdapter.create);

        if (typeof ordersAdapter.create !== 'function') {
          throw new Error('Orders adapter create method is not a function. Adapter type: ' + typeof ordersAdapter);
        }
      } catch (adapterError) {
        console.error('Failed to get orders adapter:', adapterError);
        throw new Error('Unable to initialize order system. Please try again or contact support.');
      }

      // For guest orders, we need an email address
      let orderEmail = currentUser?.email;
      if (!orderEmail) {
        // For now, use a placeholder email for guest orders
        // TODO: Add email input field for guest checkout
        orderEmail = `guest-${Date.now()}@bannersonthefly.com`;
        console.warn('Creating guest order with placeholder email:', orderEmail);
      }

      // Create order with retry logic
      let order;
      let createAttempts = 0;
      const maxCreateAttempts = 3;

      while (createAttempts < maxCreateAttempts) {
        createAttempts++;
        console.log(`Order creation attempt ${createAttempts}/${maxCreateAttempts}`);

        try {
          order = await ordersAdapter.create({
            user_id: currentUser?.id || null,
            email: orderEmail,
            subtotal_cents: subtotalCents,
            tax_cents: taxCents,
            total_cents: totalCents,
            currency: 'usd',
            items: orderItems,
          });

          console.log('Order created successfully:', order);
          break; // Success!
        } catch (createError) {
          console.error(`Order creation attempt ${createAttempts} failed:`, createError);

          if (createAttempts === maxCreateAttempts) {
            throw createError; // Re-throw the last error
          }

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!order) {
        throw new Error('Failed to create order after multiple attempts');
      }

      // Send confirmation email (idempotent)
      try {
        await emailApi.notifyOrder(order.id);
      } catch (error) {
        console.error('Error sending confirmation email:', error);
        // Don't block the flow if email fails
      }

      // Store order data in sessionStorage for confirmation page
      sessionStorage.setItem('order_confirmation', JSON.stringify(order));

      // Clear cart
      clearCart();

      // Navigate to confirmation
      navigate(`/order-confirmation?orderId=${order.id}`);

      toast({
        title: "Order Created Successfully!",
        description: `Order #${order.id.slice(-8)} has been created.`,
      });

    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: "Order Creation Failed",
        description: "There was an error creating your order. Please contact support.",
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Order Summary */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>
                
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            Custom Banner {formatDimensions(item.width_in, item.height_in)}
                          </h3>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>Material: {item.material}</p>
                            <p>Grommets: {item.grommets}</p>
                            {item.rope_feet > 0 && <p>Rope: {item.rope_feet.toFixed(1)} ft</p>}
                            {item.file_name && <p>File: {item.file_name}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {usd(item.line_total_cents / 100)}
                          </p>
                          <p className="text-sm text-gray-600">
                            {usd(item.unit_price_cents / 100)} each
                          </p>
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
                  ))}
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
                    <span className="text-gray-900">$0</span>
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
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                <div className="flex items-start space-x-3">
                  <Truck className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">Shipping Information</h3>
                    <p className="text-blue-800 text-sm mt-1">
                      After payment, we'll contact you to arrange shipping details and provide tracking information.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Payment</h2>
                
                <PayPalCheckout
                  total={totalCents}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </div>

              {/* User Info */}
              {user && (
                <div className="bg-gray-50 rounded-2xl p-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Account</h3>
                  <p className="text-gray-600">{user.email}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Order will be saved to your account
                  </p>
                </div>
              )}

              {!user && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                  <h3 className="font-semibold text-blue-900 mb-2">Guest Checkout</h3>
                  <p className="text-blue-800 text-sm mb-3">
                    You're checking out as a guest. Create an account to track your orders and reorder easily.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowSignUpModal(true)}
                      className="text-blue-700 border-blue-300 hover:bg-blue-100 text-sm"
                      size="sm"
                    >
                      Create Account
                    </Button>
                    <Button
                      variant="link"
                      onClick={() => navigate('/sign-in?next=/checkout')}
                      className="p-0 h-auto text-blue-700 underline text-sm"
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
