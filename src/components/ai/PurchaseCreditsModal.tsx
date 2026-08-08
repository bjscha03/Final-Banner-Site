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
import { authorizedHeaders } from '@/lib/serverAuth';

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

const createCheckoutKey = () => {
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error('Secure payment session generation is unavailable in this browser.');
  }
  const bytes = new Uint8Array(32);
  cryptoProvider.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

type CreditPaymentBindingStatus = 'creating' | 'authorizing' | 'capture_requested' | 'verifying';

interface CreditPaymentBinding {
  version: 1;
  userId: string;
  packageId: string;
  checkoutKey: string;
  purchaseId: string | null;
  orderID: string | null;
  status: CreditPaymentBindingStatus;
}

const bindingStorageKey = (userId: string) => `botf:credit-paypal:v1:${userId}`;

const clearCreditPaymentBinding = (userId: string) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(bindingStorageKey(userId));
  } catch {
    // A clear is best-effort after a definitive terminal state. Storage writes
    // still fail closed before any new provider order can be requested.
  }
};

const readCreditPaymentBinding = (userId: string): CreditPaymentBinding | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(bindingStorageKey(userId));
    if (!raw) return null;
    const binding = JSON.parse(raw) as Partial<CreditPaymentBinding>;
    if (binding.version !== 1
        || binding.userId !== userId
        || !CREDIT_PACKAGES.some((pkg) => pkg.id === binding.packageId)
        || !/^[A-Za-z0-9_-]{32,128}$/.test(String(binding.checkoutKey || ''))
        || !['creating', 'authorizing', 'capture_requested', 'verifying'].includes(String(binding.status))) {
      clearCreditPaymentBinding(userId);
      return null;
    }
    return binding as CreditPaymentBinding;
  } catch {
    clearCreditPaymentBinding(userId);
    return null;
  }
};

const writeCreditPaymentBinding = (binding: CreditPaymentBinding) => {
  window.sessionStorage.setItem(bindingStorageKey(binding.userId), JSON.stringify(binding));
};

const wait = (milliseconds: number) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

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
  const [verificationPending, setVerificationPending] = useState(false);
  const [hydratedBindingUserId, setHydratedBindingUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const checkoutKeyRef = useRef('');
  const purchaseIdRef = useRef<string | null>(null);
  const paypalOrderIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);
  const verificationPendingRef = useRef(false);
  const paymentBindingRef = useRef<CreditPaymentBinding | null>(null);
  const recoveryStartedRef = useRef(false);
  const recoveryPollRef = useRef<(() => Promise<void>) | null>(null);
  const recoveryErrorRef = useRef<((error: unknown) => void) | null>(null);

  const setVerificationLocked = (locked: boolean) => {
    verificationPendingRef.current = locked;
    setVerificationPending(locked);
  };

  const persistBinding = (status: CreditPaymentBindingStatus) => {
    if (!selectedPackage || !checkoutKeyRef.current) return;
    const binding: CreditPaymentBinding = {
      version: 1,
      userId,
      packageId: selectedPackage.id,
      checkoutKey: checkoutKeyRef.current,
      purchaseId: purchaseIdRef.current,
      orderID: paypalOrderIdRef.current,
      status,
    };
    paymentBindingRef.current = binding;
    writeCreditPaymentBinding(binding);
  };

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
        // This authenticated config comes from the same strict environment
        // resolver used for credit order creation and capture. Do not fall back
        // to a build-time key that could belong to a different PayPal mode.
        const response = await fetch('/.netlify/functions/paypal-create-credits-order', {
          headers: authorizedHeaders(),
        });
        if (response.ok) {
          const config = await response.json();
          if (config.enabled && config.clientId) {
            setPaypalClientId(config.clientId);
            console.log('✅ Credit PayPal config loaded');
          } else {
            throw new Error('PayPal not enabled in config');
          }
        } else {
          throw new Error('Failed to load PayPal config from function');
        }
      } catch (error) {
        console.error('Error loading PayPal config from function:', error);
        setPaypalClientId(null);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadPayPalConfig();
  }, [open]);

  // Keep one provider/order binding across modal closes, refreshes, and a lost
  // capture response. A payment that may have been approved is never replaced
  // by a fresh checkout key until the server gives a definitive retry state.
  useEffect(() => {
    if (!open) {
      setHydratedBindingUserId(null);
      return;
    }
    if (!userId) {
      setHydratedBindingUserId(userId);
      return;
    }
    recoveryStartedRef.current = false;
    const binding = readCreditPaymentBinding(userId);
    if (!binding) {
      paymentBindingRef.current = null;
      setHydratedBindingUserId(userId);
      return;
    }
    const pkg = CREDIT_PACKAGES.find((candidate) => candidate.id === binding.packageId) || null;
    if (!pkg) {
      clearCreditPaymentBinding(userId);
      setHydratedBindingUserId(userId);
      return;
    }
    paymentBindingRef.current = binding;
    checkoutKeyRef.current = binding.checkoutKey;
    purchaseIdRef.current = binding.purchaseId;
    paypalOrderIdRef.current = binding.orderID;
    paymentCompletedRef.current = false;
    setSelectedPackage(pkg);
    const locked = binding.status === 'capture_requested' || binding.status === 'verifying';
    setVerificationLocked(locked);
    setIsProcessing(locked || binding.status === 'creating');
    setHydratedBindingUserId(userId);
  }, [open, userId]);

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
    if (hydratedBindingUserId !== userId) return;
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

    try {
      checkoutKeyRef.current = createCheckoutKey();
    } catch (error) {
      toast({
        title: 'Secure checkout unavailable',
        description: error instanceof Error ? error.message : 'This browser cannot create a secure payment session.',
        variant: 'destructive',
      });
      return;
    }
    clearCreditPaymentBinding(userId);
    paymentBindingRef.current = null;
    purchaseIdRef.current = null;
    paypalOrderIdRef.current = null;
    paymentCompletedRef.current = false;
    setVerificationLocked(false);
    console.log('📦 Package selected:', pkg.id);
    setSelectedPackage(pkg);
    setIsProcessing(true);
  };

  const readPaymentResponse = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return { error: 'INVALID_PAYMENT_RESPONSE', message: 'The payment service returned an invalid response.' };
    }
  };

  const finishCreditPurchase = (result: any) => {
    const purchase = result.purchase || {};
    const receiptData = {
      id: result.purchaseId || purchase.id,
      credits_purchased: Number(result.credits ?? purchase.credits_purchased),
      amount_cents: Number(result.amountCents ?? purchase.amount_cents),
      paypal_capture_id: result.captureID || purchase.paypal_capture_id,
      customer_name: userEmail || 'Customer',
      email: purchase.email || userEmail || '',
      created_at: purchase.created_at || new Date().toISOString(),
    };
    paymentCompletedRef.current = true;
    setVerificationLocked(false);
    clearCreditPaymentBinding(userId);
    paymentBindingRef.current = null;
    recoveryStartedRef.current = false;
    setIsProcessing(false);
    setSelectedPackage(null);
    window.dispatchEvent(new CustomEvent('show-credit-receipt', {
      detail: receiptData,
      bubbles: true,
    }));
    toast({
      title: '✅ Credits Purchased!',
      description: `${receiptData.credits_purchased} credits have been added to your account.`,
    });
    onPurchaseComplete?.();
  };

  const checkCreditPayment = async (reconcileOnly: boolean) => {
    const response = await fetch('/.netlify/functions/paypal-capture-credits-order', {
      method: 'POST',
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        purchaseId: purchaseIdRef.current,
        orderID: paypalOrderIdRef.current,
        checkoutKey: checkoutKeyRef.current,
        reconcileOnly,
      }),
    });
    return { response, payload: await readPaymentResponse(response) };
  };

  const pollCreditPayment = async () => {
    setVerificationLocked(true);
    persistBinding('verifying');
    let resumeCaptureRequest = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await wait(2000);
      const { response, payload } = await checkCreditPayment(!resumeCaptureRequest);
      resumeCaptureRequest = false;
      if (response.status === 200 && payload.paymentCaptured === true && payload.captureID) {
        finishCreditPurchase(payload);
        return;
      }
      if (response.status === 202 && payload.reconciliationRequired === true) {
        // If the original browser request never reached the function, the DB has
        // no capture-start marker. Resume once through the authenticated capture
        // contract; otherwise reconciliation only repeats the already-persisted
        // deterministic PayPal request ID.
        resumeCaptureRequest = payload.captureRequestStarted === false;
        continue;
      }
      if (response.status === 422) {
        clearCreditPaymentBinding(userId);
        paymentBindingRef.current = null;
        purchaseIdRef.current = null;
        paypalOrderIdRef.current = null;
        checkoutKeyRef.current = createCheckoutKey();
        setVerificationLocked(false);
      }
      {
        throw Object.assign(new Error(payload.message || 'Credit payment verification failed.'), {
          code: payload.error,
        });
      }
    }
    setIsProcessing(false);
    setVerificationLocked(true);
    toast({
      title: 'Payment confirmation is still in progress',
      description: 'Do not submit another payment. Your credits will appear automatically after PayPal confirmation.',
      duration: 10000,
    });
  };

  const handleCreateOrder = async () => {
    if (!selectedPackage) throw new Error('No package selected');
    if (!checkoutKeyRef.current) checkoutKeyRef.current = createCheckoutKey();
    persistBinding('creating');
    const response = await fetch('/.netlify/functions/paypal-create-credits-order', {
      method: 'POST',
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        packageId: selectedPackage.id,
        checkoutKey: checkoutKeyRef.current,
      }),
    });
    const payload = await readPaymentResponse(response);
    if (payload.purchaseId) purchaseIdRef.current = payload.purchaseId;
    if (payload.orderID) paypalOrderIdRef.current = payload.orderID;
    if (response.status === 200 && payload.paymentCaptured === true) {
      finishCreditPurchase(payload);
      return payload.orderID;
    }
    if (response.status === 202 && payload.safeToRetry === true) {
      persistBinding('creating');
      throw Object.assign(new Error(payload.message || 'PayPal order creation is still being confirmed.'), {
        code: payload.error,
        preserveAttempt: true,
      });
    }
    if (!response.ok || !payload.orderID || !payload.purchaseId) {
      if (payload.restartPayment === true && payload.retryAllowed === true) {
        clearCreditPaymentBinding(userId);
        paymentBindingRef.current = null;
      } else if (paypalOrderIdRef.current) {
        setVerificationLocked(true);
        persistBinding('verifying');
      } else {
        persistBinding('creating');
      }
      throw Object.assign(new Error(payload.message || 'Failed to initiate the credit purchase.'), {
        code: payload.error,
        preserveAttempt: payload.restartPayment !== true,
      });
    }
    persistBinding('authorizing');
    setIsProcessing(false);
    return payload.orderID;
  };

  const handleApprove = async (data: any) => {
    if (!selectedPackage || !purchaseIdRef.current || !paypalOrderIdRef.current) {
      throw new Error('The saved credit purchase is unavailable. Start a new purchase.');
    }
    if (String(data?.orderID || '') !== paypalOrderIdRef.current) {
      throw new Error('PayPal returned a different order than the saved credit purchase.');
    }

    setIsProcessing(true);
    recoveryStartedRef.current = true;
    setVerificationLocked(true);
    persistBinding('capture_requested');
    const { response, payload } = await checkCreditPayment(false);
    if (response.status === 200 && payload.paymentCaptured === true && payload.captureID) {
      finishCreditPurchase(payload);
      return;
    }
    if (response.status === 202 && payload.reconciliationRequired === true) {
      persistBinding('verifying');
      await pollCreditPayment();
      return;
    }
    if (response.status === 422) {
      clearCreditPaymentBinding(userId);
      paymentBindingRef.current = null;
      checkoutKeyRef.current = createCheckoutKey();
      purchaseIdRef.current = null;
      paypalOrderIdRef.current = null;
      setVerificationLocked(false);
    }
    throw Object.assign(new Error(payload.message || 'The credit payment could not be completed.'), {
      code: payload.error,
    });
  };

  const handleError = (err: any) => {
    if (paymentCompletedRef.current) return;
    if (verificationPendingRef.current) {
      console.warn('[CreditPurchase] PayPal callback ended while server verification remains active', err);
      persistBinding('verifying');
      setIsProcessing(false);
      toast({
        title: 'Payment confirmation is continuing',
        description: 'Do not submit another payment. We will keep checking the saved PayPal transaction.',
        duration: 10000,
      });
      return;
    }
    if (err?.preserveAttempt === true || paymentBindingRef.current?.status === 'creating') {
      console.warn('[CreditPurchase] retaining the same PayPal create attempt', err);
      setIsProcessing(false);
      toast({
        title: 'PayPal is still starting this purchase',
        description: 'Please try the PayPal button again. The same saved attempt will be reused and will not create a second charge.',
        duration: 10000,
      });
      return;
    }
    console.error('💥 PayPal error:', err);
    console.error('💥 Error details:', JSON.stringify(err, null, 2));
    
    // Parse PayPal error details for user-friendly messages
    let errorTitle = '❌ Payment Error';
    let errorDescription = 'There was an error processing your payment. Please try again.';
    
    // Check for specific PayPal error types
    if (err && typeof err === 'object') {
      // Handle INSTRUMENT_DECLINED errors (card declined, insufficient funds, etc.)
      if (err.message && err.message.includes('INSTRUMENT_DECLINED')) {
        errorTitle = '💳 Payment Declined';
        errorDescription = 'Your payment method was declined. This could be due to insufficient funds, card restrictions, or bank security measures. Please try a different payment method.';
      }
      // Handle UNPROCESSABLE_ENTITY errors
      else if (err.message && err.message.includes('UNPROCESSABLE_ENTITY')) {
        errorTitle = '⚠️ Payment Processing Error';
        errorDescription = 'The payment could not be processed. Please check your payment information and try again.';
      }
      // Handle network/connection errors
      else if (err.message && (err.message.includes('network') || err.message.includes('timeout'))) {
        errorTitle = '🌐 Connection Error';
        errorDescription = 'Unable to connect to PayPal. Please check your internet connection and try again.';
      }
      // Handle PAYPAL_CAPTURE_FAILED errors
      else if (err.message && err.message.includes('PAYPAL_CAPTURE_FAILED')) {
        errorTitle = '❌ Payment Capture Failed';
        errorDescription = 'The payment authorization succeeded but capture failed. Please contact support if you were charged.';
      }
      // Try to extract error details from PayPal's error object
      else if (err.details && Array.isArray(err.details) && err.details.length > 0) {
        const detail = err.details[0];
        if (detail.description) {
          errorDescription = detail.description;
        }
        if (detail.issue === 'INSTRUMENT_DECLINED') {
          errorTitle = '💳 Payment Declined';
          errorDescription = 'Your payment method was declined. Please try a different payment method.';
        }
      }
      // Check for error in debug_id (PayPal's error tracking)
      else if (err.debug_id) {
        errorDescription = `Payment error occurred. Debug ID: ${err.debug_id}. Please try again or contact support.`;
      }
    }
    
    console.error('🚨 Showing error to user:', { errorTitle, errorDescription });
    
    toast({
      title: errorTitle,
      description: errorDescription,
      variant: 'destructive',
      duration: 8000, // Show error longer so user can read it
    });
    
    setIsProcessing(false);
    setSelectedPackage(null);
    clearCreditPaymentBinding(userId);
    paymentBindingRef.current = null;
    checkoutKeyRef.current = createCheckoutKey();
    purchaseIdRef.current = null;
    paypalOrderIdRef.current = null;
    setVerificationLocked(false);
  };

  const handleCancel = () => {
    if (verificationPendingRef.current) {
      toast({
        title: 'Payment confirmation is continuing',
        description: 'The approved transaction remains saved. Do not submit another payment.',
      });
      return;
    }
    toast({
      title: 'Payment Cancelled',
      description: 'You cancelled the payment.',
    });
    setIsProcessing(false);
    setSelectedPackage(null);
    clearCreditPaymentBinding(userId);
    paymentBindingRef.current = null;
    checkoutKeyRef.current = createCheckoutKey();
    purchaseIdRef.current = null;
    paypalOrderIdRef.current = null;
    setVerificationLocked(false);
  };

  recoveryPollRef.current = pollCreditPayment;
  recoveryErrorRef.current = handleError;

  useEffect(() => {
    if (!open
        || !verificationPending
        || recoveryStartedRef.current
        || !purchaseIdRef.current
        || !paypalOrderIdRef.current) return;
    recoveryStartedRef.current = true;
    const poll = recoveryPollRef.current;
    if (!poll) return;
    void poll().catch((error) => recoveryErrorRef.current?.(error));
  }, [open, verificationPending]);

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
            {hydratedBindingUserId !== userId ? (
              <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Restoring secure payment session...</span>
              </div>
            ) : !selectedPackage ? (
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
                {verificationPending ? (
                  <Sparkles className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                ) : (
                  <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                )}
                <p className="text-lg font-medium mb-2">
                  {verificationPending ? 'Confirming your PayPal payment' : 'Processing your purchase...'}
                </p>
                <p className="text-sm text-gray-600 mb-6">
                  {verificationPending
                    ? 'Do not submit another payment. Your balance will update as soon as PayPal confirms the capture.'
                    : `${selectedPackage.credits} credits for $${selectedPackage.price.toFixed(2)}`}
                </p>

                {verificationPending ? (
                  <div className="max-w-md mx-auto rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status" aria-live="polite">
                    You may close this window. This purchase remains safely bound to your account and will be reconciled without another charge.
                  </div>
                ) : isLoadingConfig ? (
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
