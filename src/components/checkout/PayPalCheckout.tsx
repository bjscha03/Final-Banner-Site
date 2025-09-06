import React from 'react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface PayPalCheckoutProps {
  total: number;
  onSuccess: (orderId: string) => void;
  onError: (error: any) => void;
}

const PayPalCheckout: React.FC<PayPalCheckoutProps> = ({ total, onSuccess, onError }) => {
  const { toast } = useToast();
  const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  // Development mode fallback
  const handleDevPayment = () => {
    toast({
      title: "Test Payment Processed",
      description: "This is a development mode payment. In production, PayPal would process the payment.",
    });
    
    // Simulate successful payment with a fake order ID
    const fakeOrderId = 'dev_' + Math.random().toString(36).substr(2, 9);
    onSuccess(fakeOrderId);
  };

  // If no PayPal client ID, show development mode button
  if (!paypalClientId) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm">
            <strong>Development Mode:</strong> PayPal is not configured. 
            Use the test payment button below.
          </p>
        </div>
        
        <Button 
          onClick={handleDevPayment}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold"
          size="lg"
        >
          Test Pay ${(total / 100).toFixed(2)} (Dev Mode)
        </Button>
      </div>
    );
  }

  const initialOptions = {
    clientId: paypalClientId,
    currency: "USD",
    intent: "capture",
  };

  return (
    <PayPalScriptProvider options={initialOptions}>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            <strong>Secure Payment:</strong> Your payment is processed securely through PayPal.
          </p>
        </div>

        <PayPalButtons
          style={{
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "paypal",
          }}
          createOrder={(data, actions) => {
            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: (total / 100).toFixed(2),
                    currency_code: "USD",
                  },
                  description: "Custom Banner Order - Banners On The Fly",
                },
              ],
            });
          }}
          onApprove={async (data, actions) => {
            try {
              if (!actions.order) {
                throw new Error('Order actions not available');
              }

              const details = await actions.order.capture();
              
              toast({
                title: "Payment Successful!",
                description: `Payment of $${(total / 100).toFixed(2)} has been processed.`,
              });

              onSuccess(details.id);
            } catch (error) {
              console.error('PayPal payment error:', error);
              onError(error);
            }
          }}
          onError={(error) => {
            console.error('PayPal error:', error);
            toast({
              title: "Payment Error",
              description: "There was an error processing your payment. Please try again.",
              variant: "destructive",
            });
            onError(error);
          }}
          onCancel={() => {
            toast({
              title: "Payment Cancelled",
              description: "Your payment was cancelled. You can try again when ready.",
            });
          }}
        />
      </div>
    </PayPalScriptProvider>
  );
};

export default PayPalCheckout;
