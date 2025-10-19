/**
 * Purchase Credits Modal
 * 
 * Allows users to purchase AI generation credits via PayPal
 */

import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Sparkles, Check, Loader2, X } from 'lucide-react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CreditPurchaseReceipt } from '../orders/CreditPurchaseReceipt';

interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  popular?: boolean;
  savings?: string;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter',
    credits: 10,
    price: 5.00,
  },
  {
    id: 'popular',
    credits: 50,
    price: 20.00,
    popular: true,
    savings: 'Save 20%',
  },
  {
    id: 'pro',
    credits: 100,
    price: 35.00,
    savings: 'Save 30%',
  },
];

interface PurchaseCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail?: string;
  onPurchaseComplete?: () => void;
  showReceipt: boolean;
  setShowReceipt: (show: boolean) => void;
  purchaseData: any;
  setPurchaseData: (data: any) => void;
}

export const PurchaseCreditsModal: React.FC<PurchaseCreditsModalProps> = ({
  open,
  onOpenChange,
  userId,
  userEmail,
  onPurchaseComplete,
  showReceipt,
  setShowReceipt,
  purchaseData,
  setPurchaseData,
}) => {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const { toast } = useToast();

  // Use ref to store handler so it doesn't get recreated
  const receiptHandlerRef = useRef<((event: any) => void) | null>(null);

  // Listen for custom event to show receipt (works in PayPal callback context)
  useEffect(() => {
    const handleShowReceipt = (event: any) => {
      console.log('�� Custom event received: show-credit-receipt', event.detail);
      const receiptData = event.detail;
      
      // Validate receipt data
      if (!receiptData || !receiptData.id) {
        console.error('❌ Invalid receipt data received:', receiptData);
        return;
      }
      
      console.log('📋 Valid receipt data received:', receiptData);
      
      // Set both states immediately - React will batch them
      setPurchaseData(receiptData);
      setShowReceipt(true);
      
      console.log('✅ Receipt modal state updated');
    };

    receiptHandlerRef.current = handleShowReceipt;
    window.addEventListener('show-credit-receipt', handleShowReceipt);
    console.log('👂 Listening for show-credit-receipt event');

    return () => {
      if (receiptHandlerRef.current) {
        window.removeEventListener('show-credit-receipt', receiptHandlerRef.current);
        console.log('🔇 Stopped listening for show-credit-receipt event');
      }
    };
  }, []);  // Only setup/cleanup on mount/unmount

  // Load PayPal configuration
  useEffect(() => {
    if (!open) return;

    const loadPayPalConfig = async () => {
      try {
        // Try to load from Netlify function first
        const response = await fetch('/.netlify/functions/paypal-config');
        if (response.ok) {
          const config = await response.json();
          if (config.enabled && config.clientId) {
            setPaypalClientId(config.clientId);
            console.log('✅ PayPal config loaded from Netlify function');
          } else {
            throw new Error('PayPal not enabled in config');
          }
        } else {
          throw new Error('Failed to load PayPal config from function');
        }
      } catch (error) {
        console.error('Error loading PayPal config from function:', error);
        // Fallback to environment variable
        const fallbackClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || 
                                 (window as any).NEXT_PUBLIC_PAYPAL_CLIENT_ID;
        if (fallbackClientId) {
          setPaypalClientId(fallbackClientId);
          console.log('✅ PayPal config loaded from environment variable');
        } else {
          console.error('❌ No PayPal client ID available');
        }
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadPayPalConfig();
  }, [open]);

  // Show receipt modal when purchaseData is set
  useEffect(() => {
    console.log('🔍 useEffect triggered - purchaseData:', purchaseData);
    console.log('🔍 useEffect triggered - showReceipt:', showReceipt);
    
    if (purchaseData) {
      console.log('🎫 purchaseData is truthy, showing receipt modal...');
      console.log('📋 Purchase data for receipt:', purchaseData);
      
      // Always show receipt when purchaseData is set
      if (!showReceipt) {
        console.log('✅ Setting showReceipt to true');
        setShowReceipt(true);
        console.log('✅ Receipt modal opened');
        
        // Close purchase modal after receipt is shown
        setTimeout(() => {
          console.log('🔄 Closing purchase modal after receipt is displayed');
          onOpenChange(false);
        }, 500);
      } else {
        console.log('⚠️  showReceipt is already true, skipping');
      }
    } else {
      console.log('⚠️  purchaseData is null/undefined');
    }
  }, [purchaseData]);

  const handleSelectPackage = (pkg: CreditPackage) => {
    // Check if user is authenticated
    if (!userId || userId === 'null' || userId === 'undefined') {
      console.error('❌ User not authenticated, cannot purchase credits');
      toast({
        title: '🔒 Authentication Required',
        description: 'Please sign up or log in to purchase AI credits.',
        variant: 'destructive',
      });
      onOpenChange(false);
      return;
    }

    console.log('📦 Package selected:', pkg);
    setSelectedPackage(pkg);
    setIsProcessing(true);
  };

  const handleCreateOrder = async () => {
    if (!selectedPackage) {
      throw new Error('No package selected');
    }

    console.log('🔄 Creating PayPal order for credits...');
    
    try {
      const response = await fetch('/.netlify/functions/paypal-create-credits-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail,
          credits: selectedPackage.credits,
          amountCents: Math.round(selectedPackage.price * 100),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to create order:', response.status, errorText);
        throw new Error('Failed to create payment order');
      }

      const { orderID } = await response.json();
      console.log('✅ PayPal order created:', orderID);
      return orderID;
    } catch (error) {
      console.error('❌ Create order error:', error);
      toast({
        title: '❌ Error',
        description: 'Failed to initiate purchase. Please try again.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      setSelectedPackage(null);
      throw error;
    }
  };

  const handleApprove = async (data: any) => {
    if (!selectedPackage) {
      console.error('❌ No package selected');
      return;
    }

    try {
      console.log('🔄 Capturing PayPal payment...', data.orderID);
      
      const captureResponse = await fetch('/.netlify/functions/paypal-capture-credits-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderID: data.orderID,
          userId,
          email: userEmail,
          credits: selectedPackage.credits,
          amountCents: Math.round(selectedPackage.price * 100),
        }),
      });

      console.log('📡 Backend response status:', captureResponse.status);

      if (!captureResponse.ok) {
        const errorText = await captureResponse.text();
        console.error('❌ Backend capture failed:', captureResponse.status, errorText);
        
        toast({
          title: "Payment Processing Error",
          description: `Backend error: ${captureResponse.status}. Check console for details.`,
          variant: "destructive"
        });
        
        throw new Error(`Backend capture failed: ${captureResponse.status}`);
      }

      const result = await captureResponse.json();
      console.log('📦 Capture response:', result);
      console.log('✅ Payment captured successfully:', result);

      console.log('🧾 Preparing receipt data...');
      
      // Store purchase data for receipt
      const receiptData = {
        id: result.purchaseId,
        credits_purchased: selectedPackage.credits,
        amount_cents: Math.round(selectedPackage.price * 100),
        paypal_capture_id: result.purchaseId,
        customer_name: userEmail || 'Customer',
        email: userEmail || '',
        created_at: new Date().toISOString(),
      };
      
      console.log('📋 Receipt data prepared:', receiptData);
      
      // Dispatch custom event (works in PayPal callback context)
      console.log('🚀 Dispatching show-credit-receipt event');
      const event = new CustomEvent('show-credit-receipt', {
        detail: receiptData,
        bubbles: true,
      });
      window.dispatchEvent(event);
      console.log('✅ Event dispatched successfully');
      
      toast({
        title: '✅ Credits Purchased!',
        description: `${selectedPackage.credits} credits have been added to your account.`,
      });

      // Reset processing state and selected package
      setIsProcessing(false);
      setSelectedPackage(null);

      // Refresh credits
      if (onPurchaseComplete) {
        onPurchaseComplete();
      }
    } catch (error) {
      console.error('Payment capture error:', error);
      toast({
        title: '❌ Payment Failed',
        description: 'There was an error processing your payment. Please try again.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      setSelectedPackage(null);
    }
  };

  const handleError = (err: any) => {
    console.error('PayPal error:', err);
    toast({
      title: '❌ Payment Error',
      description: 'There was an error with PayPal. Please try again.',
      variant: 'destructive',
    });
    setIsProcessing(false);
    setSelectedPackage(null);
  };

  const handleCancel = () => {
    toast({
      title: 'Payment Cancelled',
      description: 'You cancelled the payment.',
    });
    setIsProcessing(false);
    setSelectedPackage(null);
  };

  const paypalInitialOptions = paypalClientId ? {
    clientId: paypalClientId,
    currency: "USD",
    intent: "capture" as const,
    commit: true,
    vault: false,
  } : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <ShoppingCart className="w-6 h-6 text-blue-600" />
              Purchase AI Credits
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {!selectedPackage ? (
              <>
                <p className="text-gray-600 mb-6">
                  Choose a credit package to continue generating AI banner images
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CREDIT_PACKAGES.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`relative border-2 rounded-lg p-6 cursor-pointer transition-all hover:shadow-lg ${
                        pkg.popular
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-400'
                      }`}
                      onClick={() => handleSelectPackage(pkg)}
                    >
                      {pkg.popular && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                          MOST POPULAR
                        </div>
                      )}

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Sparkles className="w-5 h-5 text-blue-600" />
                          <span className="text-3xl font-bold">{pkg.credits}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">Credits</p>

                        <div className="text-2xl font-bold text-gray-900 mb-2">
                          ${pkg.price.toFixed(2)}
                        </div>

                        {pkg.savings && (
                          <div className="text-sm font-medium text-green-600 mb-4">
                            {pkg.savings}
                          </div>
                        )}

                        <div className="text-xs text-gray-500">
                          ${(pkg.price / pkg.credits).toFixed(2)} per credit
                        </div>
                      </div>

                      <Button
                        className="w-full mt-4"
                        variant={pkg.popular ? 'default' : 'outline'}
                      >
                        Select Package
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">What you get:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Premium quality AI-generated images
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Credits never expire
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      Instant delivery after payment
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">Processing your purchase...</p>
                <p className="text-sm text-gray-600 mb-6">
                  {selectedPackage.credits} credits for ${selectedPackage.price.toFixed(2)}
                </p>

                {isLoadingConfig ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Loading payment options...</span>
                  </div>
                ) : !paypalInitialOptions ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-amber-800 text-sm">
                      <strong>PayPal Unavailable:</strong> PayPal payments are currently not configured.
                      Please contact support.
                    </p>
                  </div>
                ) : (
                  <PayPalScriptProvider options={paypalInitialOptions}>
                    <div className="max-w-md mx-auto">
                      <PayPalButtons
                        style={{
                          layout: "vertical",
                          color: "blue",
                          shape: "rect",
                          label: "paypal",
                        }}
                        createOrder={handleCreateOrder}
                        onApprove={handleApprove}
                        onError={handleError}
                        onCancel={handleCancel}
                      />
                    </div>
                  </PayPalScriptProvider>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit Purchase Receipt Modal - Only render when purchaseData exists */}
      {purchaseData && (
        <CreditPurchaseReceipt
          open={showReceipt}
          onOpenChange={(open) => {
            console.log('📋 Receipt onOpenChange:', open);
            setShowReceipt(open);
            if (!open) {
              // User closed receipt, also close purchase modal
              console.log('🔄 Receipt closed, closing purchase modal');
              onOpenChange(false);
            }
          }}
          purchase={purchaseData}
        />
      )}
    </>
  );
};

export default PurchaseCreditsModal;
