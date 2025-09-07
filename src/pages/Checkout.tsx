import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { useAuth, getCurrentUser } from '@/lib/auth';
import { getOrdersAdapter } from '../lib/orders/adapter';
import { OrderItem } from '../lib/orders/types';

import { usd, formatDimensions } from '@/lib/pricing';
import Layout from '@/components/Layout';
import PayPalCheckout from '@/components/checkout/PayPalCheckout';
import SignUpEncouragementModal from '@/components/checkout/SignUpEncouragementModal';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, Truck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { items, clearCart, getSubtotalCents, getTaxCents, getTotalCents } = useCartStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);

  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();

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

      // Create order
      const ordersAdapter = getOrdersAdapter();
      console.log('Orders adapter obtained:', ordersAdapter);
      console.log('Adapter create method:', typeof ordersAdapter.create);

      if (typeof ordersAdapter.create !== 'function') {
        throw new Error('Orders adapter create method is not a function. Adapter type: ' + typeof ordersAdapter);
      }

      const order = await ordersAdapter.create({
        user_id: currentUser?.id || null,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: 'usd',
        items: orderItems,
      });

      // Send confirmation email if user has email (via API route)
      if (currentUser?.email) {
        try {
          await fetch('/api/admin/resend-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id })
          });
        } catch (error) {
          console.error('Error sending confirmation email:', error);
          // Don't block the flow if email fails
        }
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
                    <div key={item.id} className="flex justify-between items-start border-b border-gray-200 pb-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          Custom Banner {formatDimensions(item.width_in, item.height_in)}
                        </h3>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Material: {item.material}</p>
                          <p>Grommets: {item.grommets}</p>
                          {item.rope_feet > 0 && <p>Rope: {item.rope_feet.toFixed(1)} ft</p>}
                          <p>Quantity: {item.quantity}</p>
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
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Subtotal</span>
                    <span className="text-gray-900">
                      {usd(subtotalCents / 100)}
                    </span>
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
