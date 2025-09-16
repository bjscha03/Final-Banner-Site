import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { Loader2 } from 'lucide-react';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string) => void;
  onError: (error: any) => void;
}

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  environment: 'sandbox' | 'live' | null;
}

const PayPalCheckout: React.FC<PayPalCheckoutProps> = ({ total, onSuccess, onError }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items } = useCartStore();
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCapturingPayment, setIsCapturingPayment] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Load PayPal configuration on mount
  useEffect(() => {
    const loadPayPalConfig = async () => {
      try {
        const response = await fetch('/.netlify/functions/paypal-config');
        if (response.ok) {
          const config = await response.json();
          setPaypalConfig(config);
        } else {
          console.error('Failed to load PayPal config:', response.status);
          setPaypalConfig({ enabled: false, clientId: null, environment: null });
        }
      } catch (error) {
        console.error('Error loading PayPal config:', error);
        setPaypalConfig({ enabled: false, clientId: null, environment: null });
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadPayPalConfig();
  }, []);

  // Check if user is admin (for test pay button)
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user?.email) {
        try {
          // Check admin status via server endpoint (which reads ADMIN_TEST_PAY_ALLOWLIST)
          const response = await fetch('/.netlify/functions/check-admin-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: user.email }),
          });

          if (response.ok) {
            const result = await response.json();
            setIsAdminUser(result.isAdmin);
          } else {
            setIsAdminUser(false);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdminUser(false);
        }
      }
    };

    checkAdminStatus();
  }, [user]);

  // Admin test payment handler
  const handleTestPayment = async () => {
    try {
      setIsCreatingOrder(true);

      toast({
        title: "Test Payment Processed",
        description: "This is an admin test payment. Order will be created with test payment provider.",
      });

      // Call existing create-order endpoint with test payment
      const response = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          items: items.map(item => ({
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
          })),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onSuccess(result.id);
      } else {
        throw new Error('Test payment failed');
      }
    } catch (error) {
      console.error('Test payment error:', error);
      onError(error);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Loading state
  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading payment options...</span>
      </div>
    );
  }

  // PayPal disabled or not configured
  if (!paypalConfig?.enabled || !paypalConfig?.clientId) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm">
            <strong>PayPal Unavailable:</strong> PayPal payments are currently disabled or not configured.
            {isAdminUser && ' Use the admin test payment button below.'}
          </p>
        </div>

        {isAdminUser && (
          <Button
            onClick={handleTestPayment}
            disabled={isCreatingOrder}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg font-semibold"
            size="lg"
          >
            {isCreatingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing Test Payment...
              </>
            ) : (
              `Admin Test Pay $${(total / 100).toFixed(2)}`
            )}
          </Button>
        )}
      </div>
    );
  }

  // PayPal order creation handler
  const handleCreateOrder = async () => {
    try {
      setIsCreatingOrder(true);

      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items.map(item => ({
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
          })),
          email: user?.email || `guest-${Date.now()}@bannersonthefly.com`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create PayPal order');
      }

      const result = await response.json();
      return result.paypalOrderId;
    } catch (error) {
      console.error('PayPal create order error:', error);
      throw error;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // PayPal order approval handler
  const handleApprove = async (data: any) => {
    try {
      setIsCapturingPayment(true);

      // First capture the PayPal payment
      const captureResponse = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ orderID: data.orderID }),
      });
      const captureResult = await captureResponse.json().catch(()=> ({}));
      if (!captureResponse.ok || !captureResult?.ok) {
        console.error('Payment capture error:', captureResult || captureResponse.status);
        alert(`Payment failed: ${captureResult?.error || 'Unknown error'}\nStatus: ${captureResponse.status}`);
        return;
      }

      // Now create the database order
      const orderResponse = await fetch('/.netlify/functions/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id || null,
          email: user?.email || captureResult.paypalData?.payer?.email_address || `guest-${Date.now()}@bannersonthefly.com`,
          subtotal_cents: total,
          tax_cents: Math.round(total * 0.06),
          total_cents: total,
          currency: 'usd',
          paypal_order_id: data.orderID,
          paypal_capture_id: captureResult.paypalData?.id,
          items: items.map(item => ({
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
          })),
        }),
      });

      const orderResult = await orderResponse.json();
      if (!orderResponse.ok || !orderResult?.ok) {
        console.error('Order creation error:', orderResult);
        // Payment succeeded but order creation failed - still show success but log error
        console.error('PayPal payment succeeded but database order creation failed');
      }

      toast({
        title: "Payment Successful!",
        description: `Payment of $${(total / 100).toFixed(2)} has been processed.`,
      });

      // Use database order ID if available, otherwise PayPal order ID
      const orderId = orderResult?.orderId || data.orderID;
      onSuccess(orderId);
    } catch (e: any) {
      console.error('Payment exception:', e);
      alert('Network error capturing payment. Please try again.');
      onError(e);
    } finally {
      setIsCapturingPayment(false);
    }
  };

  const initialOptions = {
    clientId: paypalConfig.clientId!,
    currency: "USD",
    intent: "capture" as const,
    commit: true,
  };

  return (
    <div className="space-y-4">
      {/* Loading states */}
      {(isCreatingOrder || isCapturingPayment) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-blue-800 text-sm">
              {isCreatingOrder && "Preparing your order..."}
              {isCapturingPayment && "Processing payment..."}
            </span>
          </div>
        </div>
      )}

      <PayPalScriptProvider options={initialOptions}>
        <PayPalButtons
          style={{
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "paypal",
          }}
          disabled={isCreatingOrder || isCapturingPayment}
          createOrder={async (data, actions) => {
            const paypalOrderId = await handleCreateOrder();
            return paypalOrderId;
          }}
          onApprove={handleApprove}
          onError={(error) => {
            console.error('PayPal error:', error);
            toast({
              title: "Payment Error",
              description: "Payment could not be completed. Your card was not charged.",
              variant: "destructive",
            });
            onError(error);
          }}
          onCancel={() => {
            toast({
              title: "Payment Cancelled",
              description: "You cancelled the payment. Your order was not created.",
            });
          }}
        />
      </PayPalScriptProvider>

      {/* Admin Test Pay Button */}
      {isAdminUser && (
        <div className="border-t pt-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
            <p className="text-gray-700 text-sm">
              <strong>Admin Access:</strong> You can use the test payment button below to create orders without processing real payments.
            </p>
          </div>

          <Button
            onClick={handleTestPayment}
            disabled={isCreatingOrder || isCapturingPayment}
            variant="outline"
            className="w-full border-green-300 text-green-700 hover:bg-green-50"
            size="lg"
          >
            {isCreatingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing Test Payment...
              </>
            ) : (
              `Admin Test Pay $${(total / 100).toFixed(2)}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PayPalCheckout;
