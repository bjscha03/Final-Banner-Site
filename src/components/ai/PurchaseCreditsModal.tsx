/**
 * Purchase Credits Modal
 * 
 * Allows users to purchase AI generation credits via PayPal
 */

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Sparkles, Check, Loader2, X } from 'lucide-react';
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
}

export const PurchaseCreditsModal: React.FC<PurchaseCreditsModalProps> = ({
  open,
  onOpenChange,
  userId,
  userEmail,
  onPurchaseComplete,
}) => {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const { toast } = useToast();

  // Listen for custom event to show receipt (works in PayPal callback context)
  useEffect(() => {
    const handleShowReceipt = (event: any) => {
      console.log('🎯 Custom event received: show-credit-receipt', event.detail);
      const receiptData = event.detail;
      
      // Validate receipt data
      if (!receiptData || !receiptData.id) {
        console.error('❌ Invalid receipt data received:', receiptData);
        return;
      }
      
      console.log('📋 Setting purchase data:', receiptData);
      setPurchaseData(receiptData);
      
      // Use setTimeout to ensure state update completes before opening modal
      setTimeout(() => {
        console.log('✅ Opening receipt modal');
        setShowReceipt(true);
      }, 50);
      
      console.log('✅ Receipt modal will open after state update');
      // DO NOT close purchase modal - let user close receipt manually
    };

    window.addEventListener('show-credit-receipt', handleShowReceipt);
    console.log('👂 Listening for show-credit-receipt event');

    return () => {
      window.removeEventListener('show-credit-receipt', handleShowReceipt);
      console.log('🔇 Stopped listening for show-credit-receipt event');
    };
  }, []);  // Only cleanup on unmount, not when modal state changes

  

  // Load PayPal SDK
  useEffect(() => {
    if (!open) return;

    const script = document.getElementById('paypal-sdk');
    if (script) {
      setPaypalLoaded(true);
      return;
    }

    const newScript = document.createElement('script');
    newScript.id = 'paypal-sdk';
    newScript.src = `https://www.paypal.com/sdk/js?client-id=${import.meta.env.VITE_PAYPAL_CLIENT_ID || 'test'}&currency=USD`;
    newScript.async = true;
    newScript.onload = () => setPaypalLoaded(true);
    document.body.appendChild(newScript);
  }, [open]);

  // Show receipt modal when purchaseData is set
  // SIMPLIFIED: Just show receipt whenever purchaseData becomes truthy
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



  const handlePurchase = async (pkg: CreditPackage) => {
    // Check if user is authenticated
    if (!userId || userId === 'null' || userId === 'undefined') {
      console.error('❌ User not authenticated, cannot purchase credits');
      toast({
        title: '🔒 Authentication Required',
        description: 'Please sign up or log in to purchase AI credits.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      onOpenChange(false);
      // TODO: Redirect to login/signup page
      return;
    }

    setSelectedPackage(pkg);
    setIsProcessing(true);

    try {
      // Create PayPal order
      const createResponse = await fetch('/.netlify/functions/paypal-create-credits-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail,
          credits: pkg.credits,
          amountCents: Math.round(pkg.price * 100),
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create payment order');
      }

      const { orderID } = await createResponse.json();

      // Initialize PayPal buttons
      if (window.paypal) {
        const container = document.getElementById('paypal-button-container');
        if (container) {
          container.innerHTML = ''; // Clear previous buttons

          window.paypal.Buttons({
            createOrder: () => orderID,
            onApprove: async (data: any) => {
              try {
                console.log('🔄 Capturing PayPal payment...', data.orderID);
                // Capture the payment
                const captureResponse = await fetch('/.netlify/functions/paypal-capture-credits-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderID: data.orderID,
                    userId,
                    email: userEmail,
                    credits: pkg.credits,
                    amountCents: Math.round(pkg.price * 100),
                  }),
                });
                console.log('📡 Backend response status:', captureResponse.status);
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
                  credits_purchased: pkg.credits,
                  amount_cents: Math.round(pkg.price * 100),
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
                  description: `${pkg.credits} credits have been added to your account.`,
                });

                // Don't set showReceipt here - let useEffect handle it after state updates
                // useEffect will handle showing receipt and closing purchase modal

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
              } finally {
                setIsProcessing(false);
              }
            },
            onError: (err: any) => {
              console.error('PayPal error:', err);
              toast({
                title: '❌ Payment Error',
                description: 'There was an error with PayPal. Please try again.',
                variant: 'destructive',
              });
              setIsProcessing(false);
            },
            onCancel: () => {
              toast({
                title: 'Payment Cancelled',
                description: 'You cancelled the payment.',
              });
              setIsProcessing(false);
            },
          }).render('#paypal-button-container');
        }
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast({
        title: '❌ Error',
        description: 'Failed to initiate purchase. Please try again.',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
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
                      onClick={() => handlePurchase(pkg)}
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
                {isProcessing ? (
                  <>
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">Processing your purchase...</p>
                    <p className="text-sm text-gray-600">
                      {selectedPackage.credits} credits for ${selectedPackage.price.toFixed(2)}
                    </p>
                    <div id="paypal-button-container" className="mt-6"></div>
                  </>
                ) : (
                  <div id="paypal-button-container" className="mt-6"></div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
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
    </>
  );
};

export default PurchaseCreditsModal;
